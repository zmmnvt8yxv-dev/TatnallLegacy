#!/usr/bin/env python3
"""
Matchup History Builder (Phase 3, Task 3.3)

Builds complete matchup database with context from ESPN and Sleeper data.

Features:
    - Link matchups to NFL schedule (bye weeks, opponent strength)
    - Calculate margin, playoff impact
    - Historical head-to-head records

Usage:
    # Process all available seasons
    python build_matchups.py --all

    # Process specific season
    python build_matchups.py --season 2024

    # Rebuild head-to-head records only
    python build_matchups.py --rebuild-h2h

    # Dry run (no database writes)
    python build_matchups.py --season 2024 --dry-run
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
SCHEMA_PATH = SCRIPT_DIR.parent / "db" / "league_schema.sql"

# Playoff weeks (typical NFL fantasy playoffs)
PLAYOFF_WEEKS = {14, 15, 16, 17}
CHAMPIONSHIP_WEEKS = {16, 17}


@dataclass
class Matchup:
    """Represents a fantasy matchup."""
    season: int
    week: int
    matchup_type: str  # 'regular', 'playoff', 'consolation', 'championship'
    home_team_id: str
    home_team_name: Optional[str]
    away_team_id: str
    away_team_name: Optional[str]
    home_score: Optional[float]
    away_score: Optional[float]
    margin: Optional[float] = None
    winner_team_id: Optional[str] = None
    nfl_week_info: Optional[str] = None
    playoff_seed_home: Optional[int] = None
    playoff_seed_away: Optional[int] = None
    elimination_game: bool = False
    source: str = "unknown"
    source_matchup_id: Optional[str] = None


@dataclass
class HeadToHead:
    """Represents head-to-head record between two teams."""
    team_a_id: str
    team_a_name: Optional[str]
    team_b_id: str
    team_b_name: Optional[str]
    team_a_wins: int = 0
    team_b_wins: int = 0
    ties: int = 0
    team_a_total_points: float = 0.0
    team_b_total_points: float = 0.0
    matchups: List[Dict[str, Any]] = field(default_factory=list)
    current_streak_team: Optional[str] = None
    current_streak_count: int = 0
    longest_streak_team: Optional[str] = None
    longest_streak_count: int = 0
    first_matchup_season: Optional[int] = None
    last_matchup_season: Optional[int] = None


class MatchupBuilder:
    """
    Builds complete matchup database with context.

    Features:
    - Link matchups to NFL schedule context
    - Calculate margins and determine winners
    - Track playoff implications
    - Build and maintain head-to-head records
    """

    def __init__(
        self,
        league_db_path: Path = LEAGUE_DB_PATH,
        stats_db_path: Path = STATS_DB_PATH,
        dry_run: bool = False
    ):
        self.league_db_path = league_db_path
        self.stats_db_path = stats_db_path
        self.dry_run = dry_run

        # Stats tracking
        self.stats = {
            "matchups_processed": 0,
            "matchups_inserted": 0,
            "matchups_updated": 0,
            "h2h_records_updated": 0,
            "standings_updated": 0,
            "errors": []
        }

        # Caches
        self._nfl_schedule_cache: Dict[Tuple[int, int], Dict[str, Any]] = {}
        self._team_cache: Dict[Tuple[str, int], Dict[str, Any]] = {}

    def _get_league_connection(self) -> sqlite3.Connection:
        """Get connection to league database."""
        conn = sqlite3.connect(str(self.league_db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _get_stats_connection(self) -> Optional[sqlite3.Connection]:
        """Get connection to stats database."""
        if not self.stats_db_path.exists():
            return None
        conn = sqlite3.connect(str(self.stats_db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_league_db(self) -> None:
        """Initialize league database with schema if needed."""
        if not self.league_db_path.exists():
            self.league_db_path.parent.mkdir(parents=True, exist_ok=True)

        conn = self._get_league_connection()
        try:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='unified_matchups'"
            )
            if cursor.fetchone() is None:
                if SCHEMA_PATH.exists():
                    schema_sql = SCHEMA_PATH.read_text()
                    conn.executescript(schema_sql)
                    conn.commit()
                    logger.info(f"Initialized league database at {self.league_db_path}")
        finally:
            conn.close()

    def _get_nfl_week_info(self, season: int, week: int) -> Optional[Dict[str, Any]]:
        """Get NFL schedule information for a week."""
        cache_key = (season, week)
        if cache_key in self._nfl_schedule_cache:
            return self._nfl_schedule_cache[cache_key]

        info = {"bye_teams": [], "notable_games": []}

        stats_conn = self._get_stats_connection()
        if not stats_conn:
            return info

        try:
            # Get games for this week
            cursor = stats_conn.execute("""
                SELECT home_team, away_team, home_score, away_score, game_date
                FROM nfl_games
                WHERE season = ? AND week = ? AND season_type = 'REG'
            """, (season, week))

            games = cursor.fetchall()
            teams_playing = set()

            for game in games:
                teams_playing.add(game["home_team"])
                teams_playing.add(game["away_team"])

                # Check for notable games (high scoring, divisional, etc.)
                home_score = game["home_score"] or 0
                away_score = game["away_score"] or 0
                total = home_score + away_score

                if total > 60:
                    info["notable_games"].append({
                        "teams": f"{game['away_team']}@{game['home_team']}",
                        "score": f"{away_score}-{home_score}",
                        "type": "high_scoring"
                    })

            # Determine bye teams (all 32 teams minus those playing)
            all_teams = {
                "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
                "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
                "LV", "LAC", "LAR", "MIA", "MIN", "NE", "NO", "NYG",
                "NYJ", "PHI", "PIT", "SF", "SEA", "TB", "TEN", "WAS"
            }
            info["bye_teams"] = list(all_teams - teams_playing)

            stats_conn.close()

        except Exception as e:
            logger.debug(f"Error getting NFL week info: {e}")
            if stats_conn:
                stats_conn.close()

        self._nfl_schedule_cache[cache_key] = info
        return info

    def _determine_matchup_type(
        self,
        week: int,
        home_seed: Optional[int],
        away_seed: Optional[int]
    ) -> str:
        """Determine the type of matchup based on week and seeds."""
        if week < 14:
            return "regular"
        elif week in CHAMPIONSHIP_WEEKS:
            if home_seed and away_seed and max(home_seed, away_seed) <= 2:
                return "championship"
            return "playoff"
        elif week in PLAYOFF_WEEKS:
            return "playoff"
        return "consolation"

    # -------------------------------------------------------------------------
    # Sleeper Matchup Processing
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

    def _process_sleeper_matchups(
        self,
        season: int,
        lineup_data: List[Dict[str, Any]],
        teams: Dict[str, Dict[str, Any]]
    ) -> List[Matchup]:
        """Process Sleeper lineup data to extract matchups."""
        matchups = []
        seen_matchups: set = set()

        # Group lineups by week and matchup_id
        by_week_matchup: Dict[Tuple[int, int], List[Dict[str, Any]]] = {}
        for lineup in lineup_data:
            week = lineup.get("week", 1)
            matchup_id = lineup.get("matchup_id")
            if matchup_id is None:
                continue
            key = (week, matchup_id)
            if key not in by_week_matchup:
                by_week_matchup[key] = []
            by_week_matchup[key].append(lineup)

        # Process each matchup
        for (week, matchup_id), participants in by_week_matchup.items():
            if len(participants) != 2:
                continue  # Skip incomplete matchups

            # Determine home/away (lower roster_id is "home")
            participants.sort(key=lambda x: int(x.get("roster_id", 0)))
            home = participants[0]
            away = participants[1]

            home_team_id = str(home.get("roster_id"))
            away_team_id = str(away.get("roster_id"))

            # Skip if already processed
            matchup_key = (season, week, home_team_id, away_team_id)
            if matchup_key in seen_matchups:
                continue
            seen_matchups.add(matchup_key)

            home_score = home.get("points")
            away_score = away.get("points")

            # Calculate margin and winner
            margin = None
            winner = None
            if home_score is not None and away_score is not None:
                margin = home_score - away_score
                if margin > 0:
                    winner = home_team_id
                elif margin < 0:
                    winner = away_team_id
                # margin == 0 means tie

            # Get team names
            home_info = teams.get(home_team_id, {})
            away_info = teams.get(away_team_id, {})

            # Get NFL context
            nfl_info = self._get_nfl_week_info(season, week)

            # Determine matchup type
            matchup_type = self._determine_matchup_type(week, None, None)

            matchups.append(Matchup(
                season=season,
                week=week,
                matchup_type=matchup_type,
                home_team_id=home_team_id,
                home_team_name=home_info.get("team_name"),
                away_team_id=away_team_id,
                away_team_name=away_info.get("team_name"),
                home_score=home_score,
                away_score=away_score,
                margin=margin,
                winner_team_id=winner,
                nfl_week_info=json.dumps(nfl_info) if nfl_info else None,
                source="sleeper",
                source_matchup_id=str(matchup_id)
            ))

        return matchups

    def process_sleeper_season(self, season: int) -> List[Matchup]:
        """Process Sleeper matchups for a season."""
        lineups_path = DATA_DIR / f"lineups-{season}.json"
        if not lineups_path.exists():
            # Try matchups file
            matchups_files = list(DATA_DIR.glob(f"matchups_{season}_*.json"))
            if matchups_files:
                # Process matchup files directly
                all_lineups = []
                for f in matchups_files:
                    data = json.loads(f.read_text())
                    if isinstance(data, list):
                        all_lineups.extend(data)
                    else:
                        all_lineups.extend(data.get("matchups", []))

                teams = self._load_sleeper_teams(season)
                return self._process_sleeper_matchups(season, all_lineups, teams)

            logger.warning(f"No Sleeper lineups/matchups found for season {season}")
            return []

        data = json.loads(lineups_path.read_text())
        lineups = data.get("lineups", data) if isinstance(data, dict) else data

        teams = self._load_sleeper_teams(season)

        logger.info(f"Processing Sleeper matchups for {season}")
        return self._process_sleeper_matchups(season, lineups, teams)

    # -------------------------------------------------------------------------
    # ESPN/Manual Matchup Processing
    # -------------------------------------------------------------------------

    def _process_manual_matchups(
        self,
        season: int,
        matchups_data: List[Dict[str, Any]],
        teams_data: List[Dict[str, Any]]
    ) -> List[Matchup]:
        """Process manually curated matchup data."""
        matchups = []

        # Build team lookup
        teams = {}
        for team in teams_data:
            name = team.get("team_name")
            if name:
                teams[name] = {
                    "team_id": name,  # Use name as ID for manual data
                    "owner": team.get("owner"),
                    "regular_season_rank": team.get("regular_season_rank"),
                    "final_rank": team.get("final_rank")
                }

        for m in matchups_data:
            week = m.get("week", 1)
            home_name = m.get("home_team")
            away_name = m.get("away_team")
            home_score = m.get("home_score")
            away_score = m.get("away_score")
            is_playoff = m.get("is_playoff", False)

            # Calculate margin and winner
            margin = None
            winner = None
            if home_score is not None and away_score is not None:
                margin = home_score - away_score
                if margin > 0:
                    winner = home_name
                elif margin < 0:
                    winner = away_name

            # Determine matchup type
            if is_playoff:
                matchup_type = "playoff"
                if week in CHAMPIONSHIP_WEEKS:
                    home_info = teams.get(home_name, {})
                    away_info = teams.get(away_name, {})
                    home_rank = home_info.get("regular_season_rank", 99)
                    away_rank = away_info.get("regular_season_rank", 99)
                    if home_rank <= 2 and away_rank <= 2:
                        matchup_type = "championship"
            else:
                matchup_type = "regular"

            # Get NFL context
            nfl_info = self._get_nfl_week_info(season, week)

            matchups.append(Matchup(
                season=season,
                week=week,
                matchup_type=matchup_type,
                home_team_id=home_name or "unknown",
                home_team_name=home_name,
                away_team_id=away_name or "unknown",
                away_team_name=away_name,
                home_score=home_score,
                away_score=away_score,
                margin=margin,
                winner_team_id=winner,
                nfl_week_info=json.dumps(nfl_info) if nfl_info else None,
                source="manual"
            ))

        return matchups

    def process_manual_season(self, season: int) -> List[Matchup]:
        """Process manual/ESPN data for a season."""
        data_path = DATA_DIR / f"{season}.json"
        if not data_path.exists():
            logger.warning(f"No manual matchup data found for season {season}")
            return []

        data = json.loads(data_path.read_text())
        matchups_data = data.get("matchups", [])
        teams_data = data.get("teams", [])

        logger.info(f"Processing manual matchups for {season}")
        return self._process_manual_matchups(season, matchups_data, teams_data)

    # -------------------------------------------------------------------------
    # Head-to-Head Records
    # -------------------------------------------------------------------------

    def _compute_head_to_head(
        self,
        conn: sqlite3.Connection
    ) -> List[HeadToHead]:
        """Compute all head-to-head records from matchup history."""
        h2h_records: Dict[Tuple[str, str], HeadToHead] = {}

        # Get all matchups
        cursor = conn.execute("""
            SELECT season, week, matchup_type,
                   home_team_id, home_team_name, home_score,
                   away_team_id, away_team_name, away_score,
                   winner_team_id
            FROM unified_matchups
            ORDER BY season, week
        """)

        for row in cursor.fetchall():
            # Normalize team order (alphabetically by ID)
            teams = sorted([
                (row["home_team_id"], row["home_team_name"], row["home_score"]),
                (row["away_team_id"], row["away_team_name"], row["away_score"])
            ])

            team_a_id, team_a_name, team_a_score = teams[0]
            team_b_id, team_b_name, team_b_score = teams[1]

            # Skip self-matchups (shouldn't happen, but just in case)
            if team_a_id == team_b_id:
                continue

            key = (team_a_id, team_b_id)

            if key not in h2h_records:
                h2h_records[key] = HeadToHead(
                    team_a_id=team_a_id,
                    team_a_name=team_a_name,
                    team_b_id=team_b_id,
                    team_b_name=team_b_name
                )

            record = h2h_records[key]

            # Update names if we have them
            if team_a_name and not record.team_a_name:
                record.team_a_name = team_a_name
            if team_b_name and not record.team_b_name:
                record.team_b_name = team_b_name

            # Track first/last matchup
            season = row["season"]
            if record.first_matchup_season is None or season < record.first_matchup_season:
                record.first_matchup_season = season
            if record.last_matchup_season is None or season > record.last_matchup_season:
                record.last_matchup_season = season

            # Add to matchups list
            record.matchups.append({
                "season": season,
                "week": row["week"],
                "type": row["matchup_type"],
                "team_a_score": team_a_score,
                "team_b_score": team_b_score,
                "winner": row["winner_team_id"]
            })

            # Update win/loss record
            winner = row["winner_team_id"]
            if winner == team_a_id:
                record.team_a_wins += 1
            elif winner == team_b_id:
                record.team_b_wins += 1
            else:
                record.ties += 1

            # Update total points
            if team_a_score is not None:
                record.team_a_total_points += team_a_score
            if team_b_score is not None:
                record.team_b_total_points += team_b_score

        # Calculate streaks and averages
        for record in h2h_records.values():
            total_games = record.team_a_wins + record.team_b_wins + record.ties
            if total_games > 0:
                record.team_a_avg_points = record.team_a_total_points / total_games
                record.team_b_avg_points = record.team_b_total_points / total_games
            else:
                record.team_a_avg_points = 0
                record.team_b_avg_points = 0

            # Calculate streaks
            if record.matchups:
                current_winner = None
                current_count = 0
                longest_winner = None
                longest_count = 0

                for m in record.matchups:
                    winner = m.get("winner")
                    if winner == current_winner:
                        current_count += 1
                    else:
                        # Check if previous streak was longest
                        if current_count > longest_count:
                            longest_winner = current_winner
                            longest_count = current_count
                        current_winner = winner
                        current_count = 1

                # Check final streak
                if current_count > longest_count:
                    longest_winner = current_winner
                    longest_count = current_count

                record.current_streak_team = current_winner
                record.current_streak_count = current_count
                record.longest_streak_team = longest_winner
                record.longest_streak_count = longest_count

        return list(h2h_records.values())

    def _save_head_to_head(
        self,
        conn: sqlite3.Connection,
        records: List[HeadToHead]
    ) -> int:
        """Save head-to-head records to database."""
        updated = 0

        for record in records:
            try:
                total_matchups = record.team_a_wins + record.team_b_wins + record.ties

                # Upsert record
                conn.execute("""
                    INSERT INTO head_to_head (
                        team_a_id, team_a_name, team_b_id, team_b_name,
                        team_a_wins, team_b_wins, ties,
                        team_a_total_points, team_b_total_points,
                        team_a_avg_points, team_b_avg_points,
                        current_streak_team, current_streak_count,
                        longest_streak_team, longest_streak_count,
                        first_matchup_season, last_matchup_season,
                        total_matchups, matchups_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(team_a_id, team_b_id) DO UPDATE SET
                        team_a_name = excluded.team_a_name,
                        team_b_name = excluded.team_b_name,
                        team_a_wins = excluded.team_a_wins,
                        team_b_wins = excluded.team_b_wins,
                        ties = excluded.ties,
                        team_a_total_points = excluded.team_a_total_points,
                        team_b_total_points = excluded.team_b_total_points,
                        team_a_avg_points = excluded.team_a_avg_points,
                        team_b_avg_points = excluded.team_b_avg_points,
                        current_streak_team = excluded.current_streak_team,
                        current_streak_count = excluded.current_streak_count,
                        longest_streak_team = excluded.longest_streak_team,
                        longest_streak_count = excluded.longest_streak_count,
                        first_matchup_season = excluded.first_matchup_season,
                        last_matchup_season = excluded.last_matchup_season,
                        total_matchups = excluded.total_matchups,
                        matchups_json = excluded.matchups_json
                """, (
                    record.team_a_id, record.team_a_name,
                    record.team_b_id, record.team_b_name,
                    record.team_a_wins, record.team_b_wins, record.ties,
                    record.team_a_total_points, record.team_b_total_points,
                    record.team_a_avg_points, record.team_b_avg_points,
                    record.current_streak_team, record.current_streak_count,
                    record.longest_streak_team, record.longest_streak_count,
                    record.first_matchup_season, record.last_matchup_season,
                    total_matchups, json.dumps(record.matchups)
                ))
                updated += 1

            except Exception as e:
                logger.error(f"Error saving H2H record: {e}")

        return updated

    # -------------------------------------------------------------------------
    # Season Standings
    # -------------------------------------------------------------------------

    def _build_season_standings(
        self,
        conn: sqlite3.Connection,
        season: int
    ) -> int:
        """Build season standings from matchup data."""
        standings: Dict[str, Dict[str, Any]] = {}

        # Get all matchups for the season
        cursor = conn.execute("""
            SELECT week, matchup_type,
                   home_team_id, home_team_name, home_score,
                   away_team_id, away_team_name, away_score,
                   winner_team_id
            FROM unified_matchups
            WHERE season = ? AND matchup_type = 'regular'
        """, (season,))

        for row in cursor.fetchall():
            # Process home team
            home_id = row["home_team_id"]
            if home_id not in standings:
                standings[home_id] = {
                    "team_name": row["home_team_name"],
                    "wins": 0, "losses": 0, "ties": 0,
                    "points_for": 0, "points_against": 0
                }

            # Process away team
            away_id = row["away_team_id"]
            if away_id not in standings:
                standings[away_id] = {
                    "team_name": row["away_team_name"],
                    "wins": 0, "losses": 0, "ties": 0,
                    "points_for": 0, "points_against": 0
                }

            # Update records
            winner = row["winner_team_id"]
            home_score = row["home_score"] or 0
            away_score = row["away_score"] or 0

            standings[home_id]["points_for"] += home_score
            standings[home_id]["points_against"] += away_score
            standings[away_id]["points_for"] += away_score
            standings[away_id]["points_against"] += home_score

            if winner == home_id:
                standings[home_id]["wins"] += 1
                standings[away_id]["losses"] += 1
            elif winner == away_id:
                standings[away_id]["wins"] += 1
                standings[home_id]["losses"] += 1
            else:
                standings[home_id]["ties"] += 1
                standings[away_id]["ties"] += 1

        # Calculate ranks
        sorted_teams = sorted(
            standings.items(),
            key=lambda x: (x[1]["wins"], x[1]["points_for"]),
            reverse=True
        )

        # Save standings
        updated = 0
        for rank, (team_id, data) in enumerate(sorted_teams, 1):
            try:
                points_diff = data["points_for"] - data["points_against"]

                conn.execute("""
                    INSERT INTO season_standings (
                        season, team_id, team_name,
                        wins, losses, ties,
                        points_for, points_against, points_diff,
                        regular_season_rank, source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(source, season, team_id) DO UPDATE SET
                        team_name = excluded.team_name,
                        wins = excluded.wins,
                        losses = excluded.losses,
                        ties = excluded.ties,
                        points_for = excluded.points_for,
                        points_against = excluded.points_against,
                        points_diff = excluded.points_diff,
                        regular_season_rank = excluded.regular_season_rank
                """, (
                    season, team_id, data["team_name"],
                    data["wins"], data["losses"], data["ties"],
                    data["points_for"], data["points_against"], points_diff,
                    rank, "computed"
                ))
                updated += 1

            except Exception as e:
                logger.error(f"Error saving standings: {e}")

        return updated

    # -------------------------------------------------------------------------
    # Database Operations
    # -------------------------------------------------------------------------

    def _save_matchups(
        self,
        conn: sqlite3.Connection,
        matchups: List[Matchup]
    ) -> Tuple[int, int]:
        """Save matchups to database."""
        inserted = 0
        updated = 0

        for m in matchups:
            try:
                # Check if exists
                cursor = conn.execute("""
                    SELECT id FROM unified_matchups
                    WHERE source = ? AND season = ? AND week = ?
                      AND home_team_id = ? AND away_team_id = ?
                """, (m.source, m.season, m.week, m.home_team_id, m.away_team_id))

                existing = cursor.fetchone()

                if existing:
                    conn.execute("""
                        UPDATE unified_matchups SET
                            matchup_type = ?,
                            home_team_name = ?,
                            away_team_name = ?,
                            home_score = ?,
                            away_score = ?,
                            margin = ?,
                            winner_team_id = ?,
                            nfl_week_info = ?,
                            playoff_seed_home = ?,
                            playoff_seed_away = ?,
                            elimination_game = ?,
                            source_matchup_id = ?
                        WHERE id = ?
                    """, (
                        m.matchup_type, m.home_team_name, m.away_team_name,
                        m.home_score, m.away_score, m.margin, m.winner_team_id,
                        m.nfl_week_info, m.playoff_seed_home, m.playoff_seed_away,
                        1 if m.elimination_game else 0, m.source_matchup_id,
                        existing["id"]
                    ))
                    updated += 1
                else:
                    conn.execute("""
                        INSERT INTO unified_matchups (
                            season, week, matchup_type,
                            home_team_id, home_team_name,
                            away_team_id, away_team_name,
                            home_score, away_score, margin, winner_team_id,
                            nfl_week_info, playoff_seed_home, playoff_seed_away,
                            elimination_game, source, source_matchup_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        m.season, m.week, m.matchup_type,
                        m.home_team_id, m.home_team_name,
                        m.away_team_id, m.away_team_name,
                        m.home_score, m.away_score, m.margin, m.winner_team_id,
                        m.nfl_week_info, m.playoff_seed_home, m.playoff_seed_away,
                        1 if m.elimination_game else 0, m.source, m.source_matchup_id
                    ))
                    inserted += 1

            except Exception as e:
                logger.error(f"Error saving matchup: {e}")
                self.stats["errors"].append({
                    "type": "save_error",
                    "matchup": f"{m.season} W{m.week} {m.home_team_id} vs {m.away_team_id}",
                    "error": str(e)
                })

        return inserted, updated

    # -------------------------------------------------------------------------
    # Main Processing Methods
    # -------------------------------------------------------------------------

    def process_season(
        self,
        season: int,
        sources: Optional[List[str]] = None
    ) -> None:
        """Process matchups for a single season."""
        if sources is None:
            if season >= 2025:
                sources = ["sleeper"]
            else:
                sources = ["manual"]

        all_matchups: List[Matchup] = []

        for source in sources:
            if source == "sleeper":
                matchups = self.process_sleeper_season(season)
            elif source in ("manual", "espn"):
                matchups = self.process_manual_season(season)
            else:
                logger.warning(f"Unknown source: {source}")
                continue

            all_matchups.extend(matchups)
            self.stats["matchups_processed"] += len(matchups)

        if not all_matchups:
            logger.info(f"No matchups found for season {season}")
            return

        logger.info(f"Processed {len(all_matchups)} matchups for season {season}")

        if not self.dry_run:
            self._init_league_db()
            conn = self._get_league_connection()
            try:
                inserted, updated = self._save_matchups(conn, all_matchups)
                self.stats["matchups_inserted"] = inserted
                self.stats["matchups_updated"] = updated

                # Build standings
                standings_updated = self._build_season_standings(conn, season)
                self.stats["standings_updated"] = standings_updated

                conn.commit()
                logger.info(
                    f"Saved matchups for {season}: "
                    f"{inserted} inserted, {updated} updated, "
                    f"{standings_updated} standings records"
                )
            finally:
                conn.close()
        else:
            logger.info(f"[DRY RUN] Would save {len(all_matchups)} matchups")

    def process_all_seasons(
        self,
        start_season: int = 2015,
        end_season: int = 2025,
        sources: Optional[List[str]] = None
    ) -> None:
        """Process matchups for all seasons."""
        for season in range(start_season, end_season + 1):
            try:
                season_sources = sources
                if season_sources is None:
                    if season >= 2025:
                        season_sources = ["sleeper"]
                    else:
                        season_sources = ["manual"]

                self.process_season(season, season_sources)
            except Exception as e:
                logger.error(f"Error processing season {season}: {e}")

    def rebuild_head_to_head(self) -> None:
        """Rebuild all head-to-head records from matchup history."""
        if self.dry_run:
            logger.info("[DRY RUN] Would rebuild head-to-head records")
            return

        self._init_league_db()
        conn = self._get_league_connection()
        try:
            logger.info("Computing head-to-head records...")
            records = self._compute_head_to_head(conn)

            logger.info(f"Saving {len(records)} head-to-head records...")
            updated = self._save_head_to_head(conn, records)

            conn.commit()
            self.stats["h2h_records_updated"] = updated
            logger.info(f"Updated {updated} head-to-head records")
        finally:
            conn.close()

    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics."""
        return self.stats


def main():
    parser = argparse.ArgumentParser(
        description="Build matchup history database"
    )
    parser.add_argument(
        "--season", type=int,
        help="Process specific season"
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Process all available seasons (2015-2025)"
    )
    parser.add_argument(
        "--source", choices=["sleeper", "manual", "espn"],
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
        "--rebuild-h2h", action="store_true",
        help="Rebuild head-to-head records only"
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
        "--stats-db", type=Path, default=STATS_DB_PATH,
        help="Path to stats database (for NFL context)"
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    sources = [args.source] if args.source else None

    builder = MatchupBuilder(
        league_db_path=args.db_path,
        stats_db_path=args.stats_db,
        dry_run=args.dry_run
    )

    if args.rebuild_h2h:
        builder.rebuild_head_to_head()
    elif args.all:
        builder.process_all_seasons(
            start_season=args.start_season,
            end_season=args.end_season,
            sources=sources
        )
        # Rebuild H2H after processing all seasons
        if not args.dry_run:
            builder.rebuild_head_to_head()
    elif args.season:
        builder.process_season(args.season, sources)
        # Rebuild H2H after processing
        if not args.dry_run:
            builder.rebuild_head_to_head()
    else:
        parser.print_help()
        print("\nError: Must specify --season, --all, or --rebuild-h2h")
        sys.exit(1)

    # Print summary
    stats = builder.get_stats()
    print("\n=== Summary ===")
    print(f"Matchups processed: {stats['matchups_processed']}")
    print(f"Matchups inserted: {stats['matchups_inserted']}")
    print(f"Matchups updated: {stats['matchups_updated']}")
    print(f"Standings updated: {stats['standings_updated']}")
    print(f"H2H records updated: {stats['h2h_records_updated']}")
    if stats['errors']:
        print(f"Errors: {len(stats['errors'])}")


if __name__ == "__main__":
    main()
