"""
Sportradar NFL API Client

Provides access to NFL data including:
- Player profiles and statistics
- Team rosters and profiles
- League standings
- Game schedules and statistics
- Historical data

Documentation: https://developer.sportradar.com/football/docs/nfl-ig-api-basics

Usage:
    from sportradar_nfl import SportradarNFLClient

    client = SportradarNFLClient()
    player = client.get_player_profile("11cad59d-90dd-449c-a839-dddaba4fe16c")
    standings = client.get_standings(2024, "REG")
"""

import os
import time
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, date
from functools import lru_cache

import requests

from config import get_sportradar_nfl_key, get_sportradar_nfl_config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Project paths
PROJECT_ROOT = Path(__file__).parent.parent
CACHE_DIR = PROJECT_ROOT / "data_raw" / "sportradar_cache"


class SportradarNFLClient:
    """
    Client for the Sportradar NFL Official API (v7).

    Handles authentication, rate limiting, caching, and provides
    convenient methods for all major NFL data endpoints.
    """

    # API Configuration
    BASE_URL = "https://api.sportradar.com/nfl/official"
    VERSION = "v7"
    LANGUAGE = "en"
    FORMAT = "json"

    # Rate limiting (trial tier)
    RATE_LIMIT_CALLS = 1  # calls per second for trial
    RATE_LIMIT_WINDOW = 1.0  # seconds

    # Season types
    SEASON_TYPES = {
        "PRE": "Preseason",
        "REG": "Regular Season",
        "PST": "Postseason",
    }

    def __init__(self, api_key: Optional[str] = None, access_level: str = "trial"):
        """
        Initialize the Sportradar NFL client.

        Args:
            api_key: API key (if not provided, loads from config)
            access_level: API access level ('trial' or 'production')
        """
        self.api_key = api_key or get_sportradar_nfl_key()
        if not self.api_key:
            raise ValueError(
                "Sportradar NFL API key not configured. "
                "Set SPORTRADAR_NFL_API_KEY in .env.local or config/api_keys.json"
            )

        config = get_sportradar_nfl_config()
        self.access_level = access_level or config.get("access_level", "trial")
        self._last_request_time = 0

        # Ensure cache directory exists
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _build_url(self, endpoint: str) -> str:
        """Build the full API URL for an endpoint."""
        return f"{self.BASE_URL}/{self.access_level}/{self.VERSION}/{self.LANGUAGE}/{endpoint}.{self.FORMAT}"

    def _rate_limit(self):
        """Enforce rate limiting between API calls."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.RATE_LIMIT_WINDOW:
            sleep_time = self.RATE_LIMIT_WINDOW - elapsed
            logger.debug(f"Rate limiting: sleeping {sleep_time:.2f}s")
            time.sleep(sleep_time)
        self._last_request_time = time.time()

    def _make_request(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        cache_key: Optional[str] = None,
        cache_hours: int = 24,
    ) -> Dict[str, Any]:
        """
        Make an API request with rate limiting and optional caching.

        Args:
            endpoint: API endpoint path
            params: Query parameters
            cache_key: Key for caching (if None, no caching)
            cache_hours: Hours to cache the response

        Returns:
            JSON response as dictionary
        """
        # Check cache first
        if cache_key:
            cached = self._get_cached(cache_key, cache_hours)
            if cached is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached

        # Rate limit
        self._rate_limit()

        # Build request
        url = self._build_url(endpoint)
        request_params = {"api_key": self.api_key}
        if params:
            request_params.update(params)

        # Make request
        logger.info(f"API Request: {endpoint}")
        try:
            response = requests.get(url, params=request_params, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Cache the response
            if cache_key:
                self._set_cached(cache_key, data)

            return data

        except requests.exceptions.HTTPError as e:
            if response.status_code == 403:
                logger.error("API key invalid or access denied")
            elif response.status_code == 429:
                logger.error("Rate limit exceeded")
            raise
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed: {e}")
            raise

    def _get_cached(self, cache_key: str, max_age_hours: int) -> Optional[Dict]:
        """Get cached response if valid."""
        cache_file = CACHE_DIR / f"{cache_key}.json"
        if cache_file.exists():
            age_hours = (time.time() - cache_file.stat().st_mtime) / 3600
            if age_hours < max_age_hours:
                with open(cache_file, "r") as f:
                    return json.load(f)
        return None

    def _set_cached(self, cache_key: str, data: Dict):
        """Cache a response."""
        cache_file = CACHE_DIR / f"{cache_key}.json"
        with open(cache_file, "w") as f:
            json.dump(data, f, indent=2)

    # =========================================================================
    # PLAYER ENDPOINTS
    # =========================================================================

    def get_player_profile(self, player_id: str) -> Dict[str, Any]:
        """
        Get detailed player profile including bio and career stats.

        Args:
            player_id: Sportradar player UUID

        Returns:
            Player profile with biographical info, draft info, and stats
        """
        return self._make_request(
            f"players/{player_id}/profile",
            cache_key=f"player_profile_{player_id}",
            cache_hours=24,
        )

    def search_players(self, name: str) -> List[Dict[str, Any]]:
        """
        Search for players by name.

        Note: This uses the roster search approach since direct search
        may not be available in all tiers.

        Args:
            name: Player name to search for

        Returns:
            List of matching players
        """
        # This would need to search through team rosters
        # For now, return empty - implement based on your needs
        logger.warning("Player search not directly available - use team rosters")
        return []

    # =========================================================================
    # TEAM ENDPOINTS
    # =========================================================================

    def get_league_hierarchy(self) -> Dict[str, Any]:
        """
        Get the full NFL league hierarchy.

        Returns:
            League structure with conferences, divisions, and teams
        """
        return self._make_request(
            "league/hierarchy",
            cache_key="league_hierarchy",
            cache_hours=168,  # 1 week - doesn't change often
        )

    def get_team_profile(self, team_id: str) -> Dict[str, Any]:
        """
        Get team profile with detailed information.

        Args:
            team_id: Sportradar team UUID

        Returns:
            Team profile with venue, coaches, and historical info
        """
        return self._make_request(
            f"teams/{team_id}/profile",
            cache_key=f"team_profile_{team_id}",
            cache_hours=24,
        )

    def get_team_roster(self, team_id: str) -> Dict[str, Any]:
        """
        Get full team roster with all players.

        Args:
            team_id: Sportradar team UUID

        Returns:
            Full roster with player details
        """
        return self._make_request(
            f"teams/{team_id}/full_roster",
            cache_key=f"team_roster_{team_id}",
            cache_hours=12,
        )

    def get_all_teams(self) -> List[Dict[str, Any]]:
        """
        Get all NFL teams from league hierarchy.

        Returns:
            List of all NFL teams
        """
        hierarchy = self.get_league_hierarchy()
        teams = []
        for conference in hierarchy.get("conferences", []):
            for division in conference.get("divisions", []):
                teams.extend(division.get("teams", []))
        return teams

    # =========================================================================
    # STANDINGS ENDPOINTS
    # =========================================================================

    def get_standings(
        self, year: int, season_type: str = "REG"
    ) -> Dict[str, Any]:
        """
        Get league standings for a season.

        Args:
            year: Season year (e.g., 2024)
            season_type: 'PRE', 'REG', or 'PST'

        Returns:
            Standings with records, rankings, and stats
        """
        return self._make_request(
            f"seasons/{year}/{season_type}/standings",
            cache_key=f"standings_{year}_{season_type}",
            cache_hours=1,  # Standings change frequently during season
        )

    # =========================================================================
    # SCHEDULE ENDPOINTS
    # =========================================================================

    def get_season_schedule(
        self, year: int, season_type: str = "REG"
    ) -> Dict[str, Any]:
        """
        Get the full season schedule.

        Args:
            year: Season year
            season_type: 'PRE', 'REG', or 'PST'

        Returns:
            Full schedule with all games
        """
        return self._make_request(
            f"games/{year}/{season_type}/schedule",
            cache_key=f"schedule_{year}_{season_type}",
            cache_hours=24,
        )

    def get_weekly_schedule(
        self, year: int, season_type: str, week: int
    ) -> Dict[str, Any]:
        """
        Get schedule for a specific week.

        Args:
            year: Season year
            season_type: 'PRE', 'REG', or 'PST'
            week: Week number

        Returns:
            Week schedule with all games
        """
        return self._make_request(
            f"games/{year}/{season_type}/{week}/schedule",
            cache_key=f"schedule_{year}_{season_type}_week{week}",
            cache_hours=1,
        )

    # =========================================================================
    # GAME ENDPOINTS
    # =========================================================================

    def get_game_statistics(self, game_id: str) -> Dict[str, Any]:
        """
        Get detailed statistics for a game.

        Args:
            game_id: Sportradar game UUID

        Returns:
            Game statistics for both teams and all players
        """
        return self._make_request(
            f"games/{game_id}/statistics",
            cache_key=f"game_stats_{game_id}",
            cache_hours=24,  # Historical games don't change
        )

    def get_game_boxscore(self, game_id: str) -> Dict[str, Any]:
        """
        Get boxscore for a game.

        Args:
            game_id: Sportradar game UUID

        Returns:
            Game boxscore with scoring summary
        """
        return self._make_request(
            f"games/{game_id}/boxscore",
            cache_key=f"game_boxscore_{game_id}",
            cache_hours=24,
        )

    # =========================================================================
    # STATISTICS ENDPOINTS
    # =========================================================================

    def get_seasonal_statistics(
        self, year: int, season_type: str, team_id: str
    ) -> Dict[str, Any]:
        """
        Get seasonal statistics for a team.

        Args:
            year: Season year
            season_type: 'PRE', 'REG', or 'PST'
            team_id: Sportradar team UUID

        Returns:
            Team's seasonal statistics
        """
        return self._make_request(
            f"seasons/{year}/{season_type}/teams/{team_id}/statistics",
            cache_key=f"team_stats_{team_id}_{year}_{season_type}",
            cache_hours=12,
        )

    # =========================================================================
    # CHANGE LOG ENDPOINTS
    # =========================================================================

    def get_daily_change_log(self, change_date: date) -> Dict[str, Any]:
        """
        Get changes for a specific date.

        Args:
            change_date: Date to check for changes

        Returns:
            List of changed entities (players, teams, games, standings)
        """
        date_str = change_date.strftime("%Y/%m/%d")
        return self._make_request(
            f"league/{date_str}/changes",
            cache_key=f"changelog_{change_date.isoformat()}",
            cache_hours=1,
        )

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def get_current_season(self) -> int:
        """Get the current NFL season year."""
        today = date.today()
        # NFL season typically starts in September
        if today.month >= 9:
            return today.year
        return today.year - 1

    def get_current_week(self) -> Optional[int]:
        """
        Attempt to determine the current NFL week.
        Returns None if unable to determine.
        """
        # This would need the schedule to determine accurately
        return None


# Convenience function for quick access
def get_nfl_client() -> SportradarNFLClient:
    """Get a configured NFL client instance."""
    return SportradarNFLClient()


if __name__ == "__main__":
    # Test the client
    print("=== Sportradar NFL Client Test ===\n")

    try:
        client = SportradarNFLClient()
        print("Client initialized successfully!")

        # Test league hierarchy
        print("\nFetching league hierarchy...")
        hierarchy = client.get_league_hierarchy()
        print(f"Found {len(hierarchy.get('conferences', []))} conferences")

        # List all teams
        teams = client.get_all_teams()
        print(f"Found {len(teams)} teams")
        for team in teams[:5]:
            print(f"  - {team.get('market')} {team.get('name')}")

    except ValueError as e:
        print(f"Configuration error: {e}")
    except Exception as e:
        print(f"Error: {e}")
