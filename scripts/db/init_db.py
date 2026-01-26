#!/usr/bin/env python3
"""
Unified Player Identity Database Initialization and Management

This module provides functionality to initialize and manage the unified player
identity database (Golden Player Identity layer). It includes:

- Database initialization from schema.sql
- UUID generation for new players
- Name normalization utilities
- CRUD operations for players and identifiers
- Audit logging helpers
- Migration utilities

Usage:
    # Initialize a new database
    python init_db.py --init

    # Initialize with sample data for testing
    python init_db.py --init --sample

    # Check database integrity
    python init_db.py --check

    # As a module
    from scripts.db.init_db import PlayerIdentityDB
    db = PlayerIdentityDB("db/players.sqlite")
    db.initialize()
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Generator, Literal, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
SCRIPT_DIR = Path(__file__).parent
SCHEMA_PATH = SCRIPT_DIR / "schema.sql"
DEFAULT_DB_PATH = SCRIPT_DIR.parent.parent / "db" / "players.sqlite"


# Type definitions
SourceType = Literal[
    "sleeper", "espn", "gsis", "sportradar", "yahoo", "pfr",
    "rotowire", "nflverse", "fantasy_data", "cbs", "fleaflicker", "mfl"
]
MatchMethodType = Literal[
    "exact", "crosswalk", "name_dob", "name_only", "fuzzy", "manual", "inferred"
]
PlayerStatusType = Literal[
    "active", "practice", "injured", "suspended", "retired", "unsigned", "unknown"
]


@dataclass
class PlayerRecord:
    """Represents a player identity record."""
    player_uid: str
    canonical_name: str
    canonical_name_norm: str
    position: Optional[str] = None
    birth_date: Optional[str] = None
    college: Optional[str] = None
    nfl_debut_year: Optional[int] = None
    nfl_final_year: Optional[int] = None
    height_inches: Optional[int] = None
    weight_lbs: Optional[int] = None
    current_nfl_team: Optional[str] = None
    status: PlayerStatusType = "active"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class IdentifierRecord:
    """Represents an external identifier mapping."""
    player_uid: str
    source: SourceType
    external_id: str
    confidence: float = 1.0
    match_method: MatchMethodType = "exact"
    verified_at: Optional[str] = None
    verified_by: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class MatchResult:
    """Result of an identity matching attempt."""
    success: bool
    player_uid: Optional[str] = None
    confidence: float = 0.0
    match_method: Optional[MatchMethodType] = None
    candidates: list[dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None


def normalize_name(name: str) -> str:
    """
    Normalize a player name for matching purposes.

    Transformations:
    - Convert to lowercase
    - Remove punctuation
    - Remove common suffixes (Jr, Sr, II, III, IV, V)
    - Collapse multiple spaces
    - Strip leading/trailing whitespace

    Args:
        name: The raw name string

    Returns:
        Normalized name string

    Examples:
        >>> normalize_name("Patrick Mahomes II")
        'patrick mahomes'
        >>> normalize_name("A.J. Brown")
        'aj brown'
        >>> normalize_name("D'Andre Swift")
        'dandre swift'
    """
    if not name:
        return ""

    # Convert to lowercase
    result = name.lower()

    # Remove common suffixes
    suffixes = [
        r'\s+jr\.?$', r'\s+sr\.?$',
        r'\s+ii$', r'\s+iii$', r'\s+iv$', r'\s+v$',
        r'\s+2nd$', r'\s+3rd$', r'\s+4th$'
    ]
    for suffix in suffixes:
        result = re.sub(suffix, '', result, flags=re.IGNORECASE)

    # Remove punctuation (except spaces)
    result = re.sub(r"[^\w\s]", "", result)

    # Collapse multiple spaces
    result = re.sub(r"\s+", " ", result)

    # Strip whitespace
    result = result.strip()

    return result


def generate_player_uid() -> str:
    """
    Generate a new UUID v4 for a player.

    Returns:
        A string UUID in the format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    """
    return str(uuid.uuid4())


def generate_deterministic_uid(name: str, birth_date: Optional[str] = None) -> str:
    """
    Generate a deterministic player UID based on name and birth date.

    This is useful for ensuring consistent IDs when processing the same
    player from multiple sources. Uses SHA-256 hashing truncated to UUID format.

    Args:
        name: Player's canonical name
        birth_date: Optional birth date (YYYY-MM-DD format)

    Returns:
        A deterministic UUID-format string
    """
    key = normalize_name(name)
    if birth_date:
        key += f"|{birth_date}"

    # Generate SHA-256 hash and format as UUID
    hash_bytes = hashlib.sha256(key.encode()).digest()

    # Format first 16 bytes as UUID v4-like string
    uid = (
        f"{hash_bytes[0:4].hex()}-"
        f"{hash_bytes[4:6].hex()}-"
        f"{hash_bytes[6:8].hex()}-"
        f"{hash_bytes[8:10].hex()}-"
        f"{hash_bytes[10:16].hex()}"
    )
    return uid


class PlayerIdentityDB:
    """
    Manager for the unified player identity database.

    Provides methods for:
    - Database initialization and schema management
    - Player CRUD operations
    - Identifier management
    - Alias management
    - Audit logging
    - Identity resolution helpers
    """

    def __init__(self, db_path: str | Path = DEFAULT_DB_PATH):
        """
        Initialize the database manager.

        Args:
            db_path: Path to the SQLite database file
        """
        self.db_path = Path(db_path)
        self._connection: Optional[sqlite3.Connection] = None

    @contextmanager
    def connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Context manager for database connections with proper cleanup."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self, conn: sqlite3.Connection) -> Generator[sqlite3.Cursor, None, None]:
        """Context manager for database transactions."""
        cursor = conn.cursor()
        try:
            yield cursor
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()

    def initialize(self, force: bool = False) -> None:
        """
        Initialize the database with the schema.

        Args:
            force: If True, will drop existing tables and recreate.
                   Use with caution - this destroys all data!
        """
        # Ensure parent directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        # Check if database already exists
        if self.db_path.exists() and not force:
            logger.info(f"Database already exists at {self.db_path}")
            logger.info("Use --force to reinitialize (WARNING: destroys data)")
            return

        if force and self.db_path.exists():
            logger.warning(f"Forcing reinitialization - removing {self.db_path}")
            self.db_path.unlink()

        # Read schema
        if not SCHEMA_PATH.exists():
            raise FileNotFoundError(f"Schema file not found: {SCHEMA_PATH}")

        schema_sql = SCHEMA_PATH.read_text()

        # Create database and execute schema
        with self.connection() as conn:
            logger.info(f"Creating database at {self.db_path}")
            conn.executescript(schema_sql)
            logger.info("Schema initialized successfully")

            # Verify tables were created
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [row[0] for row in cursor.fetchall()]
            logger.info(f"Created tables: {', '.join(tables)}")

    def get_schema_version(self) -> Optional[str]:
        """Get the current schema version from the database."""
        try:
            with self.connection() as conn:
                cursor = conn.execute(
                    "SELECT value FROM schema_meta WHERE key = 'schema_version'"
                )
                row = cursor.fetchone()
                return row[0] if row else None
        except sqlite3.OperationalError:
            return None

    def check_integrity(self) -> dict[str, Any]:
        """
        Run integrity checks on the database.

        Returns:
            Dictionary with check results
        """
        results: dict[str, Any] = {
            "valid": True,
            "checks": {},
            "errors": []
        }

        try:
            with self.connection() as conn:
                # SQLite integrity check
                cursor = conn.execute("PRAGMA integrity_check")
                integrity_result = cursor.fetchone()[0]
                results["checks"]["sqlite_integrity"] = integrity_result == "ok"
                if integrity_result != "ok":
                    results["errors"].append(f"SQLite integrity: {integrity_result}")
                    results["valid"] = False

                # Foreign key check
                cursor = conn.execute("PRAGMA foreign_key_check")
                fk_violations = cursor.fetchall()
                results["checks"]["foreign_keys"] = len(fk_violations) == 0
                if fk_violations:
                    results["errors"].append(f"Foreign key violations: {len(fk_violations)}")
                    results["valid"] = False

                # Check for orphaned identifiers
                cursor = conn.execute("""
                    SELECT COUNT(*) FROM player_identifiers pi
                    LEFT JOIN players p ON pi.player_uid = p.player_uid
                    WHERE p.player_uid IS NULL
                """)
                orphaned = cursor.fetchone()[0]
                results["checks"]["no_orphaned_identifiers"] = orphaned == 0
                if orphaned > 0:
                    results["errors"].append(f"Orphaned identifiers: {orphaned}")
                    results["valid"] = False

                # Check for duplicate identifiers
                cursor = conn.execute("""
                    SELECT source, external_id, COUNT(*) as cnt
                    FROM player_identifiers
                    GROUP BY source, external_id
                    HAVING cnt > 1
                """)
                duplicates = cursor.fetchall()
                results["checks"]["no_duplicate_identifiers"] = len(duplicates) == 0
                if duplicates:
                    results["errors"].append(f"Duplicate identifiers: {len(duplicates)}")
                    results["valid"] = False

                # Get statistics
                cursor = conn.execute("SELECT COUNT(*) FROM players")
                results["stats"] = {"players": cursor.fetchone()[0]}

                cursor = conn.execute("SELECT COUNT(*) FROM player_identifiers")
                results["stats"]["identifiers"] = cursor.fetchone()[0]

                cursor = conn.execute("SELECT COUNT(*) FROM player_aliases")
                results["stats"]["aliases"] = cursor.fetchone()[0]

                cursor = conn.execute(
                    "SELECT source, COUNT(*) FROM player_identifiers GROUP BY source"
                )
                results["stats"]["identifiers_by_source"] = dict(cursor.fetchall())

        except Exception as e:
            results["valid"] = False
            results["errors"].append(f"Check failed: {e}")

        return results

    # -------------------------------------------------------------------------
    # Player CRUD Operations
    # -------------------------------------------------------------------------

    def create_player(
        self,
        canonical_name: str,
        position: Optional[str] = None,
        birth_date: Optional[str] = None,
        college: Optional[str] = None,
        current_nfl_team: Optional[str] = None,
        status: PlayerStatusType = "active",
        player_uid: Optional[str] = None,
        use_deterministic_uid: bool = False,
        conn: Optional[sqlite3.Connection] = None
    ) -> str:
        """
        Create a new player record.

        Args:
            canonical_name: The player's canonical display name
            position: Position (QB, RB, WR, etc.)
            birth_date: Date of birth (YYYY-MM-DD format)
            college: College attended
            current_nfl_team: Current NFL team abbreviation
            status: Player status
            player_uid: Optional specific UID to use
            use_deterministic_uid: If True, generate deterministic UID from name/DOB
            conn: Optional existing connection to use

        Returns:
            The player_uid of the created player
        """
        if player_uid is None:
            if use_deterministic_uid:
                player_uid = generate_deterministic_uid(canonical_name, birth_date)
            else:
                player_uid = generate_player_uid()

        canonical_name_norm = normalize_name(canonical_name)

        def _insert(c: sqlite3.Connection) -> None:
            c.execute("""
                INSERT INTO players (
                    player_uid, canonical_name, canonical_name_norm,
                    position, birth_date, college, current_nfl_team, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                player_uid, canonical_name, canonical_name_norm,
                position, birth_date, college, current_nfl_team, status
            ))

        if conn:
            _insert(conn)
        else:
            with self.connection() as c:
                _insert(c)
                c.commit()

        logger.debug(f"Created player: {canonical_name} ({player_uid})")
        return player_uid

    def get_player(
        self,
        player_uid: str,
        conn: Optional[sqlite3.Connection] = None
    ) -> Optional[PlayerRecord]:
        """Get a player by UID."""
        def _query(c: sqlite3.Connection) -> Optional[sqlite3.Row]:
            cursor = c.execute(
                "SELECT * FROM players WHERE player_uid = ?",
                (player_uid,)
            )
            return cursor.fetchone()

        row = _query(conn) if conn else None
        if row is None:
            with self.connection() as c:
                row = _query(c)

        if row is None:
            return None

        return PlayerRecord(
            player_uid=row["player_uid"],
            canonical_name=row["canonical_name"],
            canonical_name_norm=row["canonical_name_norm"],
            position=row["position"],
            birth_date=row["birth_date"],
            college=row["college"],
            nfl_debut_year=row["nfl_debut_year"],
            nfl_final_year=row["nfl_final_year"],
            height_inches=row["height_inches"],
            weight_lbs=row["weight_lbs"],
            current_nfl_team=row["current_nfl_team"],
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

    def find_player_by_name(
        self,
        name: str,
        position: Optional[str] = None,
        birth_date: Optional[str] = None
    ) -> list[PlayerRecord]:
        """
        Find players by name (with optional position/DOB filtering).

        Args:
            name: Name to search for (will be normalized)
            position: Optional position filter
            birth_date: Optional birth date filter

        Returns:
            List of matching PlayerRecord objects
        """
        name_norm = normalize_name(name)

        query = "SELECT * FROM players WHERE canonical_name_norm = ?"
        params: list[Any] = [name_norm]

        if position:
            query += " AND position = ?"
            params.append(position)

        if birth_date:
            query += " AND birth_date = ?"
            params.append(birth_date)

        with self.connection() as conn:
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()

        return [
            PlayerRecord(
                player_uid=row["player_uid"],
                canonical_name=row["canonical_name"],
                canonical_name_norm=row["canonical_name_norm"],
                position=row["position"],
                birth_date=row["birth_date"],
                college=row["college"],
                nfl_debut_year=row["nfl_debut_year"],
                nfl_final_year=row["nfl_final_year"],
                height_inches=row["height_inches"],
                weight_lbs=row["weight_lbs"],
                current_nfl_team=row["current_nfl_team"],
                status=row["status"],
                created_at=row["created_at"],
                updated_at=row["updated_at"]
            )
            for row in rows
        ]

    def update_player(
        self,
        player_uid: str,
        **kwargs: Any
    ) -> bool:
        """
        Update a player record.

        Args:
            player_uid: The player's UID
            **kwargs: Fields to update (canonical_name, position, etc.)

        Returns:
            True if update was successful
        """
        allowed_fields = {
            "canonical_name", "position", "birth_date", "college",
            "nfl_debut_year", "nfl_final_year", "height_inches",
            "weight_lbs", "current_nfl_team", "status"
        }

        updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
        if not updates:
            return False

        # Handle canonical_name_norm if canonical_name is being updated
        if "canonical_name" in updates:
            updates["canonical_name_norm"] = normalize_name(updates["canonical_name"])

        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [player_uid]

        with self.connection() as conn:
            cursor = conn.execute(
                f"UPDATE players SET {set_clause} WHERE player_uid = ?",
                values
            )
            conn.commit()
            return cursor.rowcount > 0

    # -------------------------------------------------------------------------
    # Identifier Operations
    # -------------------------------------------------------------------------

    def add_identifier(
        self,
        player_uid: str,
        source: SourceType,
        external_id: str,
        confidence: float = 1.0,
        match_method: MatchMethodType = "exact",
        verified_by: Optional[str] = None,
        notes: Optional[str] = None,
        conn: Optional[sqlite3.Connection] = None
    ) -> bool:
        """
        Add an external identifier mapping for a player.

        Args:
            player_uid: The player's UID
            source: The source platform
            external_id: The external ID value
            confidence: Match confidence (0.0-1.0)
            match_method: How the match was determined
            verified_by: Who/what verified this mapping
            notes: Optional notes
            conn: Optional existing connection

        Returns:
            True if the identifier was added
        """
        verified_at = datetime.now().isoformat() if verified_by else None

        def _insert(c: sqlite3.Connection) -> bool:
            try:
                c.execute("""
                    INSERT INTO player_identifiers (
                        player_uid, source, external_id,
                        confidence, match_method,
                        verified_at, verified_by, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    player_uid, source, external_id,
                    confidence, match_method,
                    verified_at, verified_by, notes
                ))
                return True
            except sqlite3.IntegrityError as e:
                if "UNIQUE constraint" in str(e):
                    logger.warning(
                        f"Identifier already exists: {source}:{external_id}"
                    )
                    return False
                raise

        if conn:
            return _insert(conn)
        else:
            with self.connection() as c:
                result = _insert(c)
                c.commit()
                return result

    def get_player_by_identifier(
        self,
        source: SourceType,
        external_id: str
    ) -> Optional[PlayerRecord]:
        """
        Look up a player by an external identifier.

        Args:
            source: The source platform
            external_id: The external ID value

        Returns:
            PlayerRecord if found, None otherwise
        """
        with self.connection() as conn:
            cursor = conn.execute("""
                SELECT p.* FROM players p
                JOIN player_identifiers pi ON p.player_uid = pi.player_uid
                WHERE pi.source = ? AND pi.external_id = ?
            """, (source, external_id))
            row = cursor.fetchone()

        if row is None:
            return None

        return PlayerRecord(
            player_uid=row["player_uid"],
            canonical_name=row["canonical_name"],
            canonical_name_norm=row["canonical_name_norm"],
            position=row["position"],
            birth_date=row["birth_date"],
            college=row["college"],
            nfl_debut_year=row["nfl_debut_year"],
            nfl_final_year=row["nfl_final_year"],
            height_inches=row["height_inches"],
            weight_lbs=row["weight_lbs"],
            current_nfl_team=row["current_nfl_team"],
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )

    def get_all_identifiers(self, player_uid: str) -> list[IdentifierRecord]:
        """Get all external identifiers for a player."""
        with self.connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM player_identifiers
                WHERE player_uid = ?
                ORDER BY source
            """, (player_uid,))
            rows = cursor.fetchall()

        return [
            IdentifierRecord(
                player_uid=row["player_uid"],
                source=row["source"],
                external_id=row["external_id"],
                confidence=row["confidence"],
                match_method=row["match_method"],
                verified_at=row["verified_at"],
                verified_by=row["verified_by"],
                notes=row["notes"]
            )
            for row in rows
        ]

    # -------------------------------------------------------------------------
    # Alias Operations
    # -------------------------------------------------------------------------

    def add_alias(
        self,
        player_uid: str,
        alias: str,
        source: Optional[str] = None,
        alias_type: str = "variation",
        conn: Optional[sqlite3.Connection] = None
    ) -> bool:
        """Add a name alias for a player."""
        alias_norm = normalize_name(alias)

        def _insert(c: sqlite3.Connection) -> bool:
            try:
                c.execute("""
                    INSERT INTO player_aliases (
                        player_uid, alias, alias_norm, source, alias_type
                    ) VALUES (?, ?, ?, ?, ?)
                """, (player_uid, alias, alias_norm, source, alias_type))
                return True
            except sqlite3.IntegrityError:
                return False  # Alias already exists

        if conn:
            return _insert(conn)
        else:
            with self.connection() as c:
                result = _insert(c)
                c.commit()
                return result

    def find_player_by_alias(self, alias: str) -> list[PlayerRecord]:
        """Find players that have a matching alias."""
        alias_norm = normalize_name(alias)

        with self.connection() as conn:
            cursor = conn.execute("""
                SELECT DISTINCT p.* FROM players p
                JOIN player_aliases pa ON p.player_uid = pa.player_uid
                WHERE pa.alias_norm = ?
            """, (alias_norm,))
            rows = cursor.fetchall()

        return [
            PlayerRecord(
                player_uid=row["player_uid"],
                canonical_name=row["canonical_name"],
                canonical_name_norm=row["canonical_name_norm"],
                position=row["position"],
                birth_date=row["birth_date"],
                college=row["college"],
                nfl_debut_year=row["nfl_debut_year"],
                nfl_final_year=row["nfl_final_year"],
                height_inches=row["height_inches"],
                weight_lbs=row["weight_lbs"],
                current_nfl_team=row["current_nfl_team"],
                status=row["status"],
                created_at=row["created_at"],
                updated_at=row["updated_at"]
            )
            for row in rows
        ]

    # -------------------------------------------------------------------------
    # Audit Logging
    # -------------------------------------------------------------------------

    def log_audit(
        self,
        action: str,
        player_uid: Optional[str] = None,
        source: Optional[str] = None,
        external_id: Optional[str] = None,
        confidence: Optional[float] = None,
        match_method: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
        result: Optional[str] = None,
        error_message: Optional[str] = None,
        triggered_by: str = "system",
        session_id: Optional[str] = None,
        conn: Optional[sqlite3.Connection] = None
    ) -> None:
        """
        Log an audit event.

        Args:
            action: Type of action (create_player, match_attempt, etc.)
            player_uid: Related player UID
            source: External source being processed
            external_id: External ID being processed
            confidence: Match confidence score
            match_method: Method used for matching
            context: Additional context as dict (will be JSON-encoded)
            result: Result description
            error_message: Error message if applicable
            triggered_by: Who/what triggered this event
            session_id: Session identifier for grouping events
            conn: Optional existing connection
        """
        context_json = json.dumps(context) if context else None

        def _insert(c: sqlite3.Connection) -> None:
            c.execute("""
                INSERT INTO match_audit_log (
                    session_id, action, player_uid, source, external_id,
                    confidence, match_method, context_json, result,
                    error_message, triggered_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session_id, action, player_uid, source, external_id,
                confidence, match_method, context_json, result,
                error_message, triggered_by
            ))

        if conn:
            _insert(conn)
        else:
            with self.connection() as c:
                _insert(c)
                c.commit()

    # -------------------------------------------------------------------------
    # Resolution Queue Operations
    # -------------------------------------------------------------------------

    def add_to_resolution_queue(
        self,
        source: SourceType,
        external_id: str,
        source_name: Optional[str] = None,
        source_position: Optional[str] = None,
        source_team: Optional[str] = None,
        source_dob: Optional[str] = None,
        source_college: Optional[str] = None,
        source_data: Optional[dict[str, Any]] = None,
        best_candidate_uid: Optional[str] = None,
        best_candidate_score: Optional[float] = None,
        candidates: Optional[list[dict[str, Any]]] = None,
        priority: int = 0
    ) -> int:
        """
        Add an unresolved identifier to the resolution queue.

        Returns:
            The queue entry ID
        """
        source_name_norm = normalize_name(source_name) if source_name else None
        source_data_json = json.dumps(source_data) if source_data else None
        candidates_json = json.dumps(candidates) if candidates else None

        with self.connection() as conn:
            cursor = conn.execute("""
                INSERT INTO id_resolution_queue (
                    source, external_id, source_name, source_name_norm,
                    source_position, source_team, source_dob, source_college,
                    source_data_json, best_candidate_uid, best_candidate_score,
                    candidates_json, priority
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                source, external_id, source_name, source_name_norm,
                source_position, source_team, source_dob, source_college,
                source_data_json, best_candidate_uid, best_candidate_score,
                candidates_json, priority
            ))
            conn.commit()
            return cursor.lastrowid or 0

    def get_pending_resolutions(
        self,
        limit: int = 100,
        source: Optional[SourceType] = None
    ) -> list[dict[str, Any]]:
        """Get pending items from the resolution queue."""
        query = """
            SELECT * FROM id_resolution_queue
            WHERE status = 'pending'
        """
        params: list[Any] = []

        if source:
            query += " AND source = ?"
            params.append(source)

        query += " ORDER BY priority DESC, created_at LIMIT ?"
        params.append(limit)

        with self.connection() as conn:
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()

        return [dict(row) for row in rows]

    # -------------------------------------------------------------------------
    # Bulk Operations
    # -------------------------------------------------------------------------

    def bulk_create_players(
        self,
        players: list[dict[str, Any]],
        on_conflict: Literal["skip", "update"] = "skip"
    ) -> tuple[int, int]:
        """
        Bulk create player records.

        Args:
            players: List of player dicts with at minimum 'canonical_name'
            on_conflict: How to handle existing players

        Returns:
            Tuple of (created_count, skipped_count)
        """
        created = 0
        skipped = 0

        with self.connection() as conn:
            for player_data in players:
                name = player_data.get("canonical_name")
                if not name:
                    skipped += 1
                    continue

                try:
                    player_uid = player_data.get("player_uid") or generate_player_uid()

                    conn.execute("""
                        INSERT INTO players (
                            player_uid, canonical_name, canonical_name_norm,
                            position, birth_date, college, current_nfl_team, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        player_uid,
                        name,
                        normalize_name(name),
                        player_data.get("position"),
                        player_data.get("birth_date"),
                        player_data.get("college"),
                        player_data.get("current_nfl_team"),
                        player_data.get("status", "active")
                    ))
                    created += 1

                except sqlite3.IntegrityError:
                    if on_conflict == "update":
                        # Update existing record
                        self.update_player(player_uid, **player_data)
                    skipped += 1

            conn.commit()

        return created, skipped

    # -------------------------------------------------------------------------
    # Export/Import
    # -------------------------------------------------------------------------

    def export_players_json(self, output_path: Path) -> int:
        """Export all players to JSON format."""
        with self.connection() as conn:
            cursor = conn.execute("""
                SELECT p.*,
                    (SELECT json_group_object(pi.source, pi.external_id)
                     FROM player_identifiers pi
                     WHERE pi.player_uid = p.player_uid) AS identifiers
                FROM players p
                ORDER BY p.canonical_name
            """)
            rows = cursor.fetchall()

        players = []
        for row in rows:
            player = dict(row)
            if player.get("identifiers"):
                player["identifiers"] = json.loads(player["identifiers"])
            players.append(player)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(players, indent=2))

        return len(players)


def create_sample_data(db: PlayerIdentityDB) -> None:
    """Create sample data for testing."""
    logger.info("Creating sample data...")

    with db.connection() as conn:
        # Create sample players
        players = [
            {
                "name": "Patrick Mahomes",
                "position": "QB",
                "birth_date": "1995-09-17",
                "college": "Texas Tech",
                "team": "KC",
                "ids": {
                    "sleeper": "4046",
                    "espn": "3139477",
                    "gsis": "00-0033873"
                }
            },
            {
                "name": "Travis Kelce",
                "position": "TE",
                "birth_date": "1989-10-05",
                "college": "Cincinnati",
                "team": "KC",
                "ids": {
                    "sleeper": "1466",
                    "espn": "15847",
                    "gsis": "00-0029604"
                }
            },
            {
                "name": "Tyreek Hill",
                "position": "WR",
                "birth_date": "1994-03-01",
                "college": "West Alabama",
                "team": "MIA",
                "ids": {
                    "sleeper": "3321",
                    "espn": "3116406",
                    "gsis": "00-0032764"
                }
            }
        ]

        for p in players:
            player_uid = db.create_player(
                canonical_name=p["name"],
                position=p["position"],
                birth_date=p["birth_date"],
                college=p["college"],
                current_nfl_team=p["team"],
                conn=conn
            )

            for source, ext_id in p["ids"].items():
                db.add_identifier(
                    player_uid=player_uid,
                    source=source,  # type: ignore
                    external_id=ext_id,
                    confidence=1.0,
                    match_method="exact",
                    verified_by="init_script",
                    conn=conn
                )

            # Add some aliases
            if p["name"] == "Patrick Mahomes":
                db.add_alias(player_uid, "Pat Mahomes", "manual", "variation", conn)
                db.add_alias(player_uid, "Showtime", "manual", "nickname", conn)

        conn.commit()

    logger.info(f"Created {len(players)} sample players")


def main() -> None:
    """Main entry point for CLI usage."""
    parser = argparse.ArgumentParser(
        description="Unified Player Identity Database Management"
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"Database path (default: {DEFAULT_DB_PATH})"
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="Initialize the database with schema"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force reinitialization (WARNING: destroys data)"
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Create sample data for testing"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run integrity checks"
    )
    parser.add_argument(
        "--version",
        action="store_true",
        help="Show schema version"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    db = PlayerIdentityDB(args.db)

    if args.version:
        version = db.get_schema_version()
        if version:
            print(f"Schema version: {version}")
        else:
            print("Database not initialized or schema version not found")
        return

    if args.init:
        db.initialize(force=args.force)
        if args.sample:
            create_sample_data(db)

    if args.check:
        results = db.check_integrity()
        print(f"\nIntegrity Check Results:")
        print(f"  Valid: {results['valid']}")
        print(f"\nChecks:")
        for check, passed in results.get("checks", {}).items():
            status = "PASS" if passed else "FAIL"
            print(f"  {check}: {status}")

        if results.get("errors"):
            print(f"\nErrors:")
            for error in results["errors"]:
                print(f"  - {error}")

        if results.get("stats"):
            print(f"\nStatistics:")
            for stat, value in results["stats"].items():
                print(f"  {stat}: {value}")


if __name__ == "__main__":
    main()
