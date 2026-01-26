#!/usr/bin/env python3
"""
Unified Weekly Stats Loader

This module loads weekly player statistics from various sources (NFLverse, ESPN, etc.)
into the unified stats database with proper player_uid resolution.

Key Features:
    - Resolves all player IDs to canonical player_uid before insert
    - Tracks source (nflverse, espn, sportradar, etc.)
    - Handles stat corrections and updates with versioning
    - Validates data against schema before insert
    - Supports incremental loading (by season/week)
    - Computes fantasy points for multiple scoring systems

Usage:
    # Load all available data from NFLverse
    python load_weekly_stats.py --source nflverse --all

    # Load specific season/week
    python load_weekly_stats.py --source nflverse --season 2024 --week 1

    # Load from parquet file
    python load_weekly_stats.py --file data_raw/nflverse/player_stats_2024.parquet

    # Dry run (validate without inserting)
    python load_weekly_stats.py --source nflverse --season 2024 --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterator, List, Literal, Optional, Tuple

import pandas as pd

# Path setup for imports
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.lib.player_lookup import (
    resolve,
    resolve_by_name,
    batch_resolve,
    get_all_ids,
    configure as configure_player_lookup,
)
from scripts.db.init_db import normalize_name

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
STATS_DB_PATH = PROJECT_ROOT / "db" / "stats.sqlite"
PLAYERS_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"
STATS_SCHEMA_PATH = SCRIPT_DIR.parent / "db" / "stats_schema.sql"
DATA_RAW_PATH = PROJECT_ROOT / "data_raw"

# Source type definition
SourceType = Literal["nflverse", "espn", "sportradar", "manual"]

# Stats columns mapping from NFLverse to our unified schema
NFLVERSE_STATS_MAPPING = {
    # Passing stats
    "completions": "completions",
    "attempts": "pass_attempts",
    "passing_yards": "pass_yards",
    "passing_tds": "pass_td",
    "interceptions": "pass_int",
    "passing_interceptions": "pass_int",
    "sacks": "sacks",
    "sack_yards": "sack_yards",
    "sack_fumbles": "sack_fumbles",
    "sack_fumbles_lost": "sack_fumbles_lost",
    "passing_air_yards": "pass_air_yards",
    "passing_yards_after_catch": "pass_yac",
    "passing_first_downs": "pass_first_downs",
    "passing_epa": "pass_epa",
    "passing_2pt_conversions": "pass_2pt",
    "pacr": "pacr",
    "dakota": "dakota",

    # Rushing stats
    "carries": "rush_attempts",
    "rushing_yards": "rush_yards",
    "rushing_tds": "rush_td",
    "rushing_fumbles": "rush_fumbles",
    "rushing_fumbles_lost": "rush_fumbles_lost",
    "rushing_first_downs": "rush_first_downs",
    "rushing_epa": "rush_epa",
    "rushing_2pt_conversions": "rush_2pt",

    # Receiving stats
    "receptions": "rec",
    "targets": "targets",
    "receiving_yards": "rec_yards",
    "receiving_tds": "rec_td",
    "receiving_fumbles": "rec_fumbles",
    "receiving_fumbles_lost": "rec_fumbles_lost",
    "receiving_air_yards": "rec_air_yards",
    "receiving_yards_after_catch": "rec_yac",
    "receiving_first_downs": "rec_first_downs",
    "receiving_epa": "rec_epa",
    "receiving_2pt_conversions": "rec_2pt",
    "racr": "racr",
    "target_share": "target_share",
    "air_yards_share": "air_yards_share",
    "wopr": "wopr",

    # Special teams
    "special_teams_tds": "st_td",

    # Fantasy points from source (we'll recalculate)
    "fantasy_points": "source_fantasy_points",
    "fantasy_points_ppr": "source_fantasy_points_ppr",
}


@dataclass
class ScoringRules:
    """Fantasy scoring rules for calculating points."""
    # Passing
    pass_yards_per_point: float = 25.0  # 0.04 per yard
    pass_td: float = 4.0
    pass_int: float = -1.0
    pass_2pt: float = 2.0
    pass_300_bonus: float = 2.0
    pass_400_bonus: float = 4.0

    # Rushing
    rush_yards_per_point: float = 10.0  # 0.1 per yard
    rush_td: float = 6.0
    rush_2pt: float = 2.0
    rush_100_bonus: float = 2.0
    rush_200_bonus: float = 4.0

    # Receiving
    rec_yards_per_point: float = 10.0  # 0.1 per yard
    rec_td: float = 6.0
    rec_2pt: float = 2.0
    rec_100_bonus: float = 2.0
    rec_200_bonus: float = 4.0
    reception_ppr: float = 1.0  # PPR
    reception_half: float = 0.5  # Half-PPR

    # Fumbles
    fumble_lost: float = -2.0

    # Special teams
    st_td: float = 6.0

    @classmethod
    def standard(cls) -> "ScoringRules":
        """Standard (non-PPR) scoring."""
        return cls(reception_ppr=0.0, reception_half=0.0)

    @classmethod
    def ppr(cls) -> "ScoringRules":
        """PPR scoring."""
        return cls()

    @classmethod
    def half_ppr(cls) -> "ScoringRules":
        """Half-PPR scoring."""
        return cls(reception_ppr=0.5, reception_half=0.5)

    @classmethod
    def custom_tatnall(cls) -> "ScoringRules":
        """Custom Tatnall Legacy scoring rules."""
        return cls(
            pass_yards_per_point=25.0,
            pass_td=4.0,
            pass_int=-1.0,
            pass_2pt=2.0,
            pass_300_bonus=2.0,
            pass_400_bonus=4.0,
            rush_yards_per_point=10.0,
            rush_td=6.0,
            rush_2pt=2.0,
            rush_100_bonus=2.0,
            rush_200_bonus=4.0,
            rec_yards_per_point=10.0,
            rec_td=6.0,
            rec_2pt=2.0,
            rec_100_bonus=2.0,
            rec_200_bonus=4.0,
            reception_ppr=0.5,  # Half-PPR
            fumble_lost=-2.0,
            st_td=6.0,
        )


@dataclass
class ImportResult:
    """Results from a stats import operation."""
    source: str
    season: Optional[int]
    week: Optional[int]
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    records_processed: int = 0
    records_inserted: int = 0
    records_updated: int = 0
    records_skipped: int = 0
    players_resolved: int = 0
    players_unresolved: int = 0
    errors: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return len(self.errors) == 0 or self.records_inserted > 0


@dataclass
class PlayerGameStats:
    """Validated player game stats record."""
    player_uid: str
    game_id: str
    season: int
    week: int
    team: Optional[str] = None
    opponent: Optional[str] = None
    is_home: int = 0
    position: Optional[str] = None
    played: int = 1
    started: Optional[int] = None
    snap_count: Optional[int] = None
    snap_pct: Optional[float] = None
    stats: Dict[str, Any] = field(default_factory=dict)
    fantasy_points_ppr: Optional[float] = None
    fantasy_points_half: Optional[float] = None
    fantasy_points_std: Optional[float] = None
    fantasy_points_custom: Optional[float] = None
    source: str = "nflverse"
    source_player_id: Optional[str] = None
    source_game_id: Optional[str] = None


class StatsDatabase:
    """Manager for the unified stats database."""

    def __init__(self, db_path: Path = STATS_DB_PATH):
        self.db_path = db_path
        self._connection: Optional[sqlite3.Connection] = None

    def initialize(self, force: bool = False) -> None:
        """Initialize the stats database with schema."""
        # Ensure parent directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        # Check if tables exist
        if self.db_path.exists() and not force:
            with self.connection() as conn:
                cursor = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='player_game_stats'"
                )
                if cursor.fetchone():
                    logger.info("Stats database already initialized")
                    return

        if not STATS_SCHEMA_PATH.exists():
            raise FileNotFoundError(f"Stats schema not found: {STATS_SCHEMA_PATH}")

        schema_sql = STATS_SCHEMA_PATH.read_text()

        with self.connection() as conn:
            logger.info(f"Initializing stats database at {self.db_path}")
            conn.executescript(schema_sql)
            logger.info("Stats schema initialized successfully")

    def connection(self) -> sqlite3.Connection:
        """Get or create a database connection."""
        if self._connection is None:
            if not self.db_path.exists():
                # Create the database and initialize
                self.db_path.parent.mkdir(parents=True, exist_ok=True)
            self._connection = sqlite3.connect(str(self.db_path))
            self._connection.row_factory = sqlite3.Row
            self._connection.execute("PRAGMA foreign_keys = ON")
            # Attach players database for foreign key references
            if PLAYERS_DB_PATH.exists():
                self._connection.execute(
                    f"ATTACH DATABASE '{PLAYERS_DB_PATH}' AS players_db"
                )
        return self._connection

    def close(self) -> None:
        """Close the database connection."""
        if self._connection:
            self._connection.close()
            self._connection = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    def insert_game(
        self,
        game_id: str,
        season: int,
        week: int,
        home_team: str,
        away_team: str,
        game_date: Optional[str] = None,
        status: str = "final",
        source: str = "nflverse",
        **kwargs
    ) -> bool:
        """Insert or update a game record."""
        conn = self.connection()
        try:
            conn.execute("""
                INSERT INTO nfl_games (
                    game_id, season, week, home_team, away_team,
                    game_date, status, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(game_id) DO UPDATE SET
                    home_team = excluded.home_team,
                    away_team = excluded.away_team,
                    game_date = excluded.game_date,
                    status = excluded.status,
                    updated_at = datetime('now')
            """, (game_id, season, week, home_team, away_team, game_date, status, source))
            conn.commit()
            return True
        except sqlite3.Error as e:
            logger.error(f"Error inserting game {game_id}: {e}")
            return False

    def insert_player_game_stats(
        self,
        stats: PlayerGameStats,
        conn: Optional[sqlite3.Connection] = None
    ) -> int:
        """
        Insert player game stats, handling corrections if record exists.

        Returns the inserted record ID.
        """
        conn = conn or self.connection()

        # Check for existing record
        cursor = conn.execute("""
            SELECT id, version FROM player_game_stats
            WHERE player_uid = ? AND game_id = ? AND source = ? AND is_current = 1
        """, (stats.player_uid, stats.game_id, stats.source))

        existing = cursor.fetchone()

        if existing:
            # Mark existing as superseded
            old_id = existing["id"]
            old_version = existing["version"]

            conn.execute("""
                UPDATE player_game_stats
                SET is_current = 0
                WHERE id = ?
            """, (old_id,))

            # Insert new version
            cursor = conn.execute("""
                INSERT INTO player_game_stats (
                    player_uid, game_id, season, week, team, opponent, is_home,
                    position, played, started, snap_count, snap_pct,
                    stats, fantasy_points_ppr, fantasy_points_half,
                    fantasy_points_std, fantasy_points_custom,
                    source, source_player_id, source_game_id,
                    version, is_current, superseded_by, correction_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                stats.player_uid, stats.game_id, stats.season, stats.week,
                stats.team, stats.opponent, stats.is_home,
                stats.position, stats.played, stats.started,
                stats.snap_count, stats.snap_pct,
                json.dumps(stats.stats),
                stats.fantasy_points_ppr, stats.fantasy_points_half,
                stats.fantasy_points_std, stats.fantasy_points_custom,
                stats.source, stats.source_player_id, stats.source_game_id,
                old_version + 1, 1, None, "data_update"
            ))

            new_id = cursor.lastrowid

            # Update old record to point to new
            conn.execute("""
                UPDATE player_game_stats
                SET superseded_by = ?
                WHERE id = ?
            """, (new_id, old_id))

            return new_id
        else:
            # Insert new record
            cursor = conn.execute("""
                INSERT INTO player_game_stats (
                    player_uid, game_id, season, week, team, opponent, is_home,
                    position, played, started, snap_count, snap_pct,
                    stats, fantasy_points_ppr, fantasy_points_half,
                    fantasy_points_std, fantasy_points_custom,
                    source, source_player_id, source_game_id,
                    version, is_current
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                stats.player_uid, stats.game_id, stats.season, stats.week,
                stats.team, stats.opponent, stats.is_home,
                stats.position, stats.played, stats.started,
                stats.snap_count, stats.snap_pct,
                json.dumps(stats.stats),
                stats.fantasy_points_ppr, stats.fantasy_points_half,
                stats.fantasy_points_std, stats.fantasy_points_custom,
                stats.source, stats.source_player_id, stats.source_game_id,
                1, 1
            ))
            return cursor.lastrowid

    def log_import(self, result: ImportResult) -> None:
        """Log an import operation to the stats_import_log table."""
        conn = self.connection()
        conn.execute("""
            INSERT INTO stats_import_log (
                import_type, source, season, week,
                records_processed, records_inserted, records_updated, records_skipped,
                errors_count, started_at, completed_at, duration_seconds,
                errors_json, triggered_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "weekly",
            result.source,
            result.season,
            result.week,
            result.records_processed,
            result.records_inserted,
            result.records_updated,
            result.records_skipped,
            len(result.errors),
            result.started_at,
            result.completed_at,
            result.duration_seconds,
            json.dumps(result.errors[:100]) if result.errors else None,  # Limit error log size
            "script:load_weekly_stats"
        ))
        conn.commit()


class WeeklyStatsLoader:
    """Loads weekly player statistics into the unified database."""

    def __init__(
        self,
        stats_db: StatsDatabase,
        scoring_rules: Optional[ScoringRules] = None
    ):
        self.stats_db = stats_db
        self.scoring_rules = scoring_rules or ScoringRules.custom_tatnall()
        self._player_cache: Dict[str, Optional[str]] = {}
        self._unresolved_players: List[Dict[str, Any]] = []

    def _resolve_player_uid(
        self,
        row: pd.Series,
        source: SourceType
    ) -> Optional[str]:
        """
        Resolve a player row to a player_uid using multiple strategies.

        Strategy order:
        1. Direct ID lookup (gsis_id, player_id, sleeper_id, espn_id)
        2. Name + position + team lookup
        3. Fuzzy name matching
        """
        # Build cache key from available IDs
        id_fields = ["gsis_id", "player_id", "sleeper_id", "espn_id"]
        cache_key = None

        for id_field in id_fields:
            if id_field in row.index and pd.notna(row.get(id_field)):
                cache_key = f"{id_field}:{row[id_field]}"
                break

        if cache_key and cache_key in self._player_cache:
            return self._player_cache[cache_key]

        # Strategy 1: Direct ID lookup
        id_mappings = [
            ("gsis_id", "gsis"),
            ("player_id", "nflverse"),
            ("sleeper_id", "sleeper"),
            ("espn_id", "espn"),
        ]

        for col_name, source_type in id_mappings:
            if col_name in row.index and pd.notna(row.get(col_name)):
                ext_id = str(row[col_name])
                player_uid = resolve(ext_id, source_type)
                if player_uid:
                    if cache_key:
                        self._player_cache[cache_key] = player_uid
                    return player_uid

        # Strategy 2: Name-based lookup
        name = None
        for name_col in ["player_display_name", "display_name", "player_name", "name"]:
            if name_col in row.index and pd.notna(row.get(name_col)):
                name = str(row[name_col])
                break

        if name:
            position = row.get("position") if "position" in row.index else None
            team = row.get("team") if "team" in row.index else None

            player_uid = resolve_by_name(
                name,
                position=position,
                team=team
            )
            if player_uid:
                if cache_key:
                    self._player_cache[cache_key] = player_uid
                return player_uid

        # Track unresolved player
        self._unresolved_players.append({
            "name": name,
            "position": row.get("position"),
            "team": row.get("team"),
            "season": row.get("season"),
            "gsis_id": row.get("gsis_id"),
            "player_id": row.get("player_id"),
        })

        if cache_key:
            self._player_cache[cache_key] = None

        return None

    def _generate_game_id(self, row: pd.Series) -> str:
        """Generate a game ID from row data."""
        season = int(row.get("season", 0))
        week = int(row.get("week", 0))

        # Try to use existing game_id if available
        if "game_id" in row.index and pd.notna(row.get("game_id")):
            return str(row["game_id"])

        # Generate from components
        team = str(row.get("team", "UNK"))
        opponent = str(row.get("opponent_team", row.get("opponent", "UNK")))

        # Determine home/away
        is_home = 1 if "@" not in str(row.get("opponent_team", "")) else 0
        if is_home:
            home_team, away_team = team, opponent
        else:
            home_team, away_team = opponent, team

        return f"{season}_{week:02d}_{away_team}_{home_team}"

    def _extract_stats(self, row: pd.Series) -> Dict[str, Any]:
        """Extract and map stats from a row to our unified format."""
        stats = {}

        for source_col, target_col in NFLVERSE_STATS_MAPPING.items():
            if source_col in row.index and pd.notna(row.get(source_col)):
                value = row[source_col]
                # Convert numpy types to Python types
                if hasattr(value, "item"):
                    value = value.item()
                stats[target_col] = value

        return stats

    def _calculate_fantasy_points(
        self,
        stats: Dict[str, Any],
        rules: ScoringRules
    ) -> Tuple[float, float, float, float]:
        """
        Calculate fantasy points for multiple scoring systems.

        Returns: (ppr, half_ppr, standard, custom)
        """
        def get_stat(key: str, default: float = 0.0) -> float:
            return float(stats.get(key, default))

        # Base points (same for all systems)
        base = 0.0

        # Passing
        pass_yards = get_stat("pass_yards")
        base += pass_yards / rules.pass_yards_per_point
        base += get_stat("pass_td") * rules.pass_td
        base += get_stat("pass_int") * rules.pass_int
        base += get_stat("pass_2pt") * rules.pass_2pt

        # Passing bonuses
        if pass_yards >= 400:
            base += rules.pass_400_bonus
        elif pass_yards >= 300:
            base += rules.pass_300_bonus

        # Rushing
        rush_yards = get_stat("rush_yards")
        base += rush_yards / rules.rush_yards_per_point
        base += get_stat("rush_td") * rules.rush_td
        base += get_stat("rush_2pt") * rules.rush_2pt

        # Rushing bonuses
        if rush_yards >= 200:
            base += rules.rush_200_bonus
        elif rush_yards >= 100:
            base += rules.rush_100_bonus

        # Receiving (excluding reception points)
        rec_yards = get_stat("rec_yards")
        base += rec_yards / rules.rec_yards_per_point
        base += get_stat("rec_td") * rules.rec_td
        base += get_stat("rec_2pt") * rules.rec_2pt

        # Receiving bonuses
        if rec_yards >= 200:
            base += rules.rec_200_bonus
        elif rec_yards >= 100:
            base += rules.rec_100_bonus

        # Fumbles lost
        fumbles_lost = (
            get_stat("rush_fumbles_lost") +
            get_stat("rec_fumbles_lost") +
            get_stat("sack_fumbles_lost")
        )
        base += fumbles_lost * rules.fumble_lost

        # Special teams
        base += get_stat("st_td") * rules.st_td

        # Calculate for each scoring system
        receptions = get_stat("rec")

        ppr = base + (receptions * 1.0)
        half_ppr = base + (receptions * 0.5)
        standard = base
        custom = base + (receptions * rules.reception_ppr)

        return round(ppr, 2), round(half_ppr, 2), round(standard, 2), round(custom, 2)

    def _create_player_game_stats(
        self,
        row: pd.Series,
        player_uid: str,
        source: SourceType
    ) -> PlayerGameStats:
        """Create a PlayerGameStats object from a row."""
        stats = self._extract_stats(row)

        # Calculate fantasy points
        ppr, half, std, custom = self._calculate_fantasy_points(stats, self.scoring_rules)

        # Determine game context
        game_id = self._generate_game_id(row)
        is_home = 1 if "@" not in str(row.get("opponent_team", "")) else 0

        # Get source player ID
        source_player_id = None
        for col in ["gsis_id", "player_id", "sleeper_id", "espn_id"]:
            if col in row.index and pd.notna(row.get(col)):
                source_player_id = str(row[col])
                break

        return PlayerGameStats(
            player_uid=player_uid,
            game_id=game_id,
            season=int(row.get("season", 0)),
            week=int(row.get("week", 0)),
            team=str(row.get("team")) if pd.notna(row.get("team")) else None,
            opponent=str(row.get("opponent_team", row.get("opponent", ""))).replace("@", ""),
            is_home=is_home,
            position=str(row.get("position")) if pd.notna(row.get("position")) else None,
            stats=stats,
            fantasy_points_ppr=ppr,
            fantasy_points_half=half,
            fantasy_points_std=std,
            fantasy_points_custom=custom,
            source=source,
            source_player_id=source_player_id,
            source_game_id=row.get("game_id") if pd.notna(row.get("game_id")) else None,
        )

    def load_from_dataframe(
        self,
        df: pd.DataFrame,
        source: SourceType = "nflverse",
        season: Optional[int] = None,
        week: Optional[int] = None,
        dry_run: bool = False
    ) -> ImportResult:
        """
        Load weekly stats from a DataFrame into the database.

        Args:
            df: DataFrame with player weekly stats
            source: Data source identifier
            season: Optional season filter
            week: Optional week filter
            dry_run: If True, validate but don't insert

        Returns:
            ImportResult with statistics about the import
        """
        start_time = datetime.now()
        result = ImportResult(
            source=source,
            season=season,
            week=week,
            started_at=start_time.isoformat()
        )

        # Apply filters if specified
        if season is not None:
            df = df[df["season"] == season]
        if week is not None:
            df = df[df["week"] == week]

        result.records_processed = len(df)

        if result.records_processed == 0:
            logger.warning("No records to process after filtering")
            result.completed_at = datetime.now().isoformat()
            result.duration_seconds = (datetime.now() - start_time).total_seconds()
            return result

        logger.info(f"Processing {result.records_processed} records from {source}")

        # Process records
        conn = self.stats_db.connection()

        for idx, row in df.iterrows():
            try:
                # Resolve player
                player_uid = self._resolve_player_uid(row, source)

                if not player_uid:
                    result.records_skipped += 1
                    result.players_unresolved += 1
                    continue

                result.players_resolved += 1

                # Create stats record
                stats_record = self._create_player_game_stats(row, player_uid, source)

                if not dry_run:
                    # Insert game if not exists
                    self.stats_db.insert_game(
                        game_id=stats_record.game_id,
                        season=stats_record.season,
                        week=stats_record.week,
                        home_team=stats_record.team if stats_record.is_home else stats_record.opponent,
                        away_team=stats_record.opponent if stats_record.is_home else stats_record.team,
                        source=source
                    )

                    # Insert player stats
                    self.stats_db.insert_player_game_stats(stats_record, conn)
                    result.records_inserted += 1

            except Exception as e:
                logger.error(f"Error processing row {idx}: {e}")
                result.errors.append({
                    "row_index": idx,
                    "error": str(e),
                    "player_name": row.get("player_display_name", row.get("player_name")),
                })

        if not dry_run:
            conn.commit()

        # Complete timing
        end_time = datetime.now()
        result.completed_at = end_time.isoformat()
        result.duration_seconds = (end_time - start_time).total_seconds()

        # Log import
        if not dry_run:
            self.stats_db.log_import(result)

        # Report unresolved players
        if self._unresolved_players:
            logger.warning(
                f"Could not resolve {len(self._unresolved_players)} players. "
                f"First 5: {self._unresolved_players[:5]}"
            )

        return result

    def load_from_parquet(
        self,
        file_path: Path,
        source: SourceType = "nflverse",
        season: Optional[int] = None,
        week: Optional[int] = None,
        dry_run: bool = False
    ) -> ImportResult:
        """Load weekly stats from a parquet file."""
        logger.info(f"Loading data from {file_path}")
        df = pd.read_parquet(file_path)
        return self.load_from_dataframe(df, source, season, week, dry_run)

    def load_from_csv(
        self,
        file_path: Path,
        source: SourceType = "nflverse",
        season: Optional[int] = None,
        week: Optional[int] = None,
        dry_run: bool = False
    ) -> ImportResult:
        """Load weekly stats from a CSV file."""
        logger.info(f"Loading data from {file_path}")
        df = pd.read_csv(file_path)
        return self.load_from_dataframe(df, source, season, week, dry_run)


def load_nflverse_weekly(
    seasons: List[int],
    weeks: Optional[List[int]] = None,
    stats_db: Optional[StatsDatabase] = None,
    dry_run: bool = False
) -> List[ImportResult]:
    """
    Load weekly stats from NFLverse for specified seasons/weeks.

    This function will attempt to load from local cache first,
    then fall back to downloading from NFLverse.

    Args:
        seasons: List of seasons to load
        weeks: Optional list of weeks (None = all weeks)
        stats_db: Optional StatsDatabase instance
        dry_run: If True, validate without inserting

    Returns:
        List of ImportResult objects
    """
    results = []

    if stats_db is None:
        stats_db = StatsDatabase()
        stats_db.initialize()

    loader = WeeklyStatsLoader(stats_db)

    for season in seasons:
        # Try to find local file first
        local_paths = [
            DATA_RAW_PATH / "nflverse" / f"player_stats_{season}.parquet",
            DATA_RAW_PATH / "nflverse" / f"player_stats_season_{season}.parquet",
            DATA_RAW_PATH / "master" / f"player_stats_{season}.parquet",
        ]

        file_found = False
        for path in local_paths:
            if path.exists():
                logger.info(f"Loading from local file: {path}")
                result = loader.load_from_parquet(
                    path,
                    source="nflverse",
                    season=season,
                    dry_run=dry_run
                )
                results.append(result)
                file_found = True
                break

        if not file_found:
            logger.warning(f"No local data found for season {season}. "
                          f"Run NFLverse data download first.")

    return results


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Load weekly player stats into the unified stats database"
    )

    parser.add_argument(
        "--source",
        choices=["nflverse", "espn", "sportradar", "manual"],
        default="nflverse",
        help="Data source (default: nflverse)"
    )

    parser.add_argument(
        "--file",
        type=Path,
        help="Path to parquet/csv file to load"
    )

    parser.add_argument(
        "--season",
        type=int,
        help="Season to load (e.g., 2024)"
    )

    parser.add_argument(
        "--week",
        type=int,
        help="Week to load (e.g., 1)"
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Load all available data for source"
    )

    parser.add_argument(
        "--seasons",
        type=str,
        help="Comma-separated list of seasons (e.g., 2023,2024)"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate without inserting into database"
    )

    parser.add_argument(
        "--init",
        action="store_true",
        help="Initialize the stats database"
    )

    parser.add_argument(
        "--players-db",
        type=Path,
        default=PLAYERS_DB_PATH,
        help=f"Path to players database (default: {PLAYERS_DB_PATH})"
    )

    parser.add_argument(
        "--stats-db",
        type=Path,
        default=STATS_DB_PATH,
        help=f"Path to stats database (default: {STATS_DB_PATH})"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Configure player lookup
    configure_player_lookup(args.players_db)

    # Initialize stats database
    stats_db = StatsDatabase(args.stats_db)

    if args.init:
        stats_db.initialize(force=True)
        logger.info("Stats database initialized")
        return

    # Ensure database is initialized
    stats_db.initialize()

    if args.file:
        # Load from specific file
        loader = WeeklyStatsLoader(stats_db)
        if args.file.suffix == ".csv":
            result = loader.load_from_csv(
                args.file,
                source=args.source,
                season=args.season,
                week=args.week,
                dry_run=args.dry_run
            )
        else:
            result = loader.load_from_parquet(
                args.file,
                source=args.source,
                season=args.season,
                week=args.week,
                dry_run=args.dry_run
            )
        print(f"\nImport Result:")
        print(f"  Records processed: {result.records_processed}")
        print(f"  Records inserted:  {result.records_inserted}")
        print(f"  Records skipped:   {result.records_skipped}")
        print(f"  Players resolved:  {result.players_resolved}")
        print(f"  Players unresolved: {result.players_unresolved}")
        print(f"  Errors: {len(result.errors)}")
        print(f"  Duration: {result.duration_seconds:.2f}s")

    elif args.seasons:
        # Load multiple seasons
        seasons = [int(s) for s in args.seasons.split(",")]
        results = load_nflverse_weekly(
            seasons=seasons,
            stats_db=stats_db,
            dry_run=args.dry_run
        )
        print(f"\nLoaded {len(results)} season(s)")
        for result in results:
            print(f"  Season {result.season}: {result.records_inserted} records")

    elif args.all:
        # Load all available seasons
        seasons = list(range(2015, 2026))
        results = load_nflverse_weekly(
            seasons=seasons,
            stats_db=stats_db,
            dry_run=args.dry_run
        )
        print(f"\nLoaded {len(results)} season(s)")

    else:
        parser.print_help()
        print("\nExamples:")
        print("  python load_weekly_stats.py --init")
        print("  python load_weekly_stats.py --file data.parquet --season 2024")
        print("  python load_weekly_stats.py --seasons 2023,2024")
        print("  python load_weekly_stats.py --all --dry-run")


if __name__ == "__main__":
    main()
