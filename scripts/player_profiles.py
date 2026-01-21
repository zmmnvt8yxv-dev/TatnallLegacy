"""
Mega Player Profile Builder

Combines data from multiple sources to create comprehensive player profiles:
- Sportradar NFL API: Real-time data, official stats, detailed profiles
- nflreadr/nflverse: Historical data, advanced metrics, cross-platform IDs

The merged profile includes:
- Biographical information
- Career statistics
- Weekly/seasonal performance
- Fantasy-relevant metrics
- Cross-platform ID mapping

Usage:
    from player_profiles import PlayerProfileBuilder

    builder = PlayerProfileBuilder()
    profile = builder.build_profile(gsis_id="00-0036945")
    profiles = builder.build_all_profiles()
"""

import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
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
OUTPUT_DIR = PROJECT_ROOT / "public" / "data" / "mega_profiles"


class PlayerProfileBuilder:
    """
    Builds comprehensive player profiles by merging data from multiple sources.

    Data sources:
    1. Sportradar NFL API - Official NFL data, real-time updates
    2. nflreadr/nflverse - Historical data, advanced analytics
    3. Existing Sleeper/ESPN data - Fantasy-specific information

    The builder handles:
    - ID matching across platforms (gsis_id, espn_id, sleeper_id, sportradar_id)
    - Field normalization and merging
    - Conflict resolution (preferring more recent/authoritative sources)
    """

    # Field mapping between sources
    FIELD_MAPPING = {
        # nflreadr field -> normalized field
        "display_name": "full_name",
        "first_name": "first_name",
        "last_name": "last_name",
        "position": "position",
        "team_abbr": "team",
        "birth_date": "birth_date",
        "height": "height",
        "weight": "weight",
        "college": "college",
        "entry_year": "rookie_year",
        "years_exp": "experience",
        "status": "status",
        "jersey_number": "jersey_number",
        # ID fields
        "gsis_id": "gsis_id",
        "espn_id": "espn_id",
        "sleeper_id": "sleeper_id",
        "yahoo_id": "yahoo_id",
        "sportradar_id": "sportradar_id",
        "rotowire_id": "rotowire_id",
        "pff_id": "pff_id",
    }

    # Sportradar field mapping
    SPORTRADAR_MAPPING = {
        "name": "full_name",
        "first_name": "first_name",
        "last_name": "last_name",
        "position": "position",
        "birth_date": "birth_date",
        "height": "height_inches",
        "weight": "weight",
        "college": "college",
        "rookie_year": "rookie_year",
        "experience": "experience",
        "jersey": "jersey_number",
        "id": "sportradar_id",
    }

    def __init__(
        self,
        use_sportradar: bool = True,
        use_nflreadr: bool = True,
    ):
        """
        Initialize the profile builder.

        Args:
            use_sportradar: Whether to use Sportradar API
            use_nflreadr: Whether to use nflreadr data
        """
        self.sportradar_client = None
        self.nflreadr_client = None

        # Initialize Sportradar client if available and configured
        if use_sportradar and SPORTRADAR_AVAILABLE:
            try:
                if get_sportradar_nfl_key():
                    self.sportradar_client = SportradarNFLClient()
                    logger.info("Sportradar client initialized")
                else:
                    logger.warning("Sportradar API key not configured")
            except Exception as e:
                logger.warning(f"Could not initialize Sportradar client: {e}")

        # Initialize nflreadr client if available
        if use_nflreadr and NFLREADR_AVAILABLE:
            try:
                self.nflreadr_client = NFLReaderClient()
                logger.info("nflreadr client initialized")
            except Exception as e:
                logger.warning(f"Could not initialize nflreadr client: {e}")

        # Ensure output directory exists
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        # Cache for player data
        self._nflreadr_players = None
        self._sportradar_teams = None

    def _get_nflreadr_players(self) -> Optional[pd.DataFrame]:
        """Get player data from nflreadr (cached)."""
        if self._nflreadr_players is None and self.nflreadr_client:
            self._nflreadr_players = self.nflreadr_client.get_players()
        return self._nflreadr_players

    def _get_sportradar_teams(self) -> Optional[List[Dict]]:
        """Get team data from Sportradar (cached)."""
        if self._sportradar_teams is None and self.sportradar_client:
            self._sportradar_teams = self.sportradar_client.get_all_teams()
        return self._sportradar_teams

    def _normalize_nflreadr_player(self, player: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize nflreadr player data to standard format."""
        normalized = {"source": "nflreadr"}

        for nfl_field, norm_field in self.FIELD_MAPPING.items():
            if nfl_field in player and pd.notna(player[nfl_field]):
                normalized[norm_field] = player[nfl_field]

        # Additional processing
        if "height" in normalized:
            # nflreadr height is in inches
            normalized["height_inches"] = normalized["height"]
            feet = normalized["height"] // 12
            inches = normalized["height"] % 12
            normalized["height_display"] = f"{feet}'{inches}\""

        return normalized

    def _normalize_sportradar_player(self, player: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize Sportradar player data to standard format."""
        normalized = {"source": "sportradar"}

        for sr_field, norm_field in self.SPORTRADAR_MAPPING.items():
            if sr_field in player:
                normalized[norm_field] = player[sr_field]

        # Extract team info
        if "team" in player:
            team = player["team"]
            normalized["team"] = team.get("alias", team.get("abbreviation"))
            normalized["team_name"] = f"{team.get('market', '')} {team.get('name', '')}".strip()
            normalized["team_id"] = team.get("id")

        # Extract draft info
        if "draft" in player:
            draft = player["draft"]
            normalized["draft_year"] = draft.get("year")
            normalized["draft_round"] = draft.get("round")
            normalized["draft_pick"] = draft.get("number")
            normalized["draft_team"] = draft.get("team", {}).get("alias")

        # Extract career stats if available
        if "seasons" in player:
            normalized["career_stats"] = self._extract_career_stats(player["seasons"])

        return normalized

    def _extract_career_stats(self, seasons: List[Dict]) -> Dict[str, Any]:
        """Extract career statistics from Sportradar seasons data."""
        career = {
            "seasons_played": len(seasons),
            "games_played": 0,
            "games_started": 0,
        }

        for season in seasons:
            teams = season.get("teams", [])
            for team in teams:
                stats = team.get("statistics", {})
                career["games_played"] += stats.get("games_played", 0)
                career["games_started"] += stats.get("games_started", 0)

        return career

    def _merge_profiles(
        self,
        nflreadr_data: Optional[Dict[str, Any]],
        sportradar_data: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Merge player data from multiple sources.

        Priority: Sportradar > nflreadr for real-time data
                  nflreadr > Sportradar for cross-platform IDs
        """
        merged = {
            "last_updated": datetime.now().isoformat(),
            "sources": [],
        }

        # Start with nflreadr data (base)
        if nflreadr_data:
            merged.update(nflreadr_data)
            merged["sources"].append("nflreadr")

        # Overlay Sportradar data (more current)
        if sportradar_data:
            # Don't overwrite IDs from nflreadr
            id_fields = {"gsis_id", "espn_id", "sleeper_id", "yahoo_id", "rotowire_id", "pff_id"}
            for key, value in sportradar_data.items():
                if key not in id_fields or key not in merged:
                    merged[key] = value
            merged["sources"].append("sportradar")

        # Clean up
        merged.pop("source", None)

        return merged

    def build_profile(
        self,
        gsis_id: Optional[str] = None,
        espn_id: Optional[str] = None,
        sleeper_id: Optional[str] = None,
        sportradar_id: Optional[str] = None,
        name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Build a comprehensive player profile.

        Provide at least one identifier or name.

        Args:
            gsis_id: NFL GSIS ID
            espn_id: ESPN player ID
            sleeper_id: Sleeper fantasy ID
            sportradar_id: Sportradar player ID
            name: Player name (for fuzzy matching)

        Returns:
            Merged player profile or None if not found
        """
        nflreadr_data = None
        sportradar_data = None

        # Try to find player in nflreadr data
        if self.nflreadr_client:
            players = self._get_nflreadr_players()
            if players is not None:
                player_row = None

                if gsis_id:
                    matches = players[players["gsis_id"] == gsis_id]
                    if len(matches) > 0:
                        player_row = matches.iloc[0]
                elif espn_id:
                    matches = players[players["espn_id"] == str(espn_id)]
                    if len(matches) > 0:
                        player_row = matches.iloc[0]
                elif sleeper_id:
                    matches = players[players["sleeper_id"] == str(sleeper_id)]
                    if len(matches) > 0:
                        player_row = matches.iloc[0]
                elif name:
                    matches = players[
                        players["display_name"].str.lower().str.contains(name.lower(), na=False)
                    ]
                    if len(matches) > 0:
                        player_row = matches.iloc[0]

                if player_row is not None:
                    nflreadr_data = self._normalize_nflreadr_player(player_row.to_dict())
                    # Get sportradar_id from nflreadr if available
                    if not sportradar_id and pd.notna(player_row.get("sportradar_id")):
                        sportradar_id = player_row["sportradar_id"]

        # Try to get Sportradar data if we have an ID
        if self.sportradar_client and sportradar_id:
            try:
                sr_profile = self.sportradar_client.get_player_profile(sportradar_id)
                if sr_profile:
                    sportradar_data = self._normalize_sportradar_player(sr_profile)
            except Exception as e:
                logger.warning(f"Could not fetch Sportradar profile: {e}")

        # Merge data
        if nflreadr_data or sportradar_data:
            return self._merge_profiles(nflreadr_data, sportradar_data)

        return None

    def build_all_profiles(
        self,
        positions: Optional[List[str]] = None,
        active_only: bool = True,
        include_sportradar: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Build profiles for all players.

        Args:
            positions: Filter by positions (e.g., ['QB', 'RB', 'WR'])
            active_only: Only include active players
            include_sportradar: Fetch Sportradar data for each player (slow!)

        Returns:
            List of player profiles
        """
        profiles = []

        if not self.nflreadr_client:
            logger.error("nflreadr client not available")
            return profiles

        players = self._get_nflreadr_players()
        if players is None:
            return profiles

        # Filter by position
        if positions:
            players = players[players["position"].isin(positions)]

        # Filter by status
        if active_only:
            players = players[players["status"] == "ACT"]

        logger.info(f"Building profiles for {len(players)} players...")

        for idx, (_, player) in enumerate(players.iterrows()):
            if idx % 100 == 0:
                logger.info(f"Progress: {idx}/{len(players)}")

            # Build base profile from nflreadr
            profile = self._normalize_nflreadr_player(player.to_dict())

            # Optionally enrich with Sportradar data
            if include_sportradar and self.sportradar_client:
                sr_id = player.get("sportradar_id")
                if pd.notna(sr_id):
                    try:
                        sr_profile = self.sportradar_client.get_player_profile(sr_id)
                        if sr_profile:
                            sr_data = self._normalize_sportradar_player(sr_profile)
                            profile = self._merge_profiles(profile, sr_data)
                    except Exception as e:
                        logger.debug(f"Could not fetch Sportradar profile: {e}")

            profiles.append(profile)

        return profiles

    def save_profiles(
        self, profiles: List[Dict[str, Any]], filename: str = "all_profiles.json"
    ):
        """Save profiles to JSON file."""
        output_path = OUTPUT_DIR / filename
        with open(output_path, "w") as f:
            json.dump(profiles, f, indent=2, default=str)
        logger.info(f"Saved {len(profiles)} profiles to {output_path}")

    def get_id_mapping_table(self) -> pd.DataFrame:
        """
        Get a comprehensive ID mapping table.

        Returns DataFrame with columns:
        - gsis_id, espn_id, sleeper_id, yahoo_id, sportradar_id
        - display_name, position, team
        """
        if not self.nflreadr_client:
            return pd.DataFrame()

        players = self._get_nflreadr_players()
        if players is None:
            return pd.DataFrame()

        id_columns = [
            "display_name",
            "position",
            "team_abbr",
            "gsis_id",
            "espn_id",
            "sleeper_id",
            "yahoo_id",
            "sportradar_id",
            "rotowire_id",
            "pff_id",
        ]

        # Only include columns that exist
        available_cols = [c for c in id_columns if c in players.columns]
        return players[available_cols].copy()


# Convenience functions
def get_profile_builder() -> PlayerProfileBuilder:
    """Get a configured profile builder instance."""
    return PlayerProfileBuilder()


def build_player_profile(**kwargs) -> Optional[Dict[str, Any]]:
    """Quick function to build a single player profile."""
    builder = PlayerProfileBuilder()
    return builder.build_profile(**kwargs)


if __name__ == "__main__":
    print("=== Player Profile Builder Test ===\n")

    builder = PlayerProfileBuilder()

    print("Data sources available:")
    print(f"  - Sportradar: {'Yes' if builder.sportradar_client else 'No (configure API key)'}")
    print(f"  - nflreadr: {'Yes' if builder.nflreadr_client else 'No'}")

    if builder.nflreadr_client:
        print("\nBuilding sample profile for Patrick Mahomes...")
        profile = builder.build_profile(name="Patrick Mahomes")
        if profile:
            print(f"\nProfile for {profile.get('full_name')}:")
            print(f"  Position: {profile.get('position')}")
            print(f"  Team: {profile.get('team')}")
            print(f"  Experience: {profile.get('experience')} years")
            print(f"  College: {profile.get('college')}")
            print(f"\n  IDs:")
            print(f"    GSIS: {profile.get('gsis_id')}")
            print(f"    ESPN: {profile.get('espn_id')}")
            print(f"    Sleeper: {profile.get('sleeper_id')}")
            print(f"    Sportradar: {profile.get('sportradar_id')}")
            print(f"\n  Sources: {profile.get('sources')}")

        print("\nGetting ID mapping table...")
        id_table = builder.get_id_mapping_table()
        print(f"Found {len(id_table)} players with ID mappings")
