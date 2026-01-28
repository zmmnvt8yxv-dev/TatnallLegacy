#!/usr/bin/env python3
"""
NFL Injury Report Integration

Loads and tracks player injury data:
- Weekly injury status (Out, Doubtful, Questionable, Probable)
- Injury type/body part
- Practice participation
- Impact on fantasy projections

Data Sources:
- NFLverse injuries dataset (primary)
- ESPN injury reports (backup)

Usage:
    # Load all seasons
    python load_injuries.py --all

    # Load specific season
    python load_injuries.py --season 2024

    # Load current week only
    python load_injuries.py --current-week

    # Get player injury history
    python load_injuries.py --player "Patrick Mahomes"
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import pandas as pd

# Path setup
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Path constants
STATS_DB_PATH = PROJECT_ROOT / "db" / "stats.sqlite"
PLAYERS_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"
DATA_RAW_PATH = PROJECT_ROOT / "data_raw"

# Injury status types
InjuryStatus = Literal[
    "Out", "Doubtful", "Questionable", "Probable",
    "IR", "PUP", "NFI", "Suspended", "COVID-19", "Healthy"
]

# Practice participation
PracticeStatus = Literal["Full", "Limited", "DNP", "Unknown"]

# Fantasy impact scores (higher = more impactful)
INJURY_IMPACT_SCORES = {
    "Out": 1.0,
    "IR": 1.0,
    "PUP": 1.0,
    "NFI": 1.0,
    "Suspended": 1.0,
    "Doubtful": 0.8,
    "Questionable": 0.4,
    "Probable": 0.1,
    "Healthy": 0.0,
}


@dataclass
class InjuryReport:
    """Represents a player injury report entry."""
    player_uid: Optional[str]
    season: int
    week: int
    team: str

    # Status
    game_status: InjuryStatus
    practice_status: Optional[PracticeStatus] = None

    # Injury details
    injury_type: Optional[str] = None  # e.g., "Knee", "Ankle", "Concussion"
    injury_detail: Optional[str] = None  # More specific description

    # Practice participation
    practice_wednesday: Optional[PracticeStatus] = None
    practice_thursday: Optional[PracticeStatus] = None
    practice_friday: Optional[PracticeStatus] = None

    # Impact metrics
    fantasy_impact: float = 0.0  # 0.0-1.0 scale

    # Metadata
    report_date: Optional[str] = None
    source: str = "nflverse"
    source_player_id: Optional[str] = None

    # For linking
    player_name: Optional[str] = None  # For display/matching


@dataclass
class LoadResult:
    """Result of an injury load operation."""
    season: int
    week: Optional[int] = None
    reports_loaded: int = 0
    reports_updated: int = 0
    reports_skipped: int = 0
    players_matched: int = 0
    players_unmatched: int = 0
    errors: List[str] = field(default_factory=list)


class InjuryLoader:
    """
    Loads NFL injury report data from various sources.

    Primary source: NFLverse injuries dataset
    Fallback: ESPN API
    """

    def __init__(
        self,
        stats_db_path: Path = STATS_DB_PATH,
        players_db_path: Path = PLAYERS_DB_PATH,
        data_path: Path = DATA_RAW_PATH,
        use_cache: bool = True
    ):
        self.stats_db_path = stats_db_path
        self.players_db_path = players_db_path
        self.data_path = data_path
        self.use_cache = use_cache
        self._stats_conn: Optional[sqlite3.Connection] = None
        self._players_conn: Optional[sqlite3.Connection] = None

    def _get_stats_connection(self) -> sqlite3.Connection:
        """Get stats database connection."""
        if self._stats_conn is None:
            self._stats_conn = sqlite3.connect(str(self.stats_db_path))
            self._stats_conn.row_factory = sqlite3.Row
        return self._stats_conn

    def _get_players_connection(self) -> sqlite3.Connection:
        """Get players database connection."""
        if self._players_conn is None:
            self._players_conn = sqlite3.connect(str(self.players_db_path))
            self._players_conn.row_factory = sqlite3.Row
        return self._players_conn

    def close(self) -> None:
        """Close database connections."""
        if self._stats_conn:
            self._stats_conn.close()
            self._stats_conn = None
        if self._players_conn:
            self._players_conn.close()
            self._players_conn = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    def _ensure_injuries_table(self) -> None:
        """Ensure the injuries table exists in the stats database."""
        conn = self._get_stats_connection()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS player_injuries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                -- Player reference
                player_uid TEXT,
                player_name TEXT,

                -- Context
                season INTEGER NOT NULL,
                week INTEGER NOT NULL,
                team TEXT,

                -- Status
                game_status TEXT NOT NULL,
                practice_status TEXT,

                -- Injury details
                injury_type TEXT,
                injury_detail TEXT,

                -- Practice participation
                practice_wednesday TEXT,
                practice_thursday TEXT,
                practice_friday TEXT,

                -- Impact
                fantasy_impact REAL DEFAULT 0.0,

                -- Metadata
                report_date TEXT,
                source TEXT DEFAULT 'nflverse',
                source_player_id TEXT,

                -- Timestamps
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),

                -- Constraints
                UNIQUE(source, season, week, source_player_id)
            )
        """)

        # Create indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_injuries_player ON player_injuries(player_uid)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_injuries_season_week ON player_injuries(season, week)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_injuries_team ON player_injuries(team)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_injuries_status ON player_injuries(game_status)")

        conn.commit()

    def _resolve_player(
        self,
        name: str,
        team: Optional[str] = None,
        position: Optional[str] = None,
        gsis_id: Optional[str] = None
    ) -> Optional[str]:
        """
        Resolve player name to player_uid.

        Args:
            name: Player name
            team: Team abbreviation
            position: Position
            gsis_id: GSIS ID if available

        Returns:
            player_uid if found, None otherwise
        """
        conn = self._get_players_connection()

        # Try GSIS ID first
        if gsis_id:
            result = conn.execute("""
                SELECT player_uid FROM player_identifiers
                WHERE source = 'gsis' AND external_id = ?
            """, (gsis_id,)).fetchone()
            if result:
                return result["player_uid"]

        # Try name match
        from scripts.db.init_db import normalize_name
        name_norm = normalize_name(name)

        result = conn.execute("""
            SELECT player_uid FROM players
            WHERE canonical_name_norm = ?
        """, (name_norm,)).fetchone()

        if result:
            return result["player_uid"]

        # Try alias match
        result = conn.execute("""
            SELECT player_uid FROM player_aliases
            WHERE alias_norm = ?
        """, (name_norm,)).fetchone()

        if result:
            return result["player_uid"]

        return None

    def _load_nflverse_injuries(self, season: int) -> pd.DataFrame:
        """Load injury data from NFLverse."""
        cache_path = self.data_path / "nflverse_injuries" / f"injuries_{season}.csv"

        if self.use_cache and cache_path.exists():
            logger.info(f"Loading from cache: {cache_path}")
            return pd.read_csv(cache_path)

        # Try to download from NFLverse
        try:
            url = f"https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv"
            logger.info(f"Downloading injuries from {url}")
            df = pd.read_csv(url)

            # Cache for future use
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(cache_path, index=False)

            return df

        except Exception as e:
            logger.warning(f"Failed to download NFLverse injuries: {e}")

            # Try alternate paths
            alt_paths = [
                self.data_path / f"injuries_{season}.csv",
                self.data_path / "nflverse_stats" / f"injuries_{season}.csv",
            ]

            for alt_path in alt_paths:
                if alt_path.exists():
                    logger.info(f"Loading from alternate path: {alt_path}")
                    return pd.read_csv(alt_path)

            return pd.DataFrame()

    def _parse_injury_row(self, row: pd.Series) -> InjuryReport:
        """Parse a row from NFLverse injuries into InjuryReport."""
        season = int(row["season"])
        week = int(row["week"])

        # Team
        team = str(row.get("team", "")).upper()

        # Status
        game_status = str(row.get("report_status", "Unknown"))
        if game_status in INJURY_IMPACT_SCORES:
            pass
        elif game_status.lower() in ["o", "out"]:
            game_status = "Out"
        elif game_status.lower() in ["d", "doubtful"]:
            game_status = "Doubtful"
        elif game_status.lower() in ["q", "questionable"]:
            game_status = "Questionable"
        elif game_status.lower() in ["p", "probable"]:
            game_status = "Probable"
        else:
            game_status = "Questionable"

        # Practice status
        practice_status = None
        practice_wed = None
        practice_thu = None
        practice_fri = None

        for day, col in [("wednesday", "practice_wednesday"), ("thursday", "practice_thursday"), ("friday", "practice_friday")]:
            if col in row and pd.notna(row[col]):
                status = str(row[col]).lower()
                if "full" in status:
                    val = "Full"
                elif "limited" in status:
                    val = "Limited"
                elif "dnp" in status or "did not" in status:
                    val = "DNP"
                else:
                    val = "Unknown"

                if day == "wednesday":
                    practice_wed = val
                elif day == "thursday":
                    practice_thu = val
                elif day == "friday":
                    practice_fri = val
                    practice_status = val  # Use Friday as primary

        # Injury details
        injury_type = row.get("report_primary_injury") if "report_primary_injury" in row else None
        if injury_type and pd.notna(injury_type):
            injury_type = str(injury_type)
        else:
            injury_type = None

        injury_detail = row.get("report_secondary_injury") if "report_secondary_injury" in row else None
        if injury_detail and pd.notna(injury_detail):
            injury_detail = str(injury_detail)
        else:
            injury_detail = None

        # Calculate fantasy impact
        fantasy_impact = INJURY_IMPACT_SCORES.get(game_status, 0.5)

        # Player info
        player_name = str(row.get("full_name", row.get("player_name", "")))
        gsis_id = row.get("gsis_id") if "gsis_id" in row else None
        source_player_id = str(gsis_id) if gsis_id and pd.notna(gsis_id) else player_name

        # Report date
        report_date = row.get("date_modified") if "date_modified" in row else None
        if report_date and pd.notna(report_date):
            report_date = str(report_date)[:10]
        else:
            report_date = None

        return InjuryReport(
            player_uid=None,  # Will be resolved later
            season=season,
            week=week,
            team=team,
            game_status=game_status,
            practice_status=practice_status,
            injury_type=injury_type,
            injury_detail=injury_detail,
            practice_wednesday=practice_wed,
            practice_thursday=practice_thu,
            practice_friday=practice_fri,
            fantasy_impact=fantasy_impact,
            report_date=report_date,
            source="nflverse",
            source_player_id=source_player_id,
            player_name=player_name
        )

    def load_season(
        self,
        season: int,
        update_existing: bool = True,
        dry_run: bool = False
    ) -> LoadResult:
        """
        Load injuries for a single season.

        Args:
            season: NFL season year
            update_existing: If True, update existing records
            dry_run: If True, don't write to database

        Returns:
            LoadResult with counts and errors
        """
        result = LoadResult(season=season)

        logger.info(f"Loading injuries for season {season}")

        # Ensure table exists
        self._ensure_injuries_table()

        # Load from NFLverse
        df = self._load_nflverse_injuries(season)

        if df.empty:
            logger.warning(f"No injury data found for season {season}")
            return result

        logger.info(f"Found {len(df)} injury reports for season {season}")

        # Parse reports
        reports = []
        for _, row in df.iterrows():
            try:
                report = self._parse_injury_row(row)
                reports.append(report)
            except Exception as e:
                result.errors.append(f"Failed to parse injury: {e}")

        # Resolve players
        for report in reports:
            gsis_id = report.source_player_id if report.source_player_id != report.player_name else None
            report.player_uid = self._resolve_player(
                report.player_name,
                report.team,
                gsis_id=gsis_id
            )
            if report.player_uid:
                result.players_matched += 1
            else:
                result.players_unmatched += 1

        if dry_run:
            result.reports_loaded = len(reports)
            logger.info(f"[DRY RUN] Would load {len(reports)} injury reports")
            return result

        # Insert into database
        conn = self._get_stats_connection()

        for report in reports:
            try:
                # Check if exists
                existing = conn.execute("""
                    SELECT id FROM player_injuries
                    WHERE source = ? AND season = ? AND week = ? AND source_player_id = ?
                """, (report.source, report.season, report.week, report.source_player_id)).fetchone()

                if existing:
                    if update_existing:
                        conn.execute("""
                            UPDATE player_injuries SET
                                player_uid = ?,
                                player_name = ?,
                                team = ?,
                                game_status = ?,
                                practice_status = ?,
                                injury_type = ?,
                                injury_detail = ?,
                                practice_wednesday = ?,
                                practice_thursday = ?,
                                practice_friday = ?,
                                fantasy_impact = ?,
                                report_date = ?,
                                updated_at = datetime('now')
                            WHERE id = ?
                        """, (
                            report.player_uid, report.player_name, report.team,
                            report.game_status, report.practice_status,
                            report.injury_type, report.injury_detail,
                            report.practice_wednesday, report.practice_thursday, report.practice_friday,
                            report.fantasy_impact, report.report_date,
                            existing["id"]
                        ))
                        result.reports_updated += 1
                    else:
                        result.reports_skipped += 1
                else:
                    conn.execute("""
                        INSERT INTO player_injuries (
                            player_uid, player_name, season, week, team,
                            game_status, practice_status,
                            injury_type, injury_detail,
                            practice_wednesday, practice_thursday, practice_friday,
                            fantasy_impact, report_date, source, source_player_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        report.player_uid, report.player_name, report.season, report.week, report.team,
                        report.game_status, report.practice_status,
                        report.injury_type, report.injury_detail,
                        report.practice_wednesday, report.practice_thursday, report.practice_friday,
                        report.fantasy_impact, report.report_date, report.source, report.source_player_id
                    ))
                    result.reports_loaded += 1

            except sqlite3.Error as e:
                result.errors.append(f"Database error: {e}")

        conn.commit()

        logger.info(
            f"Season {season}: {result.reports_loaded} loaded, "
            f"{result.reports_updated} updated, {result.players_matched} matched, "
            f"{result.players_unmatched} unmatched"
        )

        return result

    def load_all_seasons(
        self,
        start_season: int = 2015,
        end_season: int = 2025,
        update_existing: bool = True,
        dry_run: bool = False
    ) -> Dict[int, LoadResult]:
        """Load injuries for all seasons in range."""
        results = {}

        for season in range(start_season, end_season + 1):
            try:
                result = self.load_season(season, update_existing, dry_run)
                results[season] = result
            except Exception as e:
                logger.error(f"Failed to load season {season}: {e}")
                results[season] = LoadResult(season=season, errors=[str(e)])

        return results

    def get_player_injuries(
        self,
        player_uid: str,
        season: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get injury history for a player."""
        conn = self._get_stats_connection()

        query = """
            SELECT * FROM player_injuries
            WHERE player_uid = ?
        """
        params = [player_uid]

        if season:
            query += " AND season = ?"
            params.append(season)

        query += " ORDER BY season DESC, week DESC"

        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def get_week_injuries(
        self,
        season: int,
        week: int,
        team: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all injuries for a specific week."""
        conn = self._get_stats_connection()

        query = """
            SELECT * FROM player_injuries
            WHERE season = ? AND week = ?
        """
        params = [season, week]

        if team:
            query += " AND team = ?"
            params.append(team.upper())

        query += " ORDER BY game_status, player_name"

        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def get_injury_impact(
        self,
        player_uid: str,
        season: int,
        week: int
    ) -> float:
        """
        Get fantasy impact score for a player in a specific week.

        Returns:
            Float from 0.0 (healthy) to 1.0 (out/IR)
        """
        conn = self._get_stats_connection()

        result = conn.execute("""
            SELECT fantasy_impact FROM player_injuries
            WHERE player_uid = ? AND season = ? AND week = ?
        """, (player_uid, season, week)).fetchone()

        if result:
            return result["fantasy_impact"]
        return 0.0  # No injury report = healthy


# Convenience functions
def load_injuries(
    season: int,
    stats_db_path: Path = STATS_DB_PATH,
    update_existing: bool = True
) -> LoadResult:
    """Load injuries for a single season."""
    with InjuryLoader(stats_db_path=stats_db_path) as loader:
        return loader.load_season(season, update_existing)


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="NFL Injury Report Integration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Load all seasons
  python load_injuries.py --all

  # Load specific season
  python load_injuries.py --season 2024

  # Get week injuries
  python load_injuries.py --week 2024 10

  # Get player injuries
  python load_injuries.py --player-uid abc-123-uuid
        """
    )

    parser.add_argument(
        "--season",
        type=int,
        help="Load specific season"
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Load all seasons (2015-2025)"
    )

    parser.add_argument(
        "--start-season",
        type=int,
        default=2015,
        help="Start season for --all (default: 2015)"
    )

    parser.add_argument(
        "--end-season",
        type=int,
        default=2025,
        help="End season for --all (default: 2025)"
    )

    parser.add_argument(
        "--week",
        nargs=2,
        type=int,
        metavar=("SEASON", "WEEK"),
        help="Get injuries for a specific week"
    )

    parser.add_argument(
        "--player-uid",
        type=str,
        help="Get injury history for a player"
    )

    parser.add_argument(
        "--team",
        type=str,
        help="Filter by team (used with --week)"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without applying"
    )

    parser.add_argument(
        "--no-update",
        action="store_true",
        help="Don't update existing records"
    )

    parser.add_argument(
        "--db",
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

    loader = InjuryLoader(stats_db_path=args.db)

    try:
        if args.week:
            season, week = args.week
            injuries = loader.get_week_injuries(season, week, args.team)
            print(json.dumps(injuries, indent=2, default=str))
            return 0

        if args.player_uid:
            injuries = loader.get_player_injuries(args.player_uid)
            print(json.dumps(injuries, indent=2, default=str))
            return 0

        if args.season:
            result = loader.load_season(
                args.season,
                update_existing=not args.no_update,
                dry_run=args.dry_run
            )
            print(f"\nSeason {result.season}:")
            print(f"  Reports loaded: {result.reports_loaded}")
            print(f"  Reports updated: {result.reports_updated}")
            print(f"  Players matched: {result.players_matched}")
            print(f"  Players unmatched: {result.players_unmatched}")
            if result.errors:
                print(f"  Errors: {len(result.errors)}")
            return 0 if not result.errors else 1

        if args.all:
            results = loader.load_all_seasons(
                start_season=args.start_season,
                end_season=args.end_season,
                update_existing=not args.no_update,
                dry_run=args.dry_run
            )

            total_loaded = sum(r.reports_loaded for r in results.values())
            total_updated = sum(r.reports_updated for r in results.values())
            total_errors = sum(len(r.errors) for r in results.values())

            print(f"\nSummary:")
            print(f"  Seasons processed: {len(results)}")
            print(f"  Total reports loaded: {total_loaded}")
            print(f"  Total reports updated: {total_updated}")
            print(f"  Total errors: {total_errors}")
            return 0 if total_errors == 0 else 1

        parser.print_help()
        return 0

    finally:
        loader.close()


if __name__ == "__main__":
    sys.exit(main())
