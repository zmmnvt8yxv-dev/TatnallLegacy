#!/usr/bin/env python3
"""
Master Player Index Loader

Bootstrap the identity database from all available data sources.
Implements a strategic loading order to maximize ID coverage and
minimize unresolved players.

Loading Order:
1. Load NFLverse players (highest ID coverage) -> create player_uid
2. Load Sleeper players -> match to existing or create new
3. Load ESPN athletes -> match to existing (use nflverse cross-refs)
4. Load Sportradar -> match to existing
5. Load historical manual mappings
6. Export match audit report

Usage:
    # Full load from all sources
    python load_all_sources.py --all

    # Load specific sources
    python load_all_sources.py --nflverse --sleeper

    # Dry run (no database changes)
    python load_all_sources.py --all --dry-run

    # Generate audit report only
    python load_all_sources.py --audit-report
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DB_DIR = PROJECT_ROOT / "db"
DATA_RAW_DIR = PROJECT_ROOT / "data_raw"
DATA_DIR = PROJECT_ROOT / "data"
PUBLIC_DATA_DIR = PROJECT_ROOT / "public" / "data"

# Database paths
IDENTITY_DB_PATH = DB_DIR / "players.sqlite"

# Data source paths (may not all exist - that's okay)
NFLVERSE_PLAYERS_PATH = DATA_RAW_DIR / "nflverse_players.parquet"
SLEEPER_PLAYERS_RAW = DATA_RAW_DIR / "sleeper" / "players_raw.json"
SLEEPER_PLAYERS_FLAT = DATA_RAW_DIR / "sleeper" / "players_flat.csv"
ESPN_ATHLETES_INDEX = DATA_RAW_DIR / "espn_core" / "index" / "athletes_index_flat.csv"
SPORTRADAR_TEAMS_DIR = DATA_RAW_DIR / "sportradar" / "teams"
MANUAL_MAPPINGS_PATH = DATA_DIR / "manual_mappings.json"
MANUAL_OVERRIDES_PATH = DATA_DIR / "manual_overrides.json"

# Output paths
AUDIT_REPORT_PATH = PROJECT_ROOT / "data" / "load_audit_report.json"


@dataclass
class LoadStats:
    """Statistics for a source load operation."""
    source: str
    total_records: int = 0
    created: int = 0
    matched_exact: int = 0
    matched_crosswalk: int = 0
    matched_fuzzy: int = 0
    skipped: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "total_records": self.total_records,
            "created": self.created,
            "matched_exact": self.matched_exact,
            "matched_crosswalk": self.matched_crosswalk,
            "matched_fuzzy": self.matched_fuzzy,
            "skipped": self.skipped,
            "failed": self.failed,
            "errors": self.errors[:100]  # Limit error list
        }


def normalize_name(name: str) -> str:
    """Normalize a name for matching."""
    import re
    if not name:
        return ""
    result = str(name).lower().strip()
    result = result.replace("&", "and")
    result = re.sub(r"[^\w\s]", "", result)
    result = result.replace("-", " ")
    result = re.sub(r"\s+", " ", result).strip()
    # Remove suffixes
    suffixes = {"jr", "sr", "ii", "iii", "iv", "v"}
    parts = result.split()
    if parts and parts[-1] in suffixes:
        parts = parts[:-1]
    return " ".join(parts)


def normalize_dob(dob: str) -> str:
    """Normalize date of birth to YYYY-MM-DD."""
    if not dob:
        return ""
    dob = str(dob).strip()
    return dob[:10] if len(dob) >= 10 else dob


def generate_player_uid() -> str:
    """Generate a new UUID for a player."""
    return str(uuid.uuid4())


class PlayerIndexLoader:
    """
    Orchestrates loading player data from all sources into the identity database.
    """

    def __init__(
        self,
        db_path: Path = IDENTITY_DB_PATH,
        dry_run: bool = False,
        verbose: bool = False
    ):
        """
        Initialize the loader.

        Args:
            db_path: Path to the identity SQLite database
            dry_run: If True, don't modify the database
            verbose: If True, log more detail
        """
        self.db_path = db_path
        self.dry_run = dry_run
        self.verbose = verbose
        self.stats: dict[str, LoadStats] = {}
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Lazy imports to avoid startup cost
        self._sqlite3 = None
        self._pd = None

    def _get_sqlite3(self):
        if self._sqlite3 is None:
            import sqlite3
            self._sqlite3 = sqlite3
        return self._sqlite3

    def _get_pandas(self):
        if self._pd is None:
            try:
                import pandas as pd
                self._pd = pd
            except ImportError:
                logger.error("pandas is required for loading data sources")
                raise
        return self._pd

    def _get_connection(self):
        """Get a database connection."""
        if not self.db_path.exists():
            raise FileNotFoundError(
                f"Identity database not found: {self.db_path}. "
                "Run 'python scripts/db/init_db.py --init' first."
            )
        sqlite3 = self._get_sqlite3()
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _player_exists(self, conn, name_norm: str, dob: str = None) -> Optional[str]:
        """Check if a player already exists, return player_uid if so."""
        if dob:
            cursor = conn.execute("""
                SELECT player_uid FROM players
                WHERE canonical_name_norm = ? AND birth_date = ?
            """, (name_norm, dob))
        else:
            cursor = conn.execute("""
                SELECT player_uid FROM players
                WHERE canonical_name_norm = ?
            """, (name_norm,))

        row = cursor.fetchone()
        return row["player_uid"] if row else None

    def _identifier_exists(self, conn, source: str, external_id: str) -> Optional[str]:
        """Check if an identifier already exists, return player_uid if so."""
        cursor = conn.execute("""
            SELECT player_uid FROM player_identifiers
            WHERE source = ? AND external_id = ?
        """, (source, str(external_id)))

        row = cursor.fetchone()
        return row["player_uid"] if row else None

    def _create_player(
        self,
        conn,
        canonical_name: str,
        position: str = None,
        birth_date: str = None,
        college: str = None,
        current_team: str = None,
        nfl_debut_year: int = None,
        status: str = "active"
    ) -> str:
        """Create a new player record, return player_uid."""
        player_uid = generate_player_uid()
        name_norm = normalize_name(canonical_name)

        if not self.dry_run:
            conn.execute("""
                INSERT INTO players (
                    player_uid, canonical_name, canonical_name_norm,
                    position, birth_date, college, current_nfl_team,
                    nfl_debut_year, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                player_uid, canonical_name, name_norm,
                position, birth_date, college, current_team,
                nfl_debut_year, status
            ))

        return player_uid

    def _add_identifier(
        self,
        conn,
        player_uid: str,
        source: str,
        external_id: str,
        confidence: float = 1.0,
        match_method: str = "exact"
    ) -> bool:
        """Add an identifier mapping."""
        if self.dry_run:
            return True

        try:
            conn.execute("""
                INSERT OR IGNORE INTO player_identifiers (
                    player_uid, source, external_id, confidence, match_method
                ) VALUES (?, ?, ?, ?, ?)
            """, (player_uid, source, str(external_id), confidence, match_method))
            return True
        except Exception as e:
            logger.warning(f"Failed to add identifier {source}:{external_id}: {e}")
            return False

    def _add_alias(self, conn, player_uid: str, alias: str, source: str = None):
        """Add a player alias."""
        if self.dry_run:
            return

        alias_norm = normalize_name(alias)
        try:
            conn.execute("""
                INSERT OR IGNORE INTO player_aliases (
                    player_uid, alias, alias_norm, source
                ) VALUES (?, ?, ?, ?)
            """, (player_uid, alias, alias_norm, source))
        except Exception as e:
            logger.warning(f"Failed to add alias: {e}")

    # -------------------------------------------------------------------------
    # Source 1: NFLverse Players (Primary source - highest ID coverage)
    # -------------------------------------------------------------------------

    def load_nflverse_players(self) -> LoadStats:
        """
        Load players from NFLverse data.

        NFLverse provides the most comprehensive ID mapping including:
        - gsis_id (official NFL ID)
        - espn_id
        - sportradar_id
        - yahoo_id
        - rotowire_id
        - pfr_id (Pro Football Reference)
        """
        stats = LoadStats(source="nflverse")

        if not NFLVERSE_PLAYERS_PATH.exists():
            # Try loading via nflreadpy if available
            try:
                import nflreadr
                logger.info("Loading NFLverse players via nflreadr...")
                df = nflreadr.load_players()
            except ImportError:
                logger.warning(
                    f"NFLverse data not found at {NFLVERSE_PLAYERS_PATH} "
                    "and nflreadr not installed. Skipping."
                )
                stats.skipped = 1
                stats.errors.append("NFLverse data not available")
                self.stats["nflverse"] = stats
                return stats
            except Exception as e:
                logger.error(f"Failed to load NFLverse data: {e}")
                stats.failed = 1
                stats.errors.append(str(e))
                self.stats["nflverse"] = stats
                return stats
        else:
            pd = self._get_pandas()
            logger.info(f"Loading NFLverse players from {NFLVERSE_PLAYERS_PATH}...")
            df = pd.read_parquet(NFLVERSE_PLAYERS_PATH)

        stats.total_records = len(df)
        logger.info(f"Processing {stats.total_records} NFLverse players...")

        conn = self._get_connection()
        try:
            for _, row in df.iterrows():
                try:
                    # Extract player data
                    gsis_id = row.get("gsis_id") or row.get("player_id")
                    if not gsis_id or str(gsis_id) == "nan":
                        stats.skipped += 1
                        continue

                    gsis_id = str(gsis_id)

                    # Check if already loaded
                    existing_uid = self._identifier_exists(conn, "gsis", gsis_id)
                    if existing_uid:
                        stats.matched_exact += 1
                        # Still add other identifiers if available
                        self._add_cross_ids_nflverse(conn, existing_uid, row, stats)
                        continue

                    # Extract name
                    full_name = (
                        row.get("display_name") or
                        row.get("full_name") or
                        f"{row.get('first_name', '')} {row.get('last_name', '')}".strip()
                    )
                    if not full_name:
                        stats.skipped += 1
                        continue

                    # Extract other fields
                    position = row.get("position")
                    birth_date = normalize_dob(row.get("birth_date", ""))
                    college = row.get("college")
                    current_team = row.get("team") or row.get("current_team_id")
                    draft_year = row.get("entry_year") or row.get("draft_year")

                    # Determine status
                    status_raw = row.get("status", "").lower() if row.get("status") else ""
                    if "ret" in status_raw:
                        status = "retired"
                    elif "act" in status_raw or status_raw == "":
                        status = "active"
                    else:
                        status = "unknown"

                    # Create player
                    player_uid = self._create_player(
                        conn,
                        canonical_name=full_name,
                        position=position,
                        birth_date=birth_date if birth_date else None,
                        college=college,
                        current_team=current_team,
                        nfl_debut_year=int(draft_year) if draft_year else None,
                        status=status
                    )

                    # Add primary identifier
                    self._add_identifier(conn, player_uid, "gsis", gsis_id, 1.0, "exact")
                    self._add_identifier(conn, player_uid, "nflverse", gsis_id, 1.0, "exact")

                    # Add cross-reference IDs
                    self._add_cross_ids_nflverse(conn, player_uid, row, stats)

                    # Add name variations as aliases
                    if row.get("short_name"):
                        self._add_alias(conn, player_uid, row["short_name"], "nflverse")
                    if row.get("first_name") and row.get("last_name"):
                        alt_name = f"{row['first_name']} {row['last_name']}"
                        if alt_name != full_name:
                            self._add_alias(conn, player_uid, alt_name, "nflverse")

                    stats.created += 1

                except Exception as e:
                    stats.failed += 1
                    if len(stats.errors) < 100:
                        stats.errors.append(f"Row error: {e}")
                    if self.verbose:
                        logger.warning(f"Error processing NFLverse row: {e}")

            if not self.dry_run:
                conn.commit()

        finally:
            conn.close()

        logger.info(
            f"NFLverse: {stats.created} created, {stats.matched_exact} existing, "
            f"{stats.skipped} skipped, {stats.failed} failed"
        )
        self.stats["nflverse"] = stats
        return stats

    def _add_cross_ids_nflverse(self, conn, player_uid: str, row, stats: LoadStats):
        """Add cross-reference IDs from NFLverse record."""
        id_fields = {
            "espn_id": "espn",
            "sportradar_id": "sportradar",
            "yahoo_id": "yahoo",
            "rotowire_id": "rotowire",
            "pff_id": "pff",
            "pfr_id": "pfr",
            "fantasy_data_id": "fantasy_data",
            "sleeper_id": "sleeper",
        }

        for field_name, source in id_fields.items():
            ext_id = row.get(field_name)
            if ext_id and str(ext_id) != "nan":
                self._add_identifier(
                    conn, player_uid, source, str(ext_id),
                    confidence=0.95, match_method="crosswalk"
                )
                stats.matched_crosswalk += 1

    # -------------------------------------------------------------------------
    # Source 2: Sleeper Players
    # -------------------------------------------------------------------------

    def load_sleeper_players(self) -> LoadStats:
        """Load players from Sleeper API data."""
        stats = LoadStats(source="sleeper")

        # Try JSON first, then CSV
        if SLEEPER_PLAYERS_RAW.exists():
            logger.info(f"Loading Sleeper players from {SLEEPER_PLAYERS_RAW}...")
            data = json.loads(SLEEPER_PLAYERS_RAW.read_text())
            players_iter = self._iter_sleeper_json(data)
            stats.total_records = len(data)
        elif SLEEPER_PLAYERS_FLAT.exists():
            pd = self._get_pandas()
            logger.info(f"Loading Sleeper players from {SLEEPER_PLAYERS_FLAT}...")
            df = pd.read_csv(SLEEPER_PLAYERS_FLAT)
            players_iter = self._iter_sleeper_csv(df)
            stats.total_records = len(df)
        else:
            logger.warning("Sleeper player data not found. Skipping.")
            stats.skipped = 1
            stats.errors.append("Sleeper data not available")
            self.stats["sleeper"] = stats
            return stats

        logger.info(f"Processing {stats.total_records} Sleeper players...")

        conn = self._get_connection()
        try:
            for player_data in players_iter:
                try:
                    sleeper_id = player_data.get("sleeper_id")
                    if not sleeper_id:
                        stats.skipped += 1
                        continue

                    sleeper_id = str(sleeper_id)

                    # Check if already in database
                    existing_uid = self._identifier_exists(conn, "sleeper", sleeper_id)
                    if existing_uid:
                        stats.matched_exact += 1
                        continue

                    # Try to match via cross-reference IDs
                    matched_uid = None
                    for id_field, source in [
                        ("gsis_id", "gsis"),
                        ("espn_id", "espn"),
                        ("yahoo_id", "yahoo")
                    ]:
                        ext_id = player_data.get(id_field)
                        if ext_id and str(ext_id) != "nan":
                            matched_uid = self._identifier_exists(conn, source, str(ext_id))
                            if matched_uid:
                                break

                    if matched_uid:
                        # Add sleeper_id to existing player
                        self._add_identifier(
                            conn, matched_uid, "sleeper", sleeper_id,
                            confidence=0.95, match_method="crosswalk"
                        )
                        stats.matched_crosswalk += 1
                        continue

                    # Try to match by name + DOB
                    full_name = player_data.get("full_name", "")
                    birth_date = normalize_dob(player_data.get("birth_date", ""))
                    name_norm = normalize_name(full_name)

                    if name_norm and birth_date:
                        matched_uid = self._player_exists(conn, name_norm, birth_date)
                        if matched_uid:
                            self._add_identifier(
                                conn, matched_uid, "sleeper", sleeper_id,
                                confidence=0.85, match_method="name_dob"
                            )
                            stats.matched_fuzzy += 1
                            continue

                    # Create new player
                    if not full_name:
                        stats.skipped += 1
                        continue

                    player_uid = self._create_player(
                        conn,
                        canonical_name=full_name,
                        position=player_data.get("position"),
                        birth_date=birth_date if birth_date else None,
                        college=player_data.get("college"),
                        current_team=player_data.get("team"),
                        status="active" if player_data.get("active") else "unknown"
                    )

                    self._add_identifier(conn, player_uid, "sleeper", sleeper_id, 1.0, "exact")

                    # Add any cross-reference IDs from Sleeper data
                    for id_field, source in [
                        ("gsis_id", "gsis"),
                        ("espn_id", "espn"),
                        ("yahoo_id", "yahoo"),
                        ("sportradar_id", "sportradar")
                    ]:
                        ext_id = player_data.get(id_field)
                        if ext_id and str(ext_id) != "nan":
                            self._add_identifier(
                                conn, player_uid, source, str(ext_id),
                                confidence=0.95, match_method="crosswalk"
                            )

                    stats.created += 1

                except Exception as e:
                    stats.failed += 1
                    if len(stats.errors) < 100:
                        stats.errors.append(f"Sleeper error: {e}")

            if not self.dry_run:
                conn.commit()

        finally:
            conn.close()

        logger.info(
            f"Sleeper: {stats.created} created, {stats.matched_exact} existing, "
            f"{stats.matched_crosswalk} crosswalk, {stats.skipped} skipped"
        )
        self.stats["sleeper"] = stats
        return stats

    def _iter_sleeper_json(self, data: dict) -> Iterator[dict]:
        """Iterate over Sleeper JSON data."""
        for sleeper_id, player in data.items():
            if not isinstance(player, dict):
                continue
            player["sleeper_id"] = sleeper_id
            full_name = player.get("full_name") or (
                f"{player.get('first_name', '')} {player.get('last_name', '')}".strip()
            )
            player["full_name"] = full_name
            player["birth_date"] = player.get("birth_date") or player.get("birthdate")
            yield player

    def _iter_sleeper_csv(self, df) -> Iterator[dict]:
        """Iterate over Sleeper CSV data."""
        for _, row in df.iterrows():
            yield row.to_dict()

    # -------------------------------------------------------------------------
    # Source 3: ESPN Athletes
    # -------------------------------------------------------------------------

    def load_espn_athletes(self) -> LoadStats:
        """Load players from ESPN Athletes Index."""
        stats = LoadStats(source="espn")

        if not ESPN_ATHLETES_INDEX.exists():
            logger.warning(f"ESPN athletes index not found at {ESPN_ATHLETES_INDEX}. Skipping.")
            stats.skipped = 1
            stats.errors.append("ESPN data not available")
            self.stats["espn"] = stats
            return stats

        pd = self._get_pandas()
        logger.info(f"Loading ESPN athletes from {ESPN_ATHLETES_INDEX}...")
        df = pd.read_csv(ESPN_ATHLETES_INDEX)
        stats.total_records = len(df)

        logger.info(f"Processing {stats.total_records} ESPN athletes...")

        conn = self._get_connection()
        try:
            for _, row in df.iterrows():
                try:
                    espn_id = row.get("espn_id") or row.get("id")
                    if not espn_id or str(espn_id) == "nan":
                        stats.skipped += 1
                        continue

                    espn_id = str(int(float(espn_id))) if espn_id else None
                    if not espn_id:
                        stats.skipped += 1
                        continue

                    # Check if already in database
                    existing_uid = self._identifier_exists(conn, "espn", espn_id)
                    if existing_uid:
                        stats.matched_exact += 1
                        continue

                    # Try to match by name + DOB
                    full_name = row.get("fullName") or row.get("full_name") or ""
                    birth_date = normalize_dob(row.get("dateOfBirth", "") or row.get("birth_date", ""))
                    name_norm = normalize_name(full_name)

                    if name_norm and birth_date:
                        matched_uid = self._player_exists(conn, name_norm, birth_date)
                        if matched_uid:
                            self._add_identifier(
                                conn, matched_uid, "espn", espn_id,
                                confidence=0.85, match_method="name_dob"
                            )
                            stats.matched_fuzzy += 1
                            continue

                    # Try name-only match (lower confidence)
                    if name_norm:
                        matched_uid = self._player_exists(conn, name_norm)
                        if matched_uid:
                            self._add_identifier(
                                conn, matched_uid, "espn", espn_id,
                                confidence=0.70, match_method="name_only"
                            )
                            stats.matched_fuzzy += 1
                            continue

                    # Create new player (ESPN-only)
                    if not full_name:
                        stats.skipped += 1
                        continue

                    position = row.get("position") or row.get("positionAbbreviation")
                    team = row.get("team") or row.get("currentTeam")

                    player_uid = self._create_player(
                        conn,
                        canonical_name=full_name,
                        position=position,
                        birth_date=birth_date if birth_date else None,
                        college=row.get("college"),
                        current_team=team,
                        status="active"
                    )

                    self._add_identifier(conn, player_uid, "espn", espn_id, 1.0, "exact")
                    stats.created += 1

                except Exception as e:
                    stats.failed += 1
                    if len(stats.errors) < 100:
                        stats.errors.append(f"ESPN error: {e}")

            if not self.dry_run:
                conn.commit()

        finally:
            conn.close()

        logger.info(
            f"ESPN: {stats.created} created, {stats.matched_exact} existing, "
            f"{stats.matched_fuzzy} fuzzy, {stats.skipped} skipped"
        )
        self.stats["espn"] = stats
        return stats

    # -------------------------------------------------------------------------
    # Source 4: Sportradar
    # -------------------------------------------------------------------------

    def load_sportradar(self) -> LoadStats:
        """Load players from Sportradar team roster files."""
        stats = LoadStats(source="sportradar")

        if not SPORTRADAR_TEAMS_DIR.exists():
            logger.warning(f"Sportradar teams directory not found. Skipping.")
            stats.skipped = 1
            stats.errors.append("Sportradar data not available")
            self.stats["sportradar"] = stats
            return stats

        roster_files = list(SPORTRADAR_TEAMS_DIR.glob("*.json"))
        if not roster_files:
            logger.warning("No Sportradar roster files found. Skipping.")
            stats.skipped = 1
            self.stats["sportradar"] = stats
            return stats

        logger.info(f"Loading Sportradar players from {len(roster_files)} team files...")

        conn = self._get_connection()
        try:
            for roster_file in roster_files:
                try:
                    data = json.loads(roster_file.read_text())
                    players = data.get("players", [])

                    for player in players:
                        stats.total_records += 1
                        try:
                            sr_id = player.get("id")
                            if not sr_id:
                                stats.skipped += 1
                                continue

                            # Check if already exists
                            existing_uid = self._identifier_exists(conn, "sportradar", sr_id)
                            if existing_uid:
                                stats.matched_exact += 1
                                continue

                            # Try to match by name + DOB
                            full_name = player.get("name", "")
                            birth_date = normalize_dob(player.get("birth_date", ""))
                            name_norm = normalize_name(full_name)

                            if name_norm and birth_date:
                                matched_uid = self._player_exists(conn, name_norm, birth_date)
                                if matched_uid:
                                    self._add_identifier(
                                        conn, matched_uid, "sportradar", sr_id,
                                        confidence=0.85, match_method="name_dob"
                                    )
                                    stats.matched_fuzzy += 1
                                    continue

                            # Try name-only match
                            if name_norm:
                                matched_uid = self._player_exists(conn, name_norm)
                                if matched_uid:
                                    self._add_identifier(
                                        conn, matched_uid, "sportradar", sr_id,
                                        confidence=0.70, match_method="name_only"
                                    )
                                    stats.matched_fuzzy += 1
                                    continue

                            # Create new player
                            position = player.get("position")
                            player_uid = self._create_player(
                                conn,
                                canonical_name=full_name,
                                position=position,
                                birth_date=birth_date if birth_date else None,
                                college=player.get("college"),
                                current_team=player.get("team", {}).get("abbreviation"),
                                status="active"
                            )

                            self._add_identifier(
                                conn, player_uid, "sportradar", sr_id, 1.0, "exact"
                            )
                            stats.created += 1

                        except Exception as e:
                            stats.failed += 1
                            if len(stats.errors) < 100:
                                stats.errors.append(f"Sportradar player error: {e}")

                except Exception as e:
                    stats.failed += 1
                    stats.errors.append(f"Sportradar file error ({roster_file.name}): {e}")

            if not self.dry_run:
                conn.commit()

        finally:
            conn.close()

        logger.info(
            f"Sportradar: {stats.created} created, {stats.matched_exact} existing, "
            f"{stats.matched_fuzzy} fuzzy"
        )
        self.stats["sportradar"] = stats
        return stats

    # -------------------------------------------------------------------------
    # Source 5: Manual Mappings
    # -------------------------------------------------------------------------

    def load_manual_mappings(self) -> LoadStats:
        """Load historical manual mappings and overrides."""
        stats = LoadStats(source="manual")

        mappings_loaded = 0

        # Load manual_mappings.json
        if MANUAL_MAPPINGS_PATH.exists():
            try:
                data = json.loads(MANUAL_MAPPINGS_PATH.read_text())
                mappings = data.get("mappings", data)

                conn = self._get_connection()
                try:
                    for mapping in mappings:
                        player_uid = mapping.get("player_uid")
                        identifiers = mapping.get("identifiers", {})

                        if not player_uid:
                            continue

                        for source, ext_id in identifiers.items():
                            if self._add_identifier(
                                conn, player_uid, source, str(ext_id),
                                confidence=1.0, match_method="manual"
                            ):
                                mappings_loaded += 1
                                stats.matched_exact += 1

                    if not self.dry_run:
                        conn.commit()
                finally:
                    conn.close()

            except Exception as e:
                stats.errors.append(f"Failed to load manual_mappings.json: {e}")

        # Load manual_overrides.json
        if MANUAL_OVERRIDES_PATH.exists():
            try:
                data = json.loads(MANUAL_OVERRIDES_PATH.read_text())
                overrides = data.get("overrides", data)

                conn = self._get_connection()
                try:
                    for key, override in overrides.items():
                        # Key format: "source:external_id"
                        if ":" not in key:
                            continue

                        source, ext_id = key.split(":", 1)
                        player_uid = override.get("player_uid")

                        if not player_uid:
                            continue

                        if self._add_identifier(
                            conn, player_uid, source, ext_id,
                            confidence=1.0, match_method="manual"
                        ):
                            mappings_loaded += 1
                            stats.matched_exact += 1

                    if not self.dry_run:
                        conn.commit()
                finally:
                    conn.close()

            except Exception as e:
                stats.errors.append(f"Failed to load manual_overrides.json: {e}")

        stats.total_records = mappings_loaded
        logger.info(f"Manual: {mappings_loaded} mappings loaded")
        self.stats["manual"] = stats
        return stats

    # -------------------------------------------------------------------------
    # Audit Report
    # -------------------------------------------------------------------------

    def generate_audit_report(self) -> dict[str, Any]:
        """Generate a comprehensive audit report."""
        conn = self._get_connection()
        try:
            # Get database stats
            cursor = conn.execute("SELECT COUNT(*) FROM players")
            total_players = cursor.fetchone()[0]

            cursor = conn.execute("SELECT COUNT(*) FROM player_identifiers")
            total_identifiers = cursor.fetchone()[0]

            cursor = conn.execute("""
                SELECT source, COUNT(*) as count
                FROM player_identifiers
                GROUP BY source
                ORDER BY count DESC
            """)
            identifiers_by_source = dict(cursor.fetchall())

            cursor = conn.execute("""
                SELECT match_method, COUNT(*) as count, AVG(confidence) as avg_conf
                FROM player_identifiers
                GROUP BY match_method
            """)
            by_method = [
                {"method": r[0], "count": r[1], "avg_confidence": r[2]}
                for r in cursor.fetchall()
            ]

            # Low confidence identifiers
            cursor = conn.execute("""
                SELECT p.canonical_name, pi.source, pi.external_id, pi.confidence, pi.match_method
                FROM player_identifiers pi
                JOIN players p ON pi.player_uid = p.player_uid
                WHERE pi.confidence < 0.80
                ORDER BY pi.confidence ASC
                LIMIT 100
            """)
            low_confidence = [
                {
                    "name": r[0], "source": r[1], "external_id": r[2],
                    "confidence": r[3], "method": r[4]
                }
                for r in cursor.fetchall()
            ]

            # Players missing key identifiers
            cursor = conn.execute("""
                SELECT p.player_uid, p.canonical_name, p.position
                FROM players p
                WHERE p.status = 'active'
                AND NOT EXISTS (
                    SELECT 1 FROM player_identifiers pi
                    WHERE pi.player_uid = p.player_uid AND pi.source = 'sleeper'
                )
                LIMIT 100
            """)
            missing_sleeper = [
                {"player_uid": r[0], "name": r[1], "position": r[2]}
                for r in cursor.fetchall()
            ]

        finally:
            conn.close()

        report = {
            "generated_at": datetime.now().isoformat(),
            "session_id": self.session_id,
            "summary": {
                "total_players": total_players,
                "total_identifiers": total_identifiers,
                "identifiers_by_source": identifiers_by_source,
                "by_match_method": by_method
            },
            "load_stats": {k: v.to_dict() for k, v in self.stats.items()},
            "quality_issues": {
                "low_confidence_count": len(low_confidence),
                "low_confidence_samples": low_confidence[:20],
                "missing_sleeper_count": len(missing_sleeper),
                "missing_sleeper_samples": missing_sleeper[:20]
            }
        }

        return report

    def save_audit_report(self, output_path: Path = AUDIT_REPORT_PATH):
        """Save the audit report to a file."""
        report = self.generate_audit_report()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, indent=2))
        logger.info(f"Audit report saved to {output_path}")
        return report

    # -------------------------------------------------------------------------
    # Main Load Methods
    # -------------------------------------------------------------------------

    def load_all(self) -> dict[str, LoadStats]:
        """
        Load all data sources in the recommended order.

        Order matters for optimal matching:
        1. NFLverse (best ID coverage, creates base records)
        2. Sleeper (current fantasy platform)
        3. ESPN (historical and current)
        4. Sportradar (enrichment)
        5. Manual mappings (overrides)
        """
        logger.info("=" * 60)
        logger.info("Starting full data load")
        logger.info(f"Session ID: {self.session_id}")
        logger.info(f"Dry run: {self.dry_run}")
        logger.info("=" * 60)

        self.load_nflverse_players()
        self.load_sleeper_players()
        self.load_espn_athletes()
        self.load_sportradar()
        self.load_manual_mappings()

        logger.info("=" * 60)
        logger.info("Load complete. Summary:")
        for source, stats in self.stats.items():
            logger.info(
                f"  {source}: {stats.created} created, "
                f"{stats.matched_exact + stats.matched_crosswalk + stats.matched_fuzzy} matched, "
                f"{stats.failed} failed"
            )
        logger.info("=" * 60)

        return self.stats


def main():
    parser = argparse.ArgumentParser(
        description="Load player data from all sources into identity database"
    )

    # Source selection
    parser.add_argument("--all", action="store_true",
                        help="Load all sources")
    parser.add_argument("--nflverse", action="store_true",
                        help="Load NFLverse players")
    parser.add_argument("--sleeper", action="store_true",
                        help="Load Sleeper players")
    parser.add_argument("--espn", action="store_true",
                        help="Load ESPN athletes")
    parser.add_argument("--sportradar", action="store_true",
                        help="Load Sportradar rosters")
    parser.add_argument("--manual", action="store_true",
                        help="Load manual mappings")

    # Options
    parser.add_argument("--dry-run", action="store_true",
                        help="Don't modify database")
    parser.add_argument("--audit-report", action="store_true",
                        help="Generate audit report")
    parser.add_argument("--db", type=Path, default=IDENTITY_DB_PATH,
                        help=f"Database path (default: {IDENTITY_DB_PATH})")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="Verbose output")

    args = parser.parse_args()

    # Check if database exists
    if not args.db.exists():
        logger.error(
            f"Identity database not found at {args.db}. "
            "Run 'python scripts/db/init_db.py --init' first."
        )
        sys.exit(1)

    loader = PlayerIndexLoader(
        db_path=args.db,
        dry_run=args.dry_run,
        verbose=args.verbose
    )

    # Determine which sources to load
    if args.all:
        loader.load_all()
    else:
        if args.nflverse:
            loader.load_nflverse_players()
        if args.sleeper:
            loader.load_sleeper_players()
        if args.espn:
            loader.load_espn_athletes()
        if args.sportradar:
            loader.load_sportradar()
        if args.manual:
            loader.load_manual_mappings()

    # Generate audit report if requested
    if args.audit_report or args.all:
        loader.save_audit_report()


if __name__ == "__main__":
    main()
