#!/usr/bin/env python3
"""
Identity Resolution Engine

Sophisticated multi-pass matching system with confidence scoring for resolving
player identities across different data sources (Sleeper, ESPN, NFLverse, etc.).

Algorithm (in order of confidence):
1. Exact ID match (confidence=1.0) - sleeper_id, gsis_id, espn_id
2. Cross-reference match (confidence=0.95) - ID A known, ID B linked via nflverse
3. Deterministic name match (confidence=0.85) - name + position + birth_date
4. Fuzzy name match (confidence=0.70) - Levenshtein + position + team + draft year
5. Manual override (confidence=1.0) - from manual_overrides.json

Output: player_uid + confidence score + match_method

Usage:
    from scripts.identity.resolver import IdentityResolver

    resolver = IdentityResolver(db_path="db/players.sqlite")

    # Single resolution
    result = resolver.resolve("4046", "sleeper")
    print(result.player_uid, result.confidence, result.match_method)

    # Batch resolution
    results = resolver.batch_resolve(["4046", "1466"], "sleeper")
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

# Try importing rapidfuzz for fuzzy matching, fall back to difflib
try:
    from rapidfuzz import fuzz
    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    RAPIDFUZZ_AVAILABLE = False
    from difflib import SequenceMatcher

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"
MANUAL_OVERRIDES_PATH = PROJECT_ROOT / "data" / "manual_overrides.json"

# Type definitions
SourceType = Literal[
    "sleeper", "espn", "gsis", "sportradar", "yahoo", "pfr",
    "rotowire", "nflverse", "fantasy_data", "cbs", "fleaflicker", "mfl"
]
MatchMethodType = Literal[
    "exact", "crosswalk", "name_dob", "name_position_dob",
    "fuzzy", "manual", "inferred", "name_only"
]

# Confidence thresholds
CONFIDENCE_EXACT = 1.0
CONFIDENCE_MANUAL = 1.0
CONFIDENCE_CROSSWALK = 0.95
CONFIDENCE_NAME_POSITION_DOB = 0.85
CONFIDENCE_NAME_DOB = 0.80
CONFIDENCE_FUZZY_HIGH = 0.75
CONFIDENCE_FUZZY_MEDIUM = 0.70
CONFIDENCE_FUZZY_LOW = 0.60
CONFIDENCE_NAME_ONLY = 0.50

# Fuzzy matching thresholds
FUZZY_THRESHOLD_HIGH = 95
FUZZY_THRESHOLD_MEDIUM = 90
FUZZY_THRESHOLD_LOW = 85
FUZZY_MARGIN_REQUIRED = 5  # Second-best must be at least this much worse


@dataclass
class ResolutionResult:
    """Result of an identity resolution attempt."""
    success: bool
    player_uid: Optional[str] = None
    confidence: float = 0.0
    match_method: Optional[MatchMethodType] = None
    source: Optional[SourceType] = None
    external_id: Optional[str] = None
    canonical_name: Optional[str] = None
    # For debugging/auditing
    candidates: list[dict[str, Any]] = field(default_factory=list)
    match_details: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


@dataclass
class PlayerCandidate:
    """A potential match candidate during resolution."""
    player_uid: str
    canonical_name: str
    canonical_name_norm: str
    position: Optional[str]
    birth_date: Optional[str]
    current_nfl_team: Optional[str]
    college: Optional[str]
    nfl_debut_year: Optional[int]
    score: float = 0.0
    match_reasons: list[str] = field(default_factory=list)


def normalize_name(name: str) -> str:
    """
    Normalize a player name for matching purposes.

    Transformations:
    - Convert to lowercase
    - Remove punctuation (except spaces)
    - Remove common suffixes (Jr, Sr, II, III, IV, V)
    - Replace & with 'and'
    - Collapse multiple spaces
    """
    if not name:
        return ""

    # Convert to lowercase
    result = str(name).lower().strip()

    # Replace & with 'and'
    result = result.replace("&", "and")

    # Remove punctuation (keep spaces and alphanumeric)
    result = re.sub(r"[^\w\s]", "", result)

    # Replace hyphens with spaces
    result = result.replace("-", " ")

    # Collapse multiple spaces
    result = re.sub(r"\s+", " ", result).strip()

    # Remove common suffixes
    suffixes = {"jr", "sr", "ii", "iii", "iv", "v", "2nd", "3rd", "4th"}
    parts = result.split()
    if parts and parts[-1] in suffixes:
        parts = parts[:-1]

    return " ".join(parts)


def normalize_dob(dob: str) -> str:
    """Normalize date of birth to YYYY-MM-DD format."""
    if not dob:
        return ""
    dob = str(dob).strip()
    # Handle ISO format with time: "YYYY-MM-DDTHH:MMZ"
    return dob[:10] if len(dob) >= 10 else dob


def fuzzy_score(s1: str, s2: str) -> float:
    """
    Calculate fuzzy match score between two strings.
    Returns a value between 0 and 100.
    """
    if not s1 or not s2:
        return 0.0

    if RAPIDFUZZ_AVAILABLE:
        return fuzz.token_sort_ratio(s1, s2)
    else:
        # Fallback to difflib
        return SequenceMatcher(None, s1.lower(), s2.lower()).ratio() * 100


class IdentityResolver:
    """
    Multi-pass identity resolver for player matching.

    Implements a cascading resolution strategy:
    1. Exact ID lookup in database
    2. Cross-reference lookup via linked IDs
    3. Deterministic name + DOB + position matching
    4. Fuzzy name matching with supporting criteria
    5. Manual override lookup
    """

    def __init__(
        self,
        db_path: str | Path = DEFAULT_DB_PATH,
        manual_overrides_path: str | Path = MANUAL_OVERRIDES_PATH,
        enable_fuzzy: bool = True,
        fuzzy_threshold: int = FUZZY_THRESHOLD_MEDIUM,
        log_audit: bool = True
    ):
        """
        Initialize the resolver.

        Args:
            db_path: Path to the player identity SQLite database
            manual_overrides_path: Path to manual_overrides.json
            enable_fuzzy: Whether to use fuzzy matching as a fallback
            fuzzy_threshold: Minimum score for fuzzy matches (0-100)
            log_audit: Whether to log resolution attempts to audit table
        """
        self.db_path = Path(db_path)
        self.manual_overrides_path = Path(manual_overrides_path)
        self.enable_fuzzy = enable_fuzzy
        self.fuzzy_threshold = fuzzy_threshold
        self.log_audit = log_audit

        # Cache for manual overrides
        self._manual_overrides: Optional[dict[str, dict]] = None

        # Session ID for grouping audit entries
        self._session_id: Optional[str] = None

    def _get_connection(self) -> sqlite3.Connection:
        """Get a database connection."""
        if not self.db_path.exists():
            raise FileNotFoundError(
                f"Identity database not found: {self.db_path}. "
                "Run init_db.py --init first."
            )
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _load_manual_overrides(self) -> dict[str, dict]:
        """Load manual overrides from JSON file."""
        if self._manual_overrides is not None:
            return self._manual_overrides

        if not self.manual_overrides_path.exists():
            self._manual_overrides = {}
            return self._manual_overrides

        try:
            data = json.loads(self.manual_overrides_path.read_text())
            # Expected format: {"source:external_id": {"player_uid": "...", "note": "..."}}
            self._manual_overrides = data.get("overrides", data)
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Failed to load manual overrides: {e}")
            self._manual_overrides = {}

        return self._manual_overrides

    def _log_audit(
        self,
        conn: sqlite3.Connection,
        action: str,
        player_uid: Optional[str] = None,
        source: Optional[str] = None,
        external_id: Optional[str] = None,
        confidence: Optional[float] = None,
        match_method: Optional[str] = None,
        context: Optional[dict] = None,
        result: Optional[str] = None,
        error: Optional[str] = None
    ) -> None:
        """Log a resolution attempt to the audit table."""
        if not self.log_audit:
            return

        try:
            conn.execute("""
                INSERT INTO match_audit_log (
                    session_id, action, player_uid, source, external_id,
                    confidence, match_method, context_json, result,
                    error_message, triggered_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                self._session_id, action, player_uid, source, external_id,
                confidence, match_method,
                json.dumps(context) if context else None,
                result, error, "resolver"
            ))
        except sqlite3.Error as e:
            logger.warning(f"Failed to log audit: {e}")

    # -------------------------------------------------------------------------
    # Pass 1: Exact ID Match (confidence=1.0)
    # -------------------------------------------------------------------------

    def _exact_id_match(
        self,
        conn: sqlite3.Connection,
        source: SourceType,
        external_id: str
    ) -> Optional[ResolutionResult]:
        """
        Attempt exact ID lookup in player_identifiers table.
        This is the highest confidence match.
        """
        cursor = conn.execute("""
            SELECT p.player_uid, p.canonical_name, pi.confidence, pi.match_method
            FROM player_identifiers pi
            JOIN players p ON pi.player_uid = p.player_uid
            WHERE pi.source = ? AND pi.external_id = ?
        """, (source, str(external_id)))

        row = cursor.fetchone()
        if row:
            return ResolutionResult(
                success=True,
                player_uid=row["player_uid"],
                confidence=CONFIDENCE_EXACT,
                match_method="exact",
                source=source,
                external_id=external_id,
                canonical_name=row["canonical_name"],
                match_details={"db_confidence": row["confidence"]}
            )

        return None

    # -------------------------------------------------------------------------
    # Pass 2: Cross-Reference Match (confidence=0.95)
    # -------------------------------------------------------------------------

    def _crosswalk_match(
        self,
        conn: sqlite3.Connection,
        source: SourceType,
        external_id: str,
        source_data: Optional[dict] = None
    ) -> Optional[ResolutionResult]:
        """
        Attempt to match via cross-references.

        If source_data contains IDs from other platforms (e.g., sleeper record
        has gsis_id), check if we can match via those IDs.
        """
        if not source_data:
            return None

        # Map of common cross-reference fields
        crosswalk_fields = {
            "gsis_id": "gsis",
            "espn_id": "espn",
            "sleeper_id": "sleeper",
            "sportradar_id": "sportradar",
            "yahoo_id": "yahoo",
            "pfr_id": "pfr",
        }

        for field_name, id_source in crosswalk_fields.items():
            if id_source == source:
                continue  # Skip the source we're already trying

            cross_id = source_data.get(field_name)
            if not cross_id:
                continue

            cursor = conn.execute("""
                SELECT p.player_uid, p.canonical_name
                FROM player_identifiers pi
                JOIN players p ON pi.player_uid = p.player_uid
                WHERE pi.source = ? AND pi.external_id = ?
            """, (id_source, str(cross_id)))

            row = cursor.fetchone()
            if row:
                return ResolutionResult(
                    success=True,
                    player_uid=row["player_uid"],
                    confidence=CONFIDENCE_CROSSWALK,
                    match_method="crosswalk",
                    source=source,
                    external_id=external_id,
                    canonical_name=row["canonical_name"],
                    match_details={
                        "crosswalk_source": id_source,
                        "crosswalk_id": cross_id
                    }
                )

        return None

    # -------------------------------------------------------------------------
    # Pass 3: Deterministic Name Match (confidence=0.80-0.85)
    # -------------------------------------------------------------------------

    def _deterministic_name_match(
        self,
        conn: sqlite3.Connection,
        name: str,
        position: Optional[str] = None,
        birth_date: Optional[str] = None,
        team: Optional[str] = None
    ) -> Optional[ResolutionResult]:
        """
        Attempt deterministic matching on name + position + birth_date.

        Confidence levels:
        - name + position + DOB: 0.85
        - name + DOB: 0.80
        - name + position: 0.70 (if DOB not available)
        """
        name_norm = normalize_name(name)
        if not name_norm:
            return None

        dob_norm = normalize_dob(birth_date) if birth_date else None

        # Build query based on available data
        if dob_norm and position:
            # Highest confidence: name + position + DOB
            cursor = conn.execute("""
                SELECT player_uid, canonical_name, position, birth_date
                FROM players
                WHERE canonical_name_norm = ? AND position = ? AND birth_date = ?
            """, (name_norm, position, dob_norm))
            confidence = CONFIDENCE_NAME_POSITION_DOB
            method = "name_position_dob"
        elif dob_norm:
            # Medium confidence: name + DOB
            cursor = conn.execute("""
                SELECT player_uid, canonical_name, position, birth_date
                FROM players
                WHERE canonical_name_norm = ? AND birth_date = ?
            """, (name_norm, dob_norm))
            confidence = CONFIDENCE_NAME_DOB
            method = "name_dob"
        else:
            # Lower confidence: name + position (no DOB)
            if position:
                cursor = conn.execute("""
                    SELECT player_uid, canonical_name, position, birth_date
                    FROM players
                    WHERE canonical_name_norm = ? AND position = ?
                """, (name_norm, position))
                confidence = CONFIDENCE_FUZZY_MEDIUM
                method = "name_position"
            else:
                return None  # Need at least DOB or position

        rows = cursor.fetchall()

        if len(rows) == 1:
            row = rows[0]
            return ResolutionResult(
                success=True,
                player_uid=row["player_uid"],
                confidence=confidence,
                match_method=method,
                canonical_name=row["canonical_name"],
                match_details={
                    "input_name": name,
                    "input_name_norm": name_norm,
                    "input_position": position,
                    "input_dob": dob_norm
                }
            )
        elif len(rows) > 1:
            # Multiple matches - try to narrow down with team if available
            if team:
                for row in rows:
                    # Note: players table doesn't have current_nfl_team in query
                    # This would need additional logic
                    pass

            # Return candidates for manual review
            candidates = [
                {
                    "player_uid": r["player_uid"],
                    "canonical_name": r["canonical_name"],
                    "position": r["position"],
                    "birth_date": r["birth_date"]
                }
                for r in rows
            ]

            return ResolutionResult(
                success=False,
                confidence=0.0,
                match_method=None,
                candidates=candidates,
                match_details={
                    "reason": "multiple_matches",
                    "count": len(rows)
                }
            )

        return None

    # -------------------------------------------------------------------------
    # Pass 4: Fuzzy Name Match (confidence=0.60-0.75)
    # -------------------------------------------------------------------------

    def _fuzzy_name_match(
        self,
        conn: sqlite3.Connection,
        name: str,
        position: Optional[str] = None,
        birth_date: Optional[str] = None,
        team: Optional[str] = None,
        college: Optional[str] = None,
        draft_year: Optional[int] = None
    ) -> Optional[ResolutionResult]:
        """
        Attempt fuzzy name matching with supporting criteria.

        Uses Levenshtein distance (via rapidfuzz if available) to find
        similar names, then scores candidates based on supporting data.
        """
        if not self.enable_fuzzy:
            return None

        name_norm = normalize_name(name)
        if not name_norm:
            return None

        dob_norm = normalize_dob(birth_date) if birth_date else None

        # Get potential candidates - filter by position if available
        if position:
            cursor = conn.execute("""
                SELECT player_uid, canonical_name, canonical_name_norm,
                       position, birth_date, current_nfl_team, college, nfl_debut_year
                FROM players
                WHERE position = ?
            """, (position,))
        elif dob_norm:
            # If we have DOB, use it as a filter
            cursor = conn.execute("""
                SELECT player_uid, canonical_name, canonical_name_norm,
                       position, birth_date, current_nfl_team, college, nfl_debut_year
                FROM players
                WHERE birth_date = ?
            """, (dob_norm,))
        else:
            # No filters - expensive, limit to reasonable set
            cursor = conn.execute("""
                SELECT player_uid, canonical_name, canonical_name_norm,
                       position, birth_date, current_nfl_team, college, nfl_debut_year
                FROM players
                WHERE status = 'active'
                LIMIT 5000
            """)

        candidates: list[PlayerCandidate] = []

        for row in cursor.fetchall():
            candidate = PlayerCandidate(
                player_uid=row["player_uid"],
                canonical_name=row["canonical_name"],
                canonical_name_norm=row["canonical_name_norm"],
                position=row["position"],
                birth_date=row["birth_date"],
                current_nfl_team=row["current_nfl_team"],
                college=row["college"],
                nfl_debut_year=row["nfl_debut_year"]
            )

            # Calculate fuzzy name score
            name_score = fuzzy_score(name_norm, candidate.canonical_name_norm)
            if name_score < self.fuzzy_threshold:
                continue

            candidate.score = name_score
            candidate.match_reasons.append(f"name:{name_score:.0f}")

            # Boost score for matching supporting criteria
            if dob_norm and candidate.birth_date == dob_norm:
                candidate.score += 10
                candidate.match_reasons.append("dob_match")

            if team and candidate.current_nfl_team == team:
                candidate.score += 5
                candidate.match_reasons.append("team_match")

            if college:
                college_norm = normalize_name(college)
                if candidate.college and normalize_name(candidate.college) == college_norm:
                    candidate.score += 5
                    candidate.match_reasons.append("college_match")

            if draft_year and candidate.nfl_debut_year == draft_year:
                candidate.score += 3
                candidate.match_reasons.append("draft_year_match")

            candidates.append(candidate)

        if not candidates:
            return None

        # Sort by score descending
        candidates.sort(key=lambda c: c.score, reverse=True)

        best = candidates[0]
        runner_up = candidates[1] if len(candidates) > 1 else None

        # Check if best is clearly better than runner-up
        if runner_up and (best.score - runner_up.score) < FUZZY_MARGIN_REQUIRED:
            # Too close - return for manual review
            return ResolutionResult(
                success=False,
                confidence=0.0,
                match_method=None,
                candidates=[
                    {
                        "player_uid": c.player_uid,
                        "canonical_name": c.canonical_name,
                        "score": c.score,
                        "reasons": c.match_reasons
                    }
                    for c in candidates[:5]
                ],
                match_details={
                    "reason": "ambiguous_fuzzy_match",
                    "best_score": best.score,
                    "runner_up_score": runner_up.score,
                    "margin": best.score - runner_up.score
                }
            )

        # Determine confidence based on score
        if best.score >= FUZZY_THRESHOLD_HIGH:
            confidence = CONFIDENCE_FUZZY_HIGH
        elif best.score >= FUZZY_THRESHOLD_MEDIUM:
            confidence = CONFIDENCE_FUZZY_MEDIUM
        else:
            confidence = CONFIDENCE_FUZZY_LOW

        return ResolutionResult(
            success=True,
            player_uid=best.player_uid,
            confidence=confidence,
            match_method="fuzzy",
            canonical_name=best.canonical_name,
            match_details={
                "fuzzy_score": best.score,
                "match_reasons": best.match_reasons,
                "candidates_considered": len(candidates)
            }
        )

    # -------------------------------------------------------------------------
    # Pass 5: Manual Override (confidence=1.0)
    # -------------------------------------------------------------------------

    def _manual_override_match(
        self,
        source: SourceType,
        external_id: str
    ) -> Optional[ResolutionResult]:
        """
        Check manual overrides file for pre-defined mappings.
        """
        overrides = self._load_manual_overrides()

        key = f"{source}:{external_id}"
        override = overrides.get(key)

        if override:
            return ResolutionResult(
                success=True,
                player_uid=override.get("player_uid"),
                confidence=CONFIDENCE_MANUAL,
                match_method="manual",
                source=source,
                external_id=external_id,
                match_details={
                    "override_note": override.get("note"),
                    "override_source": "manual_overrides.json"
                }
            )

        return None

    # -------------------------------------------------------------------------
    # Public Resolution Methods
    # -------------------------------------------------------------------------

    def resolve(
        self,
        external_id: str,
        source: SourceType,
        source_data: Optional[dict] = None
    ) -> ResolutionResult:
        """
        Resolve an external ID to a player_uid.

        Args:
            external_id: The external ID to resolve
            source: The source platform (sleeper, espn, etc.)
            source_data: Optional additional data from source for better matching
                         May include: name, position, birth_date, team, college, etc.

        Returns:
            ResolutionResult with player_uid if found, or candidates if ambiguous
        """
        external_id = str(external_id)

        conn = self._get_connection()
        try:
            # Pass 5 first: Manual override (checked first since it's definitive)
            result = self._manual_override_match(source, external_id)
            if result and result.success:
                self._log_audit(
                    conn, "match_success",
                    player_uid=result.player_uid,
                    source=source,
                    external_id=external_id,
                    confidence=result.confidence,
                    match_method=result.match_method,
                    result="manual_override"
                )
                conn.commit()
                return result

            # Pass 1: Exact ID match
            result = self._exact_id_match(conn, source, external_id)
            if result and result.success:
                self._log_audit(
                    conn, "match_success",
                    player_uid=result.player_uid,
                    source=source,
                    external_id=external_id,
                    confidence=result.confidence,
                    match_method=result.match_method,
                    result="exact_id"
                )
                conn.commit()
                return result

            # Pass 2: Cross-reference match
            result = self._crosswalk_match(conn, source, external_id, source_data)
            if result and result.success:
                self._log_audit(
                    conn, "match_success",
                    player_uid=result.player_uid,
                    source=source,
                    external_id=external_id,
                    confidence=result.confidence,
                    match_method=result.match_method,
                    context=result.match_details,
                    result="crosswalk"
                )
                conn.commit()
                return result

            # Extract matching criteria from source_data
            if source_data:
                name = source_data.get("name") or source_data.get("full_name") or ""
                position = source_data.get("position")
                birth_date = source_data.get("birth_date") or source_data.get("dob")
                team = source_data.get("team") or source_data.get("nfl_team")
                college = source_data.get("college")
                draft_year = source_data.get("draft_year") or source_data.get("nfl_debut_year")
            else:
                name = position = birth_date = team = college = draft_year = None

            # Pass 3: Deterministic name match
            if name:
                result = self._deterministic_name_match(
                    conn, name, position, birth_date, team
                )
                if result:
                    if result.success:
                        self._log_audit(
                            conn, "match_success",
                            player_uid=result.player_uid,
                            source=source,
                            external_id=external_id,
                            confidence=result.confidence,
                            match_method=result.match_method,
                            context=result.match_details,
                            result="deterministic_name"
                        )
                        conn.commit()
                        return result
                    else:
                        # Multiple matches - continue to fuzzy or return
                        pass

            # Pass 4: Fuzzy name match
            if name and self.enable_fuzzy:
                result = self._fuzzy_name_match(
                    conn, name, position, birth_date, team, college, draft_year
                )
                if result:
                    if result.success:
                        self._log_audit(
                            conn, "match_success",
                            player_uid=result.player_uid,
                            source=source,
                            external_id=external_id,
                            confidence=result.confidence,
                            match_method=result.match_method,
                            context=result.match_details,
                            result="fuzzy_name"
                        )
                        conn.commit()
                        return result
                    else:
                        # Ambiguous match - log and return candidates
                        self._log_audit(
                            conn, "match_conflict",
                            source=source,
                            external_id=external_id,
                            context={
                                "candidates": result.candidates,
                                "details": result.match_details
                            },
                            result="ambiguous"
                        )
                        conn.commit()
                        return result

            # No match found
            self._log_audit(
                conn, "match_failure",
                source=source,
                external_id=external_id,
                context={"source_data": source_data},
                result="no_match"
            )
            conn.commit()

            return ResolutionResult(
                success=False,
                source=source,
                external_id=external_id,
                match_details={
                    "reason": "no_match_found",
                    "source_data": source_data
                }
            )

        finally:
            conn.close()

    def resolve_by_name(
        self,
        name: str,
        position: Optional[str] = None,
        team: Optional[str] = None,
        birth_date: Optional[str] = None,
        season: Optional[int] = None
    ) -> ResolutionResult:
        """
        Resolve a player by name and optional criteria.

        Args:
            name: Player name to match
            position: Optional position filter
            team: Optional team filter
            birth_date: Optional birth date
            season: Optional season (for historical team matching)

        Returns:
            ResolutionResult
        """
        conn = self._get_connection()
        try:
            # Try deterministic first
            result = self._deterministic_name_match(conn, name, position, birth_date, team)
            if result and result.success:
                return result

            # Try fuzzy
            if self.enable_fuzzy:
                result = self._fuzzy_name_match(conn, name, position, birth_date, team)
                if result:
                    return result

            return ResolutionResult(
                success=False,
                match_details={
                    "reason": "no_match_found",
                    "input_name": name,
                    "input_position": position
                }
            )

        finally:
            conn.close()

    def batch_resolve(
        self,
        external_ids: list[str],
        source: SourceType,
        source_data_list: Optional[list[dict]] = None
    ) -> dict[str, ResolutionResult]:
        """
        Resolve multiple external IDs in batch.

        Args:
            external_ids: List of external IDs to resolve
            source: The source platform
            source_data_list: Optional list of source data dicts (same order as IDs)

        Returns:
            Dict mapping external_id -> ResolutionResult
        """
        results: dict[str, ResolutionResult] = {}

        if source_data_list and len(source_data_list) != len(external_ids):
            raise ValueError(
                "source_data_list must have same length as external_ids"
            )

        for i, ext_id in enumerate(external_ids):
            source_data = source_data_list[i] if source_data_list else None
            results[ext_id] = self.resolve(ext_id, source, source_data)

        return results

    def get_resolution_stats(self) -> dict[str, Any]:
        """Get statistics about recent resolution attempts."""
        conn = self._get_connection()
        try:
            cursor = conn.execute("""
                SELECT
                    action,
                    match_method,
                    COUNT(*) as count,
                    AVG(confidence) as avg_confidence
                FROM match_audit_log
                WHERE action IN ('match_success', 'match_failure', 'match_conflict')
                  AND timestamp >= datetime('now', '-7 days')
                GROUP BY action, match_method
                ORDER BY count DESC
            """)

            stats = {
                "by_action_method": [],
                "total_attempts": 0,
                "success_rate": 0.0
            }

            success_count = 0
            total_count = 0

            for row in cursor.fetchall():
                stats["by_action_method"].append({
                    "action": row["action"],
                    "method": row["match_method"],
                    "count": row["count"],
                    "avg_confidence": row["avg_confidence"]
                })
                total_count += row["count"]
                if row["action"] == "match_success":
                    success_count += row["count"]

            stats["total_attempts"] = total_count
            stats["success_rate"] = (
                success_count / total_count if total_count > 0 else 0.0
            )

            return stats

        finally:
            conn.close()


# Convenience function for quick resolution
def resolve_player(
    external_id: str,
    source: SourceType,
    source_data: Optional[dict] = None,
    db_path: str | Path = DEFAULT_DB_PATH
) -> ResolutionResult:
    """
    Quick resolution function for single lookups.

    Args:
        external_id: The external ID to resolve
        source: The source platform
        source_data: Optional additional matching data
        db_path: Path to database

    Returns:
        ResolutionResult
    """
    resolver = IdentityResolver(db_path=db_path)
    return resolver.resolve(external_id, source, source_data)


if __name__ == "__main__":
    # Example usage
    import argparse

    parser = argparse.ArgumentParser(description="Identity Resolution Engine")
    parser.add_argument("external_id", help="External ID to resolve")
    parser.add_argument("source", choices=[
        "sleeper", "espn", "gsis", "sportradar", "yahoo"
    ], help="Source platform")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH,
                        help="Database path")
    parser.add_argument("--name", help="Player name (for additional matching)")
    parser.add_argument("--position", help="Position")
    parser.add_argument("--dob", help="Date of birth (YYYY-MM-DD)")

    args = parser.parse_args()

    source_data = {}
    if args.name:
        source_data["name"] = args.name
    if args.position:
        source_data["position"] = args.position
    if args.dob:
        source_data["birth_date"] = args.dob

    resolver = IdentityResolver(db_path=args.db)
    result = resolver.resolve(
        args.external_id,
        args.source,
        source_data if source_data else None
    )

    print(f"Success: {result.success}")
    print(f"Player UID: {result.player_uid}")
    print(f"Canonical Name: {result.canonical_name}")
    print(f"Confidence: {result.confidence}")
    print(f"Match Method: {result.match_method}")
    if result.candidates:
        print(f"Candidates: {len(result.candidates)}")
        for c in result.candidates[:3]:
            print(f"  - {c}")
    if result.match_details:
        print(f"Details: {json.dumps(result.match_details, indent=2)}")
