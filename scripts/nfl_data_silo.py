"""
NFL Data Silo

Centralized module for all NFL-related data (non-fantasy):
- Teams: Rosters, profiles, historical info
- Standings: Current and historical standings
- Schedules: Past and upcoming games
- Statistics: Team and player stats
- History: Historical records, champions, etc.

This silo combines data from:
- Sportradar NFL API (real-time, official data)
- nflreadr/nflverse (historical data, analytics)

Usage:
    from nfl_data_silo import NFLDataSilo

    silo = NFLDataSilo()

    # Get current standings
    standings = silo.get_standings(2024)

    # Get team info
    team = silo.get_team("KC")

    # Get historical data
    history = silo.get_season_history(2023)
"""

import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
from datetime import datetime, date
import json

import pandas as pd

from config import get_sportradar_nfl_key

# Try to import our clients
try:
    from sportradar_nfl import SportradarNFLClient
    SPORTRADAR_AVAILABLE = True
except (ImportError, ValueError):
    SPORTRADAR_AVAILABLE = False
    SportradarNFLClient = None

try:
    from nflreadr_data import NFLReaderClient
    NFLREADR_AVAILABLE = True
except ImportError:
    NFLREADR_AVAILABLE = False
    NFLReaderClient = None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Project paths
PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "public" / "data" / "nfl_silo"


# NFL Team abbreviation mapping (standard -> various formats)
TEAM_ABBR_MAP = {
    # Standard: (full name, city, sportradar alias)
    "ARI": ("Arizona Cardinals", "Arizona", "ARI"),
    "ATL": ("Atlanta Falcons", "Atlanta", "ATL"),
    "BAL": ("Baltimore Ravens", "Baltimore", "BAL"),
    "BUF": ("Buffalo Bills", "Buffalo", "BUF"),
    "CAR": ("Carolina Panthers", "Carolina", "CAR"),
    "CHI": ("Chicago Bears", "Chicago", "CHI"),
    "CIN": ("Cincinnati Bengals", "Cincinnati", "CIN"),
    "CLE": ("Cleveland Browns", "Cleveland", "CLE"),
    "DAL": ("Dallas Cowboys", "Dallas", "DAL"),
    "DEN": ("Denver Broncos", "Denver", "DEN"),
    "DET": ("Detroit Lions", "Detroit", "DET"),
    "GB": ("Green Bay Packers", "Green Bay", "GB"),
    "HOU": ("Houston Texans", "Houston", "HOU"),
    "IND": ("Indianapolis Colts", "Indianapolis", "IND"),
    "JAX": ("Jacksonville Jaguars", "Jacksonville", "JAX"),
    "KC": ("Kansas City Chiefs", "Kansas City", "KC"),
    "LAC": ("Los Angeles Chargers", "Los Angeles", "LAC"),
    "LAR": ("Los Angeles Rams", "Los Angeles", "LA"),
    "LV": ("Las Vegas Raiders", "Las Vegas", "LV"),
    "MIA": ("Miami Dolphins", "Miami", "MIA"),
    "MIN": ("Minnesota Vikings", "Minnesota", "MIN"),
    "NE": ("New England Patriots", "New England", "NE"),
    "NO": ("New Orleans Saints", "New Orleans", "NO"),
    "NYG": ("New York Giants", "New York", "NYG"),
    "NYJ": ("New York Jets", "New York", "NYJ"),
    "PHI": ("Philadelphia Eagles", "Philadelphia", "PHI"),
    "PIT": ("Pittsburgh Steelers", "Pittsburgh", "PIT"),
    "SEA": ("Seattle Seahawks", "Seattle", "SEA"),
    "SF": ("San Francisco 49ers", "San Francisco", "SF"),
    "TB": ("Tampa Bay Buccaneers", "Tampa Bay", "TB"),
    "TEN": ("Tennessee Titans", "Tennessee", "TEN"),
    "WAS": ("Washington Commanders", "Washington", "WAS"),
}

# Historical team name changes
HISTORICAL_TEAMS = {
    "OAK": "LV",  # Oakland Raiders -> Las Vegas Raiders (2020)
    "SD": "LAC",  # San Diego Chargers -> Los Angeles Chargers (2017)
    "STL": "LAR",  # St. Louis Rams -> Los Angeles Rams (2016)
    "WSH": "WAS",  # Washington Football Team -> Commanders
}


class NFLDataSilo:
    """
    Central repository for all NFL data.

    Provides unified access to:
    - Team information and rosters
    - League standings (current and historical)
    - Game schedules and results
    - Player statistics
    - Historical records
    """

    def __init__(
        self,
        use_sportradar: bool = True,
        use_nflreadr: bool = True,
    ):
        """
        Initialize the NFL data silo.

        Args:
            use_sportradar: Whether to use Sportradar API
            use_nflreadr: Whether to use nflreadr data
        """
        self.sportradar_client = None
        self.nflreadr_client = None

        # Initialize Sportradar client
        if use_sportradar and SPORTRADAR_AVAILABLE:
            try:
                if get_sportradar_nfl_key():
                    self.sportradar_client = SportradarNFLClient()
                    logger.info("Sportradar client initialized")
            except Exception as e:
                logger.warning(f"Could not initialize Sportradar: {e}")

        # Initialize nflreadr client
        if use_nflreadr and NFLREADR_AVAILABLE:
            try:
                self.nflreadr_client = NFLReaderClient()
                logger.info("nflreadr client initialized")
            except Exception as e:
                logger.warning(f"Could not initialize nflreadr: {e}")

        # Ensure output directory exists
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        # Cache
        self._teams_cache = None
        self._hierarchy_cache = None

    # =========================================================================
    # TEAM DATA
    # =========================================================================

    def get_all_teams(self) -> List[Dict[str, Any]]:
        """
        Get all NFL teams with combined data from all sources.

        Returns:
            List of team dictionaries with:
            - abbr, name, full_name, city
            - conference, division
            - colors, logo URLs
            - venue info
        """
        if self._teams_cache:
            return self._teams_cache

        teams = []

        # Start with nflreadr data (comprehensive)
        if self.nflreadr_client:
            try:
                nfl_teams = self.nflreadr_client.get_teams()
                for _, team in nfl_teams.iterrows():
                    teams.append({
                        "abbr": team.get("team_abbr"),
                        "name": team.get("team_nick"),
                        "full_name": team.get("team_name"),
                        "city": team.get("team_abbr"),  # nflreadr uses abbr
                        "conference": team.get("team_conf"),
                        "division": team.get("team_division"),
                        "color_primary": team.get("team_color"),
                        "color_secondary": team.get("team_color2"),
                        "logo_url": team.get("team_logo_wikipedia"),
                        "wordmark_url": team.get("team_wordmark"),
                        "source": "nflreadr",
                    })
            except Exception as e:
                logger.warning(f"Could not fetch nflreadr teams: {e}")

        # Enrich with Sportradar data if available
        if self.sportradar_client and not teams:
            try:
                sr_teams = self.sportradar_client.get_all_teams()
                for sr_team in sr_teams:
                    teams.append({
                        "abbr": sr_team.get("alias"),
                        "name": sr_team.get("name"),
                        "full_name": f"{sr_team.get('market', '')} {sr_team.get('name', '')}".strip(),
                        "city": sr_team.get("market"),
                        "sportradar_id": sr_team.get("id"),
                        "source": "sportradar",
                    })
            except Exception as e:
                logger.warning(f"Could not fetch Sportradar teams: {e}")

        # Fall back to static data
        if not teams:
            for abbr, (full_name, city, _) in TEAM_ABBR_MAP.items():
                name = full_name.replace(city, "").strip()
                teams.append({
                    "abbr": abbr,
                    "name": name,
                    "full_name": full_name,
                    "city": city,
                    "source": "static",
                })

        self._teams_cache = teams
        return teams

    def get_team(self, abbr: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information for a specific team.

        Args:
            abbr: Team abbreviation (e.g., 'KC', 'SF')

        Returns:
            Team information dictionary
        """
        # Normalize abbreviation
        abbr = abbr.upper()
        if abbr in HISTORICAL_TEAMS:
            abbr = HISTORICAL_TEAMS[abbr]

        teams = self.get_all_teams()
        for team in teams:
            if team.get("abbr") == abbr:
                return team

        return None

    def get_team_roster(self, abbr: str, season: Optional[int] = None) -> pd.DataFrame:
        """
        Get team roster.

        Args:
            abbr: Team abbreviation
            season: Season year (defaults to current)

        Returns:
            DataFrame with roster data
        """
        if season is None:
            season = self._get_current_season()

        abbr = abbr.upper()
        if abbr in HISTORICAL_TEAMS:
            abbr = HISTORICAL_TEAMS[abbr]

        if self.nflreadr_client:
            try:
                rosters = self.nflreadr_client.get_rosters([season])
                team_roster = rosters[rosters["team"] == abbr]
                return team_roster
            except Exception as e:
                logger.warning(f"Could not fetch roster: {e}")

        return pd.DataFrame()

    def get_league_hierarchy(self) -> Dict[str, Any]:
        """
        Get NFL league structure (conferences, divisions, teams).

        Returns:
            Hierarchy dictionary with nested structure
        """
        if self._hierarchy_cache:
            return self._hierarchy_cache

        hierarchy = {
            "conferences": [
                {
                    "name": "AFC",
                    "divisions": [
                        {"name": "East", "teams": ["BUF", "MIA", "NE", "NYJ"]},
                        {"name": "North", "teams": ["BAL", "CIN", "CLE", "PIT"]},
                        {"name": "South", "teams": ["HOU", "IND", "JAX", "TEN"]},
                        {"name": "West", "teams": ["DEN", "KC", "LV", "LAC"]},
                    ],
                },
                {
                    "name": "NFC",
                    "divisions": [
                        {"name": "East", "teams": ["DAL", "NYG", "PHI", "WAS"]},
                        {"name": "North", "teams": ["CHI", "DET", "GB", "MIN"]},
                        {"name": "South", "teams": ["ATL", "CAR", "NO", "TB"]},
                        {"name": "West", "teams": ["ARI", "LAR", "SEA", "SF"]},
                    ],
                },
            ]
        }

        # Enrich with Sportradar data if available
        if self.sportradar_client:
            try:
                sr_hierarchy = self.sportradar_client.get_league_hierarchy()
                # Could merge in Sportradar IDs here
                hierarchy["sportradar_data"] = sr_hierarchy
            except Exception as e:
                logger.debug(f"Could not fetch Sportradar hierarchy: {e}")

        self._hierarchy_cache = hierarchy
        return hierarchy

    # =========================================================================
    # STANDINGS
    # =========================================================================

    def get_standings(
        self,
        season: Optional[int] = None,
        week: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get NFL standings.

        Args:
            season: Season year (defaults to current)
            week: Specific week (defaults to latest)

        Returns:
            Standings dictionary by conference/division
        """
        if season is None:
            season = self._get_current_season()

        standings = {
            "season": season,
            "week": week,
            "last_updated": datetime.now().isoformat(),
            "conferences": {},
        }

        # Try Sportradar first (most current)
        if self.sportradar_client:
            try:
                sr_standings = self.sportradar_client.get_standings(season, "REG")
                standings["sportradar_data"] = sr_standings
                standings["source"] = "sportradar"
                return standings
            except Exception as e:
                logger.warning(f"Could not fetch Sportradar standings: {e}")

        # Fall back to nflreadr (calculate from schedules)
        if self.nflreadr_client:
            try:
                schedules = self.nflreadr_client.get_schedules([season])
                standings["calculated"] = self._calculate_standings(schedules)
                standings["source"] = "nflreadr_calculated"
            except Exception as e:
                logger.warning(f"Could not calculate standings: {e}")

        return standings

    def _calculate_standings(self, schedules: pd.DataFrame) -> Dict[str, List[Dict]]:
        """Calculate standings from game results."""
        # Filter to completed games
        completed = schedules[schedules["result"].notna()]

        # Calculate records
        records = {}
        for _, game in completed.iterrows():
            home = game["home_team"]
            away = game["away_team"]
            home_score = game.get("home_score", 0)
            away_score = game.get("away_score", 0)

            if home not in records:
                records[home] = {"wins": 0, "losses": 0, "ties": 0, "pf": 0, "pa": 0}
            if away not in records:
                records[away] = {"wins": 0, "losses": 0, "ties": 0, "pf": 0, "pa": 0}

            records[home]["pf"] += home_score
            records[home]["pa"] += away_score
            records[away]["pf"] += away_score
            records[away]["pa"] += home_score

            if home_score > away_score:
                records[home]["wins"] += 1
                records[away]["losses"] += 1
            elif away_score > home_score:
                records[away]["wins"] += 1
                records[home]["losses"] += 1
            else:
                records[home]["ties"] += 1
                records[away]["ties"] += 1

        # Convert to standings list
        standings_list = []
        for team, record in records.items():
            total_games = record["wins"] + record["losses"] + record["ties"]
            win_pct = record["wins"] / total_games if total_games > 0 else 0
            standings_list.append({
                "team": team,
                **record,
                "win_pct": round(win_pct, 3),
                "point_diff": record["pf"] - record["pa"],
            })

        # Sort by win percentage, then point differential
        standings_list.sort(key=lambda x: (-x["win_pct"], -x["point_diff"]))

        return {"overall": standings_list}

    def get_historical_standings(
        self, seasons: List[int]
    ) -> Dict[int, Dict[str, Any]]:
        """
        Get historical standings for multiple seasons.

        Args:
            seasons: List of season years

        Returns:
            Dictionary mapping season -> standings
        """
        historical = {}
        for season in seasons:
            historical[season] = self.get_standings(season)
        return historical

    # =========================================================================
    # SCHEDULES & GAMES
    # =========================================================================

    def get_schedule(
        self,
        season: Optional[int] = None,
        week: Optional[int] = None,
        team: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Get game schedule.

        Args:
            season: Season year
            week: Specific week (optional)
            team: Filter by team (optional)

        Returns:
            DataFrame with schedule data
        """
        if season is None:
            season = self._get_current_season()

        schedule = pd.DataFrame()

        if self.nflreadr_client:
            try:
                schedule = self.nflreadr_client.get_schedules([season])

                if week is not None:
                    schedule = schedule[schedule["week"] == week]

                if team is not None:
                    team = team.upper()
                    schedule = schedule[
                        (schedule["home_team"] == team) | (schedule["away_team"] == team)
                    ]
            except Exception as e:
                logger.warning(f"Could not fetch schedule: {e}")

        return schedule

    def get_game_results(
        self, season: int, team: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get game results for a season.

        Args:
            season: Season year
            team: Filter by team (optional)

        Returns:
            List of game result dictionaries
        """
        schedule = self.get_schedule(season, team=team)

        results = []
        for _, game in schedule.iterrows():
            if pd.notna(game.get("result")):
                results.append({
                    "game_id": game.get("game_id"),
                    "week": game.get("week"),
                    "home_team": game.get("home_team"),
                    "away_team": game.get("away_team"),
                    "home_score": game.get("home_score"),
                    "away_score": game.get("away_score"),
                    "result": game.get("result"),
                    "game_type": game.get("game_type"),
                })

        return results

    # =========================================================================
    # STATISTICS
    # =========================================================================

    def get_team_stats(
        self, team: str, season: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get team statistics for a season.

        Args:
            team: Team abbreviation
            season: Season year

        Returns:
            Team statistics dictionary
        """
        if season is None:
            season = self._get_current_season()

        stats = {"team": team, "season": season}

        # Get game results to calculate basic stats
        results = self.get_game_results(season, team)

        wins = losses = ties = 0
        points_for = points_against = 0

        for game in results:
            is_home = game["home_team"] == team
            team_score = game["home_score"] if is_home else game["away_score"]
            opp_score = game["away_score"] if is_home else game["home_score"]

            points_for += team_score or 0
            points_against += opp_score or 0

            if team_score > opp_score:
                wins += 1
            elif team_score < opp_score:
                losses += 1
            else:
                ties += 1

        stats["record"] = f"{wins}-{losses}" + (f"-{ties}" if ties else "")
        stats["wins"] = wins
        stats["losses"] = losses
        stats["ties"] = ties
        stats["points_for"] = points_for
        stats["points_against"] = points_against
        stats["point_differential"] = points_for - points_against
        stats["games_played"] = wins + losses + ties

        if stats["games_played"] > 0:
            stats["ppg"] = round(points_for / stats["games_played"], 1)
            stats["papg"] = round(points_against / stats["games_played"], 1)

        return stats

    def get_player_stats(
        self,
        seasons: Optional[List[int]] = None,
        stat_type: str = "season",
        position: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Get player statistics.

        Args:
            seasons: List of seasons
            stat_type: 'season' or 'week'
            position: Filter by position

        Returns:
            DataFrame with player statistics
        """
        if seasons is None:
            seasons = [self._get_current_season()]

        stats = pd.DataFrame()

        if self.nflreadr_client:
            try:
                stats = self.nflreadr_client.get_player_stats(seasons, stat_type)

                if position:
                    stats = stats[stats["position"] == position.upper()]
            except Exception as e:
                logger.warning(f"Could not fetch player stats: {e}")

        return stats

    # =========================================================================
    # HISTORICAL DATA
    # =========================================================================

    def get_season_history(self, season: int) -> Dict[str, Any]:
        """
        Get comprehensive data for a historical season.

        Args:
            season: Season year

        Returns:
            Dictionary with season data
        """
        return {
            "season": season,
            "standings": self.get_standings(season),
            "schedule": self.get_schedule(season).to_dict("records"),
            "last_updated": datetime.now().isoformat(),
        }

    def get_draft_history(
        self, seasons: Optional[List[int]] = None
    ) -> pd.DataFrame:
        """
        Get NFL draft history.

        Args:
            seasons: List of draft years

        Returns:
            DataFrame with draft picks
        """
        if seasons is None:
            seasons = list(range(2000, self._get_current_season() + 1))

        if self.nflreadr_client:
            try:
                return self.nflreadr_client.get_draft_picks(seasons)
            except Exception as e:
                logger.warning(f"Could not fetch draft history: {e}")

        return pd.DataFrame()

    def get_super_bowl_history(self) -> List[Dict[str, Any]]:
        """
        Get Super Bowl history.

        Returns:
            List of Super Bowl results
        """
        # This would need to be populated from a data source
        # For now, return a structure that can be filled in
        return [
            # Recent Super Bowls as example
            {"number": "LVIII", "year": 2024, "winner": "KC", "loser": "SF", "score": "25-22"},
            {"number": "LVII", "year": 2023, "winner": "KC", "loser": "PHI", "score": "38-35"},
            {"number": "LVI", "year": 2022, "winner": "LAR", "loser": "CIN", "score": "23-20"},
        ]

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _get_current_season(self) -> int:
        """Get the current NFL season year."""
        today = date.today()
        # NFL season typically starts in September
        if today.month >= 9:
            return today.year
        return today.year - 1

    def normalize_team_abbr(self, abbr: str) -> str:
        """
        Normalize team abbreviation to standard format.

        Handles historical team names and variations.
        """
        abbr = abbr.upper()
        if abbr in HISTORICAL_TEAMS:
            return HISTORICAL_TEAMS[abbr]
        return abbr

    # =========================================================================
    # DATA EXPORT
    # =========================================================================

    def export_to_json(self, data: Any, filename: str):
        """Export data to JSON file in the silo output directory."""
        output_path = OUTPUT_DIR / filename
        with open(output_path, "w") as f:
            if isinstance(data, pd.DataFrame):
                data = data.to_dict("records")
            json.dump(data, f, indent=2, default=str)
        logger.info(f"Exported data to {output_path}")

    def build_full_silo(self, seasons: Optional[List[int]] = None):
        """
        Build the complete NFL data silo.

        Args:
            seasons: List of seasons to include
        """
        if seasons is None:
            current = self._get_current_season()
            seasons = list(range(current - 5, current + 1))

        logger.info(f"Building NFL data silo for seasons: {seasons}")

        # Export teams
        teams = self.get_all_teams()
        self.export_to_json(teams, "teams.json")

        # Export hierarchy
        hierarchy = self.get_league_hierarchy()
        self.export_to_json(hierarchy, "hierarchy.json")

        # Export standings for each season
        for season in seasons:
            standings = self.get_standings(season)
            self.export_to_json(standings, f"standings_{season}.json")

        # Export schedules
        for season in seasons:
            schedule = self.get_schedule(season)
            self.export_to_json(schedule, f"schedule_{season}.json")

        logger.info("NFL data silo build complete!")


# Convenience function
def get_nfl_silo() -> NFLDataSilo:
    """Get a configured NFL data silo instance."""
    return NFLDataSilo()


if __name__ == "__main__":
    print("=== NFL Data Silo Test ===\n")

    silo = NFLDataSilo()

    print("Data sources available:")
    print(f"  - Sportradar: {'Yes' if silo.sportradar_client else 'No (configure API key)'}")
    print(f"  - nflreadr: {'Yes' if silo.nflreadr_client else 'No'}")

    print("\nFetching teams...")
    teams = silo.get_all_teams()
    print(f"Found {len(teams)} teams")

    print("\nSample teams:")
    for team in teams[:5]:
        print(f"  - {team.get('abbr')}: {team.get('full_name')}")

    print("\nLeague hierarchy:")
    hierarchy = silo.get_league_hierarchy()
    for conf in hierarchy.get("conferences", []):
        print(f"  {conf['name']}:")
        for div in conf.get("divisions", []):
            print(f"    {div['name']}: {', '.join(div['teams'])}")

    if silo.nflreadr_client:
        print("\nFetching KC Chiefs stats for 2024...")
        stats = silo.get_team_stats("KC", 2024)
        print(f"  Record: {stats.get('record')}")
        print(f"  Points For: {stats.get('points_for')}")
        print(f"  Points Against: {stats.get('points_against')}")
