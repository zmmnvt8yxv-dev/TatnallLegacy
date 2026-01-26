#!/usr/bin/env python3
"""
Lineup Unification (Phase 3, Task 3.2)

Merges ESPN (2015-2024) + Sleeper (2025+) lineups into unified format.

Features:
    - All player_id fields become player_uid
    - Consistent position slot naming
    - Points validation (cross-check with stats DB)

Usage:
    # Process all available seasons
    python unify_lineups.py --all

    # Process specific season
    python unify_lineups.py --season 2024

    # Process specific source and week
    python unify_lineups.py --source espn --season 2024 --week 1

    # Dry run (no database writes)
    python unify_lineups.py --season 2024 --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Path setup for imports
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from lib.player_lookup import (
    resolve,
    batch_resolve,
    get_canonical_name,
    configure as configure_player_lookup
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
DATA_DIR = PROJECT_ROOT / "data"
DATA_RAW_DIR = PROJECT_ROOT / "data_raw"
LEAGUE_DB_PATH = PROJECT_ROOT / "db" / "league.sqlite"
STATS_DB_PATH = PROJECT_ROOT / "db" / "stats.sqlite"
PLAYERS_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"
SCHEMA_PATH = SCRIPT_DIR.parent / "db" / "league_schema.sql"

# ESPN slot ID to position mapping
ESPN_SLOT_MAP = {
    0: "QB",
    2: "RB",
    4: "WR",
    6: "TE",
    16: "DEF",
    17: "K",
    20: "BN",  # Bench
    21: "IR",  # Injured Reserve
    23: "FLEX",  # RB/WR/TE
    24: "OP",  # Offensive Player (Superflex)
}

# Sleeper slot positions (standard)
SLEEPER_SLOT_ORDER = [
    "QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX",
    "K", "DEF", "BN", "BN", "BN", "BN", "BN", "BN", "IR"
]


@dataclass
class UnifiedLineup:
    """Represents a normalized lineup entry."""
    season: int
    week: int
    team_id: str
    team_name: Optional[str]
    matchup_id: Optional[int]
    player_uid: Optional[str]
    slot: str  # Normalized slot name
    slot_index: int
    is_starter: bool
    points_actual: Optional[float]
    points_projected: Optional[float] = None
    source: str = "unknown"
    source_player_id: Optional[str] = None
    source_slot_id: Optional[str] = None
    resolution_confidence: Optional[float] = None
    resolution_method: Optional[str] = None


class LineupUnifier:
    """
    Unifies lineups from multiple fantasy platforms.

    Handles normalization of position slots, player ID resolution,
    and points validation across ESPN and Sleeper data sources.
    """

    def __init__(
        self,
        league_db_path: Path = LEAGUE_DB_PATH,
        stats_db_path: Path = STATS_DB_PATH,
        players_db_path: Path = PLAYERS_DB_PATH,
        dry_run: bool = False,
        validate_points: bool = False
    ):
        self.league_db_path = league_db_path
        self.stats_db_path = stats_db_path
        self.players_db_path = players_db_path
        self.dry_run = dry_run
        self.validate_points = validate_points

        # Stats tracking
        self.stats = {
            "lineups_processed": 0,
            "lineups_inserted": 0,
            "lineups_updated": 0,
            "lineups_skipped": 0,
            "players_resolved": 0,
            "players_unresolved": 0,
            "points_validated": 0,
            "points_mismatches": 0,
            "errors": []
        }

        # Cache for resolved players
        self._player_cache: Dict[Tuple[str, str], Optional[str]] = {}

        # Configure player lookup
        if players_db_path.exists():
            configure_player_lookup(players_db_path)

    def _get_league_connection(self) -> sqlite3.Connection:
        """Get connection to league database."""
        conn = sqlite3.connect(str(self.league_db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_league_db(self) -> None:
        """Initialize league database with schema if needed."""
        if not self.league_db_path.exists():
            self.league_db_path.parent.mkdir(parents=True, exist_ok=True)

        conn = self._get_league_connection()
        try:
            # Check if schema is already initialized
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='unified_lineups'"
            )
            if cursor.fetchone() is None:
                # Need to initialize - run schema SQL
                if SCHEMA_PATH.exists():
                    schema_sql = SCHEMA_PATH.read_text()
                    conn.executescript(schema_sql)
                    conn.commit()
                    logger.info(f"Initialized league database at {self.league_db_path}")
        finally:
            conn.close()

    def _resolve_player(self, player_id: str, source: str) -> Tuple[Optional[str], Optional[float], Optional[str]]:
        """Resolve a player ID to player_uid with caching."""
        cache_key = (source, player_id)
        if cache_key in self._player_cache:
            uid = self._player_cache[cache_key]
            return uid, 1.0 if uid else None, "exact" if uid else None

        # Handle team defenses
        if self._is_defense(player_id):
            # Defenses don't have player_uid
            self._player_cache[cache_key] = None
            return None, None, None

        player_uid = resolve(player_id, source)
        self._player_cache[cache_key] = player_uid

        if player_uid:
            self.stats["players_resolved"] += 1
            return player_uid, 1.0, "exact"
        else:
            self.stats["players_unresolved"] += 1
            return None, None, None

    def _is_defense(self, player_id: str) -> bool:
        """Check if player_id represents a team defense."""
        # Common patterns for defenses
        if not player_id:
            return False
        # Sleeper uses team abbreviations for DEF
        if len(player_id) <= 3 and player_id.upper() == player_id:
            return True
        # ESPN uses negative IDs for defenses sometimes
        if player_id.startswith("-"):
            return True
        return False

    def _normalize_slot(self, slot_id: Any, index: int, source: str) -> Tuple[str, int, bool]:
        """
        Normalize a slot ID to standard slot name.

        Returns: (slot_name, slot_index, is_starter)
        """
        if source == "espn":
            slot_name = ESPN_SLOT_MAP.get(int(slot_id), f"SLOT{slot_id}")
            is_starter = int(slot_id) not in (20, 21)  # Not bench or IR

            # Add index for same-slot positions
            if slot_name in ("RB", "WR", "BN"):
                return f"{slot_name}", index, is_starter
            return slot_name, 0, is_starter

        elif source == "sleeper":
            # Sleeper provides slots in order
            if index < len(SLEEPER_SLOT_ORDER):
                slot_name = SLEEPER_SLOT_ORDER[index]
            else:
                slot_name = "BN"

            is_starter = slot_name not in ("BN", "IR")
            return slot_name, index, is_starter

        return f"SLOT{slot_id}", index, True

    # -------------------------------------------------------------------------
    # Sleeper Lineup Processing
    # -------------------------------------------------------------------------

    def _load_sleeper_teams(self, season: int) -> Dict[str, Dict[str, Any]]:
        """Load team data from Sleeper for a season."""
        trades_path = DATA_DIR / f"trades-{season}.json"
        if trades_path.exists():
            data = json.loads(trades_path.read_text())
            teams = data.get("teams", [])
            return {
                str(t.get("roster_id")): {
                    "team_name": t.get("team"),
                    "owner_name": t.get("owner_name")
                }
                for t in teams
            }
        return {}

    def _process_sleeper_lineup(
        self,
        season: int,
        week: int,
        lineup_data: Dict[str, Any],
        teams: Dict[str, Dict[str, Any]]
    ) -> List[UnifiedLineup]:
        """Process a single Sleeper lineup into unified format."""
        unified = []

        roster_id = str(lineup_data.get("roster_id"))
        team_info = teams.get(roster_id, {})
        matchup_id = lineup_data.get("matchup_id")
        points_total = lineup_data.get("points", 0)

        # Get player data
        players = lineup_data.get("players", [])
        starters = set(lineup_data.get("starters", []))
        players_points = lineup_data.get("players_points", {})
        starters_points = lineup_data.get("starters_points", [])

        # Determine slot order based on starters
        starter_list = lineup_data.get("starters", [])

        for idx, player_id in enumerate(players):
            try:
                # Resolve player
                player_uid, confidence, method = self._resolve_player(player_id, "sleeper")

                # Determine if starter and slot
                is_starter = player_id in starters
                if is_starter and player_id in starter_list:
                    starter_idx = starter_list.index(player_id)
                    slot, slot_idx, _ = self._normalize_slot(None, starter_idx, "sleeper")
                else:
                    # Bench player
                    bench_idx = idx - len(starters) if idx >= len(starters) else 0
                    slot = "BN"
                    slot_idx = bench_idx

                # Get points
                points_actual = players_points.get(player_id)
                if points_actual is None and is_starter and player_id in starter_list:
                    starter_idx = starter_list.index(player_id)
                    if starter_idx < len(starters_points):
                        points_actual = starters_points[starter_idx]

                unified.append(UnifiedLineup(
                    season=season,
                    week=week,
                    team_id=roster_id,
                    team_name=team_info.get("team_name"),
                    matchup_id=matchup_id,
                    player_uid=player_uid,
                    slot=slot,
                    slot_index=slot_idx,
                    is_starter=is_starter,
                    points_actual=points_actual,
                    source="sleeper",
                    source_player_id=player_id,
                    source_slot_id=str(idx),
                    resolution_confidence=confidence,
                    resolution_method=method
                ))

            except Exception as e:
                logger.error(f"Error processing Sleeper lineup entry: {e}")
                self.stats["errors"].append({
                    "source": "sleeper",
                    "season": season,
                    "week": week,
                    "roster_id": roster_id,
                    "player_id": player_id,
                    "error": str(e)
                })

        return unified

    def process_sleeper_season(self, season: int, week: Optional[int] = None) -> List[UnifiedLineup]:
        """Process Sleeper lineups for a season."""
        all_lineups = []

        # Load team data
        teams = self._load_sleeper_teams(season)

        # Try lineups file
        lineups_path = DATA_DIR / f"lineups-{season}.json"
        if not lineups_path.exists():
            logger.warning(f"No Sleeper lineups found for season {season}")
            return []

        data = json.loads(lineups_path.read_text())
        lineups = data.get("lineups", data) if isinstance(data, dict) else data

        if not isinstance(lineups, list):
            lineups = [lineups]

        for lineup in lineups:
            lineup_week = lineup.get("week", 1)

            # Filter by week if specified
            if week is not None and lineup_week != week:
                continue

            entries = self._process_sleeper_lineup(season, lineup_week, lineup, teams)
            all_lineups.extend(entries)
            self.stats["lineups_processed"] += 1

        logger.info(f"Processed {len(all_lineups)} Sleeper lineup entries for {season}")
        return all_lineups

    def process_sleeper_week(self, season: int, week: int) -> List[UnifiedLineup]:
        """Process Sleeper lineups for a specific week."""
        return self.process_sleeper_season(season, week=week)

    # -------------------------------------------------------------------------
    # ESPN Lineup Processing
    # -------------------------------------------------------------------------

    def _process_espn_lineup(
        self,
        season: int,
        week: int,
        lineup_data: Dict[str, Any],
        teams: Dict[str, Dict[str, Any]]
    ) -> List[UnifiedLineup]:
        """Process a single ESPN lineup into unified format."""
        unified = []

        team_name = lineup_data.get("team", "")
        player_id = lineup_data.get("player_id", "")
        started = lineup_data.get("started", False)
        points = lineup_data.get("points")

        # Find team_id from team name
        team_id = None
        for tid, tinfo in teams.items():
            if tinfo.get("team_name") == team_name:
                team_id = tid
                break
        if not team_id:
            team_id = team_name  # Use name as ID if not found

        # Resolve player
        player_uid, confidence, method = self._resolve_player(player_id, "espn")

        # Determine slot (ESPN raw data may not have detailed slot info)
        slot = "ROSTER" if started else "BN"

        unified.append(UnifiedLineup(
            season=season,
            week=week,
            team_id=str(team_id),
            team_name=team_name,
            matchup_id=None,
            player_uid=player_uid,
            slot=slot,
            slot_index=0,
            is_starter=started,
            points_actual=points,
            source="espn",
            source_player_id=player_id,
            source_slot_id=None,
            resolution_confidence=confidence,
            resolution_method=method
        ))

        return unified

    def process_espn_season(self, season: int, week: Optional[int] = None) -> List[UnifiedLineup]:
        """Process ESPN lineups for a season."""
        all_lineups = []

        # ESPN lineups are stored by season/week
        espn_dir = DATA_RAW_DIR / "espn_lineups" / str(season)
        if not espn_dir.exists():
            logger.warning(f"No ESPN lineups found for season {season}")
            return []

        # Build team cache from first week's data
        teams: Dict[str, Dict[str, Any]] = {}

        # Process each week
        weeks_to_process = range(1, 19) if week is None else [week]

        for w in weeks_to_process:
            week_path = espn_dir / f"week-{w}.json"
            if not week_path.exists():
                continue

            data = json.loads(week_path.read_text())
            lineups = data.get("lineups", [])

            for lineup in lineups:
                entries = self._process_espn_lineup(season, w, lineup, teams)
                all_lineups.extend(entries)
                self.stats["lineups_processed"] += 1

        logger.info(f"Processed {len(all_lineups)} ESPN lineup entries for {season}")
        return all_lineups

    def process_espn_week(self, season: int, week: int) -> List[UnifiedLineup]:
        """Process ESPN lineups for a specific week."""
        return self.process_espn_season(season, week=week)

    # -------------------------------------------------------------------------
    # Points Validation
    # -------------------------------------------------------------------------

    def _validate_points(
        self,
        lineup: UnifiedLineup
    ) -> Optional[float]:
        """
        Validate lineup points against stats database.

        Returns the stats DB points if available, None otherwise.
        """
        if not self.stats_db_path.exists():
            return None

        if not lineup.player_uid:
            return None

        try:
            conn = sqlite3.connect(str(self.stats_db_path))
            conn.row_factory = sqlite3.Row

            cursor = conn.execute("""
                SELECT fantasy_points_ppr
                FROM player_game_stats
                WHERE player_uid = ? AND season = ? AND week = ?
                  AND is_current = 1
                LIMIT 1
            """, (lineup.player_uid, lineup.season, lineup.week))

            row = cursor.fetchone()
            conn.close()

            if row:
                self.stats["points_validated"] += 1
                stats_points = row["fantasy_points_ppr"]

                # Check for mismatch
                if lineup.points_actual is not None and stats_points is not None:
                    diff = abs((lineup.points_actual or 0) - stats_points)
                    if diff > 0.5:  # Allow small rounding differences
                        self.stats["points_mismatches"] += 1
                        logger.debug(
                            f"Points mismatch for {lineup.player_uid} week {lineup.week}: "
                            f"lineup={lineup.points_actual}, stats={stats_points}"
                        )

                return stats_points

        except Exception as e:
            logger.debug(f"Points validation error: {e}")

        return None

    # -------------------------------------------------------------------------
    # Database Operations
    # -------------------------------------------------------------------------

    def _save_lineups(
        self,
        conn: sqlite3.Connection,
        lineups: List[UnifiedLineup]
    ) -> Tuple[int, int]:
        """Save unified lineups to database."""
        inserted = 0
        updated = 0

        for lineup in lineups:
            try:
                # Validate points if enabled
                if self.validate_points:
                    self._validate_points(lineup)

                # Check if exists
                cursor = conn.execute("""
                    SELECT id FROM unified_lineups
                    WHERE source = ? AND season = ? AND week = ?
                      AND team_id = ? AND COALESCE(player_uid, source_player_id) = ?
                """, (
                    lineup.source, lineup.season, lineup.week,
                    lineup.team_id,
                    lineup.player_uid or lineup.source_player_id
                ))

                existing = cursor.fetchone()

                if existing:
                    # Update existing
                    conn.execute("""
                        UPDATE unified_lineups SET
                            team_name = ?,
                            matchup_id = ?,
                            slot = ?,
                            slot_index = ?,
                            is_starter = ?,
                            points_actual = ?,
                            points_projected = ?,
                            source_slot_id = ?,
                            resolution_confidence = ?,
                            resolution_method = ?
                        WHERE id = ?
                    """, (
                        lineup.team_name, lineup.matchup_id, lineup.slot,
                        lineup.slot_index, 1 if lineup.is_starter else 0,
                        lineup.points_actual, lineup.points_projected,
                        lineup.source_slot_id, lineup.resolution_confidence,
                        lineup.resolution_method, existing["id"]
                    ))
                    updated += 1
                else:
                    # Insert new
                    conn.execute("""
                        INSERT INTO unified_lineups (
                            season, week, team_id, team_name, matchup_id,
                            player_uid, slot, slot_index, is_starter,
                            points_actual, points_projected,
                            source, source_player_id, source_slot_id,
                            resolution_confidence, resolution_method
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        lineup.season, lineup.week, lineup.team_id,
                        lineup.team_name, lineup.matchup_id, lineup.player_uid,
                        lineup.slot, lineup.slot_index,
                        1 if lineup.is_starter else 0,
                        lineup.points_actual, lineup.points_projected,
                        lineup.source, lineup.source_player_id,
                        lineup.source_slot_id, lineup.resolution_confidence,
                        lineup.resolution_method
                    ))
                    inserted += 1

            except sqlite3.IntegrityError as e:
                logger.warning(f"Duplicate lineup: {lineup.team_id}/{lineup.source_player_id} - {e}")
                self.stats["lineups_skipped"] += 1
            except Exception as e:
                logger.error(f"Error saving lineup: {e}")
                self.stats["errors"].append({
                    "type": "save_error",
                    "error": str(e)
                })

        return inserted, updated

    # -------------------------------------------------------------------------
    # Main Processing Methods
    # -------------------------------------------------------------------------

    def process_season(
        self,
        season: int,
        sources: Optional[List[str]] = None,
        week: Optional[int] = None
    ) -> None:
        """Process lineups for a single season."""
        if sources is None:
            # Use appropriate source based on season
            if season >= 2025:
                sources = ["sleeper"]
            elif season <= 2024:
                sources = ["espn"]
            else:
                sources = ["sleeper", "espn"]

        all_lineups: List[UnifiedLineup] = []

        # Reset stats
        self.stats = {
            "lineups_processed": 0,
            "lineups_inserted": 0,
            "lineups_updated": 0,
            "lineups_skipped": 0,
            "players_resolved": 0,
            "players_unresolved": 0,
            "points_validated": 0,
            "points_mismatches": 0,
            "errors": []
        }

        # Process each source
        for source in sources:
            if source == "sleeper":
                if week:
                    lineups = self.process_sleeper_week(season, week)
                else:
                    lineups = self.process_sleeper_season(season)
            elif source == "espn":
                if week:
                    lineups = self.process_espn_week(season, week)
                else:
                    lineups = self.process_espn_season(season)
            else:
                logger.warning(f"Unknown source: {source}")
                continue

            all_lineups.extend(lineups)

        if not all_lineups:
            logger.info(f"No lineups found for season {season}")
            return

        logger.info(f"Unified {len(all_lineups)} lineup entries for season {season}")

        # Save to database
        if not self.dry_run:
            self._init_league_db()
            conn = self._get_league_connection()
            try:
                inserted, updated = self._save_lineups(conn, all_lineups)
                conn.commit()

                self.stats["lineups_inserted"] = inserted
                self.stats["lineups_updated"] = updated

                logger.info(
                    f"Saved lineups for {season}: "
                    f"{inserted} inserted, {updated} updated"
                )
            finally:
                conn.close()
        else:
            logger.info(f"[DRY RUN] Would save {len(all_lineups)} lineup entries")

    def process_all_seasons(
        self,
        start_season: int = 2015,
        end_season: int = 2025,
        sources: Optional[List[str]] = None
    ) -> None:
        """Process lineups for all seasons."""
        for season in range(start_season, end_season + 1):
            try:
                # Determine source based on season if not specified
                season_sources = sources
                if season_sources is None:
                    if season >= 2025:
                        season_sources = ["sleeper"]
                    else:
                        season_sources = ["espn"]

                self.process_season(season, season_sources)
            except Exception as e:
                logger.error(f"Error processing season {season}: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics."""
        return self.stats


def main():
    parser = argparse.ArgumentParser(
        description="Unify lineups from ESPN and Sleeper"
    )
    parser.add_argument(
        "--season", type=int,
        help="Process specific season"
    )
    parser.add_argument(
        "--week", type=int,
        help="Process specific week (requires --season)"
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Process all available seasons (2015-2025)"
    )
    parser.add_argument(
        "--source", choices=["espn", "sleeper"],
        help="Process only specific source"
    )
    parser.add_argument(
        "--start-season", type=int, default=2015,
        help="Start season for --all (default: 2015)"
    )
    parser.add_argument(
        "--end-season", type=int, default=2025,
        help="End season for --all (default: 2025)"
    )
    parser.add_argument(
        "--validate-points", action="store_true",
        help="Validate points against stats database"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Process without saving to database"
    )
    parser.add_argument(
        "--db-path", type=Path, default=LEAGUE_DB_PATH,
        help="Path to league database"
    )
    parser.add_argument(
        "--players-db", type=Path, default=PLAYERS_DB_PATH,
        help="Path to players identity database"
    )
    parser.add_argument(
        "--stats-db", type=Path, default=STATS_DB_PATH,
        help="Path to stats database (for points validation)"
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.week and not args.season:
        parser.error("--week requires --season")

    sources = [args.source] if args.source else None

    unifier = LineupUnifier(
        league_db_path=args.db_path,
        stats_db_path=args.stats_db,
        players_db_path=args.players_db,
        dry_run=args.dry_run,
        validate_points=args.validate_points
    )

    if args.all:
        unifier.process_all_seasons(
            start_season=args.start_season,
            end_season=args.end_season,
            sources=sources
        )
    elif args.season:
        unifier.process_season(args.season, sources, args.week)
    else:
        parser.print_help()
        print("\nError: Must specify --season or --all")
        sys.exit(1)

    # Print summary
    stats = unifier.get_stats()
    print("\n=== Summary ===")
    print(f"Lineups processed: {stats['lineups_processed']}")
    print(f"Entries inserted: {stats['lineups_inserted']}")
    print(f"Entries updated: {stats['lineups_updated']}")
    print(f"Entries skipped: {stats['lineups_skipped']}")
    print(f"Players resolved: {stats['players_resolved']}")
    print(f"Players unresolved: {stats['players_unresolved']}")
    if args.validate_points:
        print(f"Points validated: {stats['points_validated']}")
        print(f"Points mismatches: {stats['points_mismatches']}")
    if stats['errors']:
        print(f"Errors: {len(stats['errors'])}")


if __name__ == "__main__":
    main()
