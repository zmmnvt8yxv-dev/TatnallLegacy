#!/usr/bin/env python3
"""
NFL Schedule Integration

Loads full NFL game schedules with metadata:
- All games 2015-2025
- Bye weeks per team
- Home/away designation
- Game time, weather (optional)

Data Sources:
- NFLverse schedules (primary)
- ESPN schedules (backup)
- Sportradar API (optional, for weather)

Usage:
    # Load all seasons
    python load_schedule.py --all

    # Load specific season
    python load_schedule.py --season 2024

    # Load with weather data (requires API key)
    python load_schedule.py --season 2024 --include-weather

    # Export bye weeks
    python load_schedule.py --bye-weeks 2024
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sqlite3
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set, Tuple

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
DATA_RAW_PATH = PROJECT_ROOT / "data_raw"
NFLVERSE_SCHEDULES_URL = "https://github.com/nflverse/nfldata/raw/master/data/schedules.csv"

# NFL teams
NFL_TEAMS = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
    "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
    "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
    "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"
}

# Team name mappings (handle historical/alternate names)
TEAM_MAPPINGS = {
    "OAK": "LV",  # Oakland Raiders -> Las Vegas Raiders (2020)
    "SD": "LAC",  # San Diego Chargers -> LA Chargers (2017)
    "STL": "LAR",  # St. Louis Rams -> LA Rams (2016)
    "JAC": "JAX",  # Alternate abbreviation
    "WSH": "WAS",  # Washington alternate
}


@dataclass
class NFLGame:
    """Represents an NFL game record."""
    game_id: str
    season: int
    week: int
    season_type: Literal["PRE", "REG", "POST"]
    home_team: str
    away_team: str
    game_date: str  # YYYY-MM-DD
    game_time: Optional[str] = None  # HH:MM
    game_datetime: Optional[str] = None
    status: str = "scheduled"
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    stadium: Optional[str] = None
    location: Optional[str] = None
    roof_type: Optional[str] = None
    surface: Optional[str] = None
    weather_temp: Optional[int] = None
    weather_wind: Optional[int] = None
    weather_condition: Optional[str] = None
    spread_line: Optional[float] = None
    over_under: Optional[float] = None
    source: str = "nflverse"
    source_game_id: Optional[str] = None


@dataclass
class ByeWeek:
    """Represents a team's bye week."""
    season: int
    team: str
    week: int


@dataclass
class LoadResult:
    """Result of a schedule load operation."""
    season: int
    games_loaded: int = 0
    games_updated: int = 0
    games_skipped: int = 0
    bye_weeks_loaded: int = 0
    errors: List[str] = field(default_factory=list)


class ScheduleLoader:
    """
    Loads NFL schedule data from various sources.

    Primary source: NFLverse schedules
    Fallback: ESPN API, Sportradar API
    """

    def __init__(
        self,
        db_path: Path = STATS_DB_PATH,
        data_path: Path = DATA_RAW_PATH,
        use_cache: bool = True
    ):
        self.db_path = db_path
        self.data_path = data_path
        self.use_cache = use_cache
        self._conn: Optional[sqlite3.Connection] = None

    def _get_connection(self) -> sqlite3.Connection:
        """Get database connection."""
        if self._conn is None:
            if not self.db_path.exists():
                raise FileNotFoundError(f"Stats database not found: {self.db_path}")
            self._conn = sqlite3.connect(str(self.db_path))
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def close(self) -> None:
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    def _normalize_team(self, team: str) -> str:
        """Normalize team abbreviation to current standard."""
        team = team.upper().strip()
        return TEAM_MAPPINGS.get(team, team)

    def _generate_game_id(
        self,
        season: int,
        week: int,
        away_team: str,
        home_team: str
    ) -> str:
        """Generate a unique game ID."""
        return f"{season}_{week:02d}_{away_team}_{home_team}"

    def _load_nflverse_schedule(self, season: int) -> pd.DataFrame:
        """Load schedule data from NFLverse."""
        # Try local cache first
        cache_path = self.data_path / "nflverse_schedules" / f"schedule_{season}.csv"

        if self.use_cache and cache_path.exists():
            logger.info(f"Loading from cache: {cache_path}")
            return pd.read_csv(cache_path)

        # Try to download from NFLverse
        try:
            url = f"https://github.com/nflverse/nfldata/raw/master/data/schedules.csv"
            logger.info(f"Downloading NFLverse schedules from {url}")

            # Load full schedule file
            df = pd.read_csv(url)

            # Filter to requested season
            df = df[df["season"] == season]

            # Cache for future use
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(cache_path, index=False)

            return df

        except Exception as e:
            logger.warning(f"Failed to download NFLverse schedule: {e}")

            # Try alternate local paths
            alt_paths = [
                self.data_path / "schedules.csv",
                self.data_path / "nflverse_stats" / "schedules.csv",
            ]

            for alt_path in alt_paths:
                if alt_path.exists():
                    logger.info(f"Loading from alternate path: {alt_path}")
                    df = pd.read_csv(alt_path)
                    return df[df["season"] == season]

            return pd.DataFrame()

    def _parse_nflverse_row(self, row: pd.Series) -> NFLGame:
        """Parse a row from NFLverse schedule into NFLGame."""
        season = int(row["season"])
        week = int(row["week"])
        home_team = self._normalize_team(str(row["home_team"]))
        away_team = self._normalize_team(str(row["away_team"]))

        # Determine season type
        if "game_type" in row:
            game_type = str(row["game_type"]).upper()
            if game_type in ["PRE", "REG", "POST", "WC", "DIV", "CON", "SB"]:
                if game_type in ["WC", "DIV", "CON", "SB"]:
                    season_type = "POST"
                else:
                    season_type = game_type
            else:
                season_type = "REG"
        else:
            season_type = "REG"

        # Parse game date/time
        game_date = None
        game_time = None
        game_datetime = None

        if "gameday" in row and pd.notna(row["gameday"]):
            game_date = str(row["gameday"])[:10]

        if "gametime" in row and pd.notna(row["gametime"]):
            game_time = str(row["gametime"])

        if game_date and game_time:
            game_datetime = f"{game_date}T{game_time}"

        # Parse scores
        home_score = None
        away_score = None

        if "home_score" in row and pd.notna(row["home_score"]):
            home_score = int(row["home_score"])
        if "away_score" in row and pd.notna(row["away_score"]):
            away_score = int(row["away_score"])

        # Determine status
        if home_score is not None and away_score is not None:
            status = "final"
        elif game_date:
            game_dt = datetime.strptime(game_date, "%Y-%m-%d")
            if game_dt.date() < datetime.now().date():
                status = "final"  # Assume completed if in past
            else:
                status = "scheduled"
        else:
            status = "scheduled"

        # Stadium/venue info
        stadium = row.get("stadium") if "stadium" in row else None
        location = row.get("location") if "location" in row else None
        roof = row.get("roof") if "roof" in row else None
        surface = row.get("surface") if "surface" in row else None

        # Betting lines
        spread = row.get("spread_line") if "spread_line" in row else None
        total = row.get("total_line") if "total_line" in row else None

        if spread is not None:
            try:
                spread = float(spread)
            except (ValueError, TypeError):
                spread = None

        if total is not None:
            try:
                total = float(total)
            except (ValueError, TypeError):
                total = None

        # Weather
        weather_temp = None
        weather_wind = None
        weather_cond = None

        if "temp" in row and pd.notna(row["temp"]):
            try:
                weather_temp = int(row["temp"])
            except (ValueError, TypeError):
                pass

        if "wind" in row and pd.notna(row["wind"]):
            try:
                weather_wind = int(row["wind"])
            except (ValueError, TypeError):
                pass

        if "weather" in row and pd.notna(row["weather"]):
            weather_cond = str(row["weather"])

        # Generate game ID
        game_id = self._generate_game_id(season, week, away_team, home_team)
        source_game_id = row.get("game_id") if "game_id" in row else None

        return NFLGame(
            game_id=game_id,
            season=season,
            week=week,
            season_type=season_type,
            home_team=home_team,
            away_team=away_team,
            game_date=game_date,
            game_time=game_time,
            game_datetime=game_datetime,
            status=status,
            home_score=home_score,
            away_score=away_score,
            stadium=stadium,
            location=location,
            roof_type=roof,
            surface=surface,
            weather_temp=weather_temp,
            weather_wind=weather_wind,
            weather_condition=weather_cond,
            spread_line=spread,
            over_under=total,
            source="nflverse",
            source_game_id=source_game_id
        )

    def load_season(
        self,
        season: int,
        update_existing: bool = True,
        dry_run: bool = False
    ) -> LoadResult:
        """
        Load schedule for a single season.

        Args:
            season: NFL season year
            update_existing: If True, update existing games with new data
            dry_run: If True, don't write to database

        Returns:
            LoadResult with counts and errors
        """
        result = LoadResult(season=season)

        logger.info(f"Loading schedule for season {season}")

        # Load from NFLverse
        df = self._load_nflverse_schedule(season)

        if df.empty:
            result.errors.append(f"No schedule data found for season {season}")
            return result

        logger.info(f"Found {len(df)} games for season {season}")

        # Parse games
        games = []
        for _, row in df.iterrows():
            try:
                game = self._parse_nflverse_row(row)
                games.append(game)
            except Exception as e:
                result.errors.append(f"Failed to parse game: {e}")

        if dry_run:
            result.games_loaded = len(games)
            logger.info(f"[DRY RUN] Would load {len(games)} games")
            return result

        # Insert into database
        conn = self._get_connection()

        for game in games:
            try:
                # Check if game exists
                existing = conn.execute(
                    "SELECT game_id FROM nfl_games WHERE game_id = ?",
                    (game.game_id,)
                ).fetchone()

                if existing:
                    if update_existing:
                        # Update existing game
                        conn.execute("""
                            UPDATE nfl_games SET
                                game_date = ?,
                                game_time = ?,
                                game_datetime = ?,
                                status = ?,
                                home_score = ?,
                                away_score = ?,
                                stadium = ?,
                                location = ?,
                                roof_type = ?,
                                surface = ?,
                                weather_temp = ?,
                                weather_wind = ?,
                                weather_condition = ?,
                                spread_line = ?,
                                over_under = ?,
                                updated_at = datetime('now')
                            WHERE game_id = ?
                        """, (
                            game.game_date, game.game_time, game.game_datetime,
                            game.status, game.home_score, game.away_score,
                            game.stadium, game.location, game.roof_type,
                            game.surface, game.weather_temp, game.weather_wind,
                            game.weather_condition, game.spread_line, game.over_under,
                            game.game_id
                        ))
                        result.games_updated += 1
                    else:
                        result.games_skipped += 1
                else:
                    # Insert new game
                    conn.execute("""
                        INSERT INTO nfl_games (
                            game_id, season, week, season_type,
                            home_team, away_team, game_date, game_time, game_datetime,
                            status, home_score, away_score,
                            stadium, location, roof_type, surface,
                            weather_temp, weather_wind, weather_condition,
                            spread_line, over_under, source, source_game_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        game.game_id, game.season, game.week, game.season_type,
                        game.home_team, game.away_team, game.game_date, game.game_time, game.game_datetime,
                        game.status, game.home_score, game.away_score,
                        game.stadium, game.location, game.roof_type, game.surface,
                        game.weather_temp, game.weather_wind, game.weather_condition,
                        game.spread_line, game.over_under, game.source, game.source_game_id
                    ))
                    result.games_loaded += 1

            except sqlite3.Error as e:
                result.errors.append(f"Database error for game {game.game_id}: {e}")

        conn.commit()

        logger.info(
            f"Season {season}: {result.games_loaded} loaded, "
            f"{result.games_updated} updated, {result.games_skipped} skipped"
        )

        return result

    def load_all_seasons(
        self,
        start_season: int = 2015,
        end_season: int = 2025,
        update_existing: bool = True,
        dry_run: bool = False
    ) -> Dict[int, LoadResult]:
        """Load schedules for all seasons in range."""
        results = {}

        for season in range(start_season, end_season + 1):
            try:
                result = self.load_season(season, update_existing, dry_run)
                results[season] = result
            except Exception as e:
                logger.error(f"Failed to load season {season}: {e}")
                results[season] = LoadResult(season=season, errors=[str(e)])

        return results

    def get_bye_weeks(self, season: int) -> Dict[str, int]:
        """
        Get bye weeks for all teams in a season.

        Returns:
            Dict mapping team abbreviation to bye week number
        """
        conn = self._get_connection()

        # Get all weeks each team played
        team_weeks = conn.execute("""
            SELECT DISTINCT
                CASE WHEN home_team = team THEN home_team ELSE away_team END as team,
                week
            FROM (
                SELECT home_team as team, week FROM nfl_games WHERE season = ? AND season_type = 'REG'
                UNION ALL
                SELECT away_team as team, week FROM nfl_games WHERE season = ? AND season_type = 'REG'
            )
        """, (season, season)).fetchall()

        # Build set of weeks played per team
        weeks_by_team: Dict[str, Set[int]] = {}
        for row in team_weeks:
            team = row["team"]
            week = row["week"]
            if team not in weeks_by_team:
                weeks_by_team[team] = set()
            weeks_by_team[team].add(week)

        # Determine max weeks in season
        max_week = max(w for weeks in weeks_by_team.values() for w in weeks)
        all_weeks = set(range(1, max_week + 1))

        # Find bye weeks (weeks not played)
        bye_weeks = {}
        for team, played_weeks in weeks_by_team.items():
            missing = all_weeks - played_weeks
            if missing:
                # Typically there's one bye week (ignore week 18+ which might not exist)
                bye = min(w for w in missing if w <= 14)  # Bye usually before week 15
                bye_weeks[team] = bye

        return bye_weeks

    def export_bye_weeks(
        self,
        season: int,
        output_path: Optional[Path] = None
    ) -> str:
        """Export bye weeks to JSON format."""
        bye_weeks = self.get_bye_weeks(season)

        data = {
            "season": season,
            "bye_weeks": bye_weeks,
            "by_week": {}
        }

        # Group teams by bye week
        for team, week in bye_weeks.items():
            week_key = str(week)
            if week_key not in data["by_week"]:
                data["by_week"][week_key] = []
            data["by_week"][week_key].append(team)

        json_str = json.dumps(data, indent=2)

        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json_str)
            logger.info(f"Bye weeks exported to {output_path}")

        return json_str

    def get_team_schedule(self, team: str, season: int) -> List[Dict[str, Any]]:
        """Get full schedule for a specific team."""
        team = self._normalize_team(team)
        conn = self._get_connection()

        rows = conn.execute("""
            SELECT * FROM nfl_games
            WHERE season = ?
              AND (home_team = ? OR away_team = ?)
              AND season_type = 'REG'
            ORDER BY week
        """, (season, team, team)).fetchall()

        schedule = []
        for row in rows:
            is_home = row["home_team"] == team
            opponent = row["away_team"] if is_home else row["home_team"]

            schedule.append({
                "week": row["week"],
                "opponent": opponent,
                "is_home": is_home,
                "game_date": row["game_date"],
                "game_time": row["game_time"],
                "result": f"{row['home_score']}-{row['away_score']}" if row["home_score"] is not None else None,
                "status": row["status"]
            })

        return schedule


# Convenience functions
def load_schedule(
    season: int,
    db_path: Path = STATS_DB_PATH,
    update_existing: bool = True
) -> LoadResult:
    """Load schedule for a single season."""
    with ScheduleLoader(db_path=db_path) as loader:
        return loader.load_season(season, update_existing)


def get_bye_weeks(
    season: int,
    db_path: Path = STATS_DB_PATH
) -> Dict[str, int]:
    """Get bye weeks for all teams in a season."""
    with ScheduleLoader(db_path=db_path) as loader:
        return loader.get_bye_weeks(season)


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="NFL Schedule Integration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Load all seasons
  python load_schedule.py --all

  # Load specific season
  python load_schedule.py --season 2024

  # Export bye weeks
  python load_schedule.py --bye-weeks 2024

  # Dry run
  python load_schedule.py --season 2024 --dry-run
        """
    )

    parser.add_argument(
        "--season",
        type=int,
        help="Load specific season"
    )

    parser.add_argument(
        "--seasons",
        type=str,
        help="Comma-separated list of seasons"
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
        "--bye-weeks",
        type=int,
        metavar="SEASON",
        help="Export bye weeks for a season"
    )

    parser.add_argument(
        "--team-schedule",
        nargs=2,
        metavar=("TEAM", "SEASON"),
        help="Get schedule for a specific team"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without applying"
    )

    parser.add_argument(
        "--no-update",
        action="store_true",
        help="Don't update existing games"
    )

    parser.add_argument(
        "--output", "-o",
        type=Path,
        help="Output path for export operations"
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

    loader = ScheduleLoader(db_path=args.db)

    try:
        if args.bye_weeks:
            # Export bye weeks
            output = args.output or Path(f"bye_weeks_{args.bye_weeks}.json")
            json_str = loader.export_bye_weeks(args.bye_weeks, output)
            if not args.output:
                print(json_str)
            return 0

        if args.team_schedule:
            # Get team schedule
            team, season = args.team_schedule
            schedule = loader.get_team_schedule(team, int(season))
            print(json.dumps(schedule, indent=2))
            return 0

        if args.season:
            # Load single season
            result = loader.load_season(
                args.season,
                update_existing=not args.no_update,
                dry_run=args.dry_run
            )
            print(f"\nSeason {result.season}:")
            print(f"  Games loaded: {result.games_loaded}")
            print(f"  Games updated: {result.games_updated}")
            print(f"  Games skipped: {result.games_skipped}")
            if result.errors:
                print(f"  Errors: {len(result.errors)}")
            return 0 if not result.errors else 1

        if args.seasons:
            # Load multiple seasons
            seasons = [int(s) for s in args.seasons.split(",")]
            for season in seasons:
                result = loader.load_season(
                    season,
                    update_existing=not args.no_update,
                    dry_run=args.dry_run
                )
                print(f"Season {season}: {result.games_loaded} loaded, {result.games_updated} updated")
            return 0

        if args.all:
            # Load all seasons
            results = loader.load_all_seasons(
                start_season=args.start_season,
                end_season=args.end_season,
                update_existing=not args.no_update,
                dry_run=args.dry_run
            )

            total_loaded = sum(r.games_loaded for r in results.values())
            total_updated = sum(r.games_updated for r in results.values())
            total_errors = sum(len(r.errors) for r in results.values())

            print(f"\nSummary:")
            print(f"  Seasons processed: {len(results)}")
            print(f"  Total games loaded: {total_loaded}")
            print(f"  Total games updated: {total_updated}")
            print(f"  Total errors: {total_errors}")
            return 0 if total_errors == 0 else 1

        # Default: show help
        parser.print_help()
        return 0

    finally:
        loader.close()


if __name__ == "__main__":
    sys.exit(main())
