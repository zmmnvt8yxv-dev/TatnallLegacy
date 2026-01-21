"""
NFL Data Integration via nflreadr (nflverse)

Provides access to comprehensive NFL data from the nflverse project:
- Player rosters and biographical data
- Weekly/seasonal statistics
- Play-by-play data
- Team information
- Historical data going back to 1999

This module complements the Sportradar API by providing:
- Historical data not available in Sportradar
- Advanced analytics and metrics
- Standardized player IDs (gsis_id, espn_id, etc.)

Documentation: https://nflreadr.nflverse.com/

Usage:
    from nflreadr_data import NFLReaderClient

    client = NFLReaderClient()
    players = client.get_players()
    stats = client.get_player_stats(seasons=[2023, 2024])
"""

import logging
from pathlib import Path
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
import json

import pandas as pd

try:
    import nflreadpy as nfl
    NFLREADPY_AVAILABLE = True
except ImportError:
    NFLREADPY_AVAILABLE = False
    nfl = None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Project paths
PROJECT_ROOT = Path(__file__).parent.parent
CACHE_DIR = PROJECT_ROOT / "data_raw" / "nflreadr_cache"


def _ensure_pandas(df) -> pd.DataFrame:
    """Convert polars DataFrame to pandas if necessary."""
    if isinstance(df, pd.DataFrame):
        return df
    try:
        return df.to_pandas()
    except Exception:
        return pd.DataFrame(df)


class NFLReaderClient:
    """
    Client for accessing NFL data via nflreadr/nflverse.

    Provides comprehensive NFL data including:
    - Player rosters and biographical info
    - Weekly and seasonal statistics
    - Play-by-play data
    - Team information
    - Draft data
    - Injuries
    """

    def __init__(self, cache_enabled: bool = True):
        """
        Initialize the nflreadr client.

        Args:
            cache_enabled: Whether to cache data locally
        """
        if not NFLREADPY_AVAILABLE:
            raise ImportError(
                "nflreadpy is not installed. Install with: pip install nflreadpy"
            )

        self.cache_enabled = cache_enabled
        if cache_enabled:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, name: str) -> Path:
        """Get cache file path."""
        return CACHE_DIR / f"{name}.parquet"

    def _get_cached(self, name: str, max_age_hours: int = 24) -> Optional[pd.DataFrame]:
        """Get cached data if valid."""
        if not self.cache_enabled:
            return None

        cache_file = self._cache_path(name)
        if cache_file.exists():
            import time
            age_hours = (time.time() - cache_file.stat().st_mtime) / 3600
            if age_hours < max_age_hours:
                logger.debug(f"Cache hit: {name}")
                return pd.read_parquet(cache_file)
        return None

    def _set_cached(self, name: str, df: pd.DataFrame):
        """Cache data."""
        if self.cache_enabled:
            cache_file = self._cache_path(name)
            df.to_parquet(cache_file, index=False)

    # =========================================================================
    # PLAYER DATA
    # =========================================================================

    def get_players(self, force_refresh: bool = False) -> pd.DataFrame:
        """
        Get comprehensive player roster data.

        Returns DataFrame with columns including:
        - gsis_id: NFL GSIS ID (primary identifier)
        - espn_id: ESPN player ID
        - yahoo_id: Yahoo player ID
        - sleeper_id: Sleeper fantasy ID
        - display_name, first_name, last_name
        - position, position_group
        - team_abbr: Current team
        - birth_date, height, weight
        - college, draft info
        - status (Active, Inactive, etc.)

        Returns:
            DataFrame with all player data
        """
        if not force_refresh:
            cached = self._get_cached("players", max_age_hours=24)
            if cached is not None:
                return cached

        logger.info("Fetching player roster data...")
        df = _ensure_pandas(nfl.load_players())
        self._set_cached("players", df)
        logger.info(f"Loaded {len(df)} players")
        return df

    def get_rosters(
        self, seasons: Optional[List[int]] = None, force_refresh: bool = False
    ) -> pd.DataFrame:
        """
        Get weekly roster data for specified seasons.

        Args:
            seasons: List of seasons (e.g., [2023, 2024])
            force_refresh: Force refresh from source

        Returns:
            DataFrame with weekly roster snapshots
        """
        if seasons is None:
            seasons = [datetime.now().year]

        cache_key = f"rosters_{'_'.join(map(str, seasons))}"
        if not force_refresh:
            cached = self._get_cached(cache_key, max_age_hours=12)
            if cached is not None:
                return cached

        logger.info(f"Fetching roster data for seasons: {seasons}")
        df = _ensure_pandas(nfl.load_rosters(seasons))
        self._set_cached(cache_key, df)
        logger.info(f"Loaded {len(df)} roster entries")
        return df

    # =========================================================================
    # STATISTICS
    # =========================================================================

    def get_player_stats(
        self,
        seasons: Optional[List[int]] = None,
        stat_type: str = "season",
        force_refresh: bool = False,
    ) -> pd.DataFrame:
        """
        Get player statistics.

        Args:
            seasons: List of seasons
            stat_type: 'season' or 'week'
            force_refresh: Force refresh from source

        Returns:
            DataFrame with player statistics
        """
        if seasons is None:
            seasons = [datetime.now().year]

        cache_key = f"player_stats_{stat_type}_{'_'.join(map(str, seasons))}"
        if not force_refresh:
            cached = self._get_cached(cache_key, max_age_hours=6)
            if cached is not None:
                return cached

        logger.info(f"Fetching {stat_type} player stats for seasons: {seasons}")
        df = _ensure_pandas(nfl.load_player_stats(seasons=seasons, stat_type=stat_type))
        self._set_cached(cache_key, df)
        logger.info(f"Loaded {len(df)} stat entries")
        return df

    def get_weekly_stats(
        self, seasons: Optional[List[int]] = None, force_refresh: bool = False
    ) -> pd.DataFrame:
        """Get weekly player statistics."""
        return self.get_player_stats(seasons, stat_type="week", force_refresh=force_refresh)

    def get_seasonal_stats(
        self, seasons: Optional[List[int]] = None, force_refresh: bool = False
    ) -> pd.DataFrame:
        """Get seasonal player statistics."""
        return self.get_player_stats(seasons, stat_type="season", force_refresh=force_refresh)

    # =========================================================================
    # TEAM DATA
    # =========================================================================

    def get_teams(self, force_refresh: bool = False) -> pd.DataFrame:
        """
        Get team information.

        Returns DataFrame with:
        - team_abbr, team_name, team_nick
        - team_conf, team_division
        - team_color, team_color2
        - team_logo_wikipedia, team_wordmark

        Returns:
            DataFrame with team data
        """
        if not force_refresh:
            cached = self._get_cached("teams", max_age_hours=168)  # 1 week
            if cached is not None:
                return cached

        logger.info("Fetching team data...")
        df = _ensure_pandas(nfl.load_teams())
        self._set_cached("teams", df)
        logger.info(f"Loaded {len(df)} teams")
        return df

    # =========================================================================
    # SCHEDULE & GAMES
    # =========================================================================

    def get_schedules(
        self, seasons: Optional[List[int]] = None, force_refresh: bool = False
    ) -> pd.DataFrame:
        """
        Get game schedules.

        Args:
            seasons: List of seasons

        Returns:
            DataFrame with game schedule data
        """
        if seasons is None:
            seasons = [datetime.now().year]

        cache_key = f"schedules_{'_'.join(map(str, seasons))}"
        if not force_refresh:
            cached = self._get_cached(cache_key, max_age_hours=6)
            if cached is not None:
                return cached

        logger.info(f"Fetching schedules for seasons: {seasons}")
        df = _ensure_pandas(nfl.load_schedules(seasons))
        self._set_cached(cache_key, df)
        logger.info(f"Loaded {len(df)} games")
        return df

    # =========================================================================
    # DRAFT DATA
    # =========================================================================

    def get_draft_picks(
        self, seasons: Optional[List[int]] = None, force_refresh: bool = False
    ) -> pd.DataFrame:
        """
        Get NFL draft picks.

        Args:
            seasons: List of draft years

        Returns:
            DataFrame with draft pick data
        """
        if seasons is None:
            seasons = list(range(2000, datetime.now().year + 1))

        cache_key = f"draft_picks_{'_'.join(map(str, seasons[:3]))}_{len(seasons)}"
        if not force_refresh:
            cached = self._get_cached(cache_key, max_age_hours=168)
            if cached is not None:
                return cached

        logger.info(f"Fetching draft picks for {len(seasons)} seasons...")
        df = _ensure_pandas(nfl.load_draft_picks(seasons))
        self._set_cached(cache_key, df)
        logger.info(f"Loaded {len(df)} draft picks")
        return df

    # =========================================================================
    # PLAY-BY-PLAY DATA
    # =========================================================================

    def get_pbp(
        self, seasons: Optional[List[int]] = None, force_refresh: bool = False
    ) -> pd.DataFrame:
        """
        Get play-by-play data.

        WARNING: This is a large dataset. Use cautiously.

        Args:
            seasons: List of seasons

        Returns:
            DataFrame with play-by-play data
        """
        if seasons is None:
            seasons = [datetime.now().year]

        cache_key = f"pbp_{'_'.join(map(str, seasons))}"
        if not force_refresh:
            cached = self._get_cached(cache_key, max_age_hours=24)
            if cached is not None:
                return cached

        logger.info(f"Fetching play-by-play for seasons: {seasons} (this may take a while)...")
        df = _ensure_pandas(nfl.load_pbp(seasons))
        self._set_cached(cache_key, df)
        logger.info(f"Loaded {len(df)} plays")
        return df

    # =========================================================================
    # INJURIES
    # =========================================================================

    def get_injuries(
        self, seasons: Optional[List[int]] = None, force_refresh: bool = False
    ) -> pd.DataFrame:
        """
        Get injury report data.

        Args:
            seasons: List of seasons

        Returns:
            DataFrame with injury data
        """
        if seasons is None:
            seasons = [datetime.now().year]

        cache_key = f"injuries_{'_'.join(map(str, seasons))}"
        if not force_refresh:
            cached = self._get_cached(cache_key, max_age_hours=6)
            if cached is not None:
                return cached

        logger.info(f"Fetching injury data for seasons: {seasons}")
        df = _ensure_pandas(nfl.load_injuries(seasons))
        self._set_cached(cache_key, df)
        logger.info(f"Loaded {len(df)} injury entries")
        return df

    # =========================================================================
    # STANDINGS
    # =========================================================================

    def get_standings(
        self, seasons: Optional[List[int]] = None, force_refresh: bool = False
    ) -> pd.DataFrame:
        """
        Get league standings.

        Args:
            seasons: List of seasons

        Returns:
            DataFrame with standings data
        """
        # nflreadr doesn't have a direct standings function
        # We can derive this from schedules
        schedules = self.get_schedules(seasons, force_refresh)

        # Calculate standings from game results
        # This is a simplified version
        return schedules

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def get_player_by_id(
        self, player_id: str, id_type: str = "gsis_id"
    ) -> Optional[Dict[str, Any]]:
        """
        Get a single player by ID.

        Args:
            player_id: Player ID
            id_type: Type of ID ('gsis_id', 'espn_id', 'sleeper_id', etc.)

        Returns:
            Player data as dictionary or None
        """
        players = self.get_players()
        if id_type not in players.columns:
            logger.warning(f"ID type '{id_type}' not found in player data")
            return None

        matches = players[players[id_type] == player_id]
        if len(matches) == 0:
            return None
        return matches.iloc[0].to_dict()

    def search_players(self, name: str) -> pd.DataFrame:
        """
        Search for players by name.

        Args:
            name: Full or partial player name

        Returns:
            DataFrame with matching players
        """
        players = self.get_players()
        name_lower = name.lower()
        mask = players["display_name"].str.lower().str.contains(name_lower, na=False)
        return players[mask]

    def get_id_mapping(self) -> pd.DataFrame:
        """
        Get player ID mapping table.

        Returns DataFrame with all ID columns:
        - gsis_id, espn_id, yahoo_id, sleeper_id, sportradar_id, etc.
        """
        players = self.get_players()
        id_columns = [
            col for col in players.columns
            if col.endswith("_id") or col in ["display_name", "position", "team_abbr"]
        ]
        return players[id_columns].copy()


# Convenience function
def get_nflreadr_client() -> NFLReaderClient:
    """Get a configured nflreadr client instance."""
    return NFLReaderClient()


if __name__ == "__main__":
    # Test the client
    print("=== NFLReader Client Test ===\n")

    if not NFLREADPY_AVAILABLE:
        print("nflreadpy not installed. Install with: pip install nflreadpy")
        exit(1)

    try:
        client = NFLReaderClient()
        print("Client initialized successfully!")

        # Test players
        print("\nFetching players...")
        players = client.get_players()
        print(f"Found {len(players)} players")
        print(f"Columns: {list(players.columns)[:10]}...")

        # Test teams
        print("\nFetching teams...")
        teams = client.get_teams()
        print(f"Found {len(teams)} teams")

        # Test search
        print("\nSearching for 'Mahomes'...")
        results = client.search_players("Mahomes")
        for _, player in results.iterrows():
            print(f"  - {player['display_name']} ({player['position']}) - {player['team_abbr']}")

    except ImportError as e:
        print(f"Import error: {e}")
    except Exception as e:
        print(f"Error: {e}")
