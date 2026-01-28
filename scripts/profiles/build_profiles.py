#!/usr/bin/env python3
"""
Advanced Player Profile Builder

Builds rich biographical data for players:
- Draft position and combine metrics
- Contract status (if available)
- Career timeline (teams, positions)
- Photo URLs and social links

Data Sources:
- NFLverse player data (primary)
- ESPN athlete profiles
- Sleeper player metadata

Usage:
    # Build all profiles
    python build_profiles.py --all

    # Build for specific player
    python build_profiles.py --player-uid abc-123-uuid

    # Export profiles to JSON
    python build_profiles.py --export profiles.json

    # Update from NFLverse
    python build_profiles.py --update-from-nflverse
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
PLAYERS_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"
DATA_RAW_PATH = PROJECT_ROOT / "data_raw"
PUBLIC_DATA_PATH = PROJECT_ROOT / "public" / "data"


@dataclass
class DraftInfo:
    """Draft information for a player."""
    year: Optional[int] = None
    round: Optional[int] = None
    pick: Optional[int] = None
    overall_pick: Optional[int] = None
    team: Optional[str] = None


@dataclass
class CombineMetrics:
    """NFL Combine metrics for a player."""
    height: Optional[str] = None  # e.g., "6-2"
    weight: Optional[int] = None  # lbs
    forty_yard: Optional[float] = None  # seconds
    bench_press: Optional[int] = None  # reps
    vertical_jump: Optional[float] = None  # inches
    broad_jump: Optional[int] = None  # inches
    three_cone: Optional[float] = None  # seconds
    shuttle: Optional[float] = None  # seconds
    arm_length: Optional[float] = None  # inches
    hand_size: Optional[float] = None  # inches


@dataclass
class CareerEntry:
    """A single entry in a player's career timeline."""
    season: int
    team: str
    position: Optional[str] = None
    games_played: int = 0
    games_started: int = 0
    status: Optional[str] = None  # active, injured, practice_squad, etc.


@dataclass
class SocialLinks:
    """Social media and external links for a player."""
    twitter: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    website: Optional[str] = None
    nfl_profile: Optional[str] = None
    espn_profile: Optional[str] = None
    pfr_profile: Optional[str] = None


@dataclass
class PlayerProfile:
    """Complete player profile with biographical data."""
    player_uid: str
    canonical_name: str

    # Basic info
    position: Optional[str] = None
    birth_date: Optional[str] = None
    age: Optional[int] = None
    college: Optional[str] = None
    hometown: Optional[str] = None

    # Physical attributes
    height: Optional[str] = None
    height_inches: Optional[int] = None
    weight: Optional[int] = None

    # Current status
    current_team: Optional[str] = None
    jersey_number: Optional[int] = None
    status: Optional[str] = None  # active, retired, free_agent, etc.
    years_experience: Optional[int] = None

    # Draft info
    draft: Optional[DraftInfo] = None

    # Combine metrics
    combine: Optional[CombineMetrics] = None

    # Career timeline
    career_timeline: List[CareerEntry] = field(default_factory=list)

    # Media
    photo_url: Optional[str] = None
    headshot_url: Optional[str] = None

    # Social links
    social: Optional[SocialLinks] = None

    # External IDs for linking
    external_ids: Dict[str, str] = field(default_factory=dict)

    # Metadata
    last_updated: Optional[str] = None
    sources: List[str] = field(default_factory=list)


@dataclass
class BuildResult:
    """Result of a profile build operation."""
    profiles_built: int = 0
    profiles_updated: int = 0
    profiles_skipped: int = 0
    errors: List[str] = field(default_factory=list)


class ProfileBuilder:
    """
    Builds comprehensive player profiles from multiple data sources.

    Aggregates data from:
    - NFLverse players dataset
    - ESPN athlete profiles
    - Sleeper player metadata
    - Local database records
    """

    def __init__(
        self,
        db_path: Path = PLAYERS_DB_PATH,
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
                raise FileNotFoundError(f"Players database not found: {self.db_path}")
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

    def _ensure_profiles_table(self) -> None:
        """Ensure the profiles table exists."""
        conn = self._get_connection()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS player_profiles (
                player_uid TEXT PRIMARY KEY,

                -- Draft info
                draft_year INTEGER,
                draft_round INTEGER,
                draft_pick INTEGER,
                draft_overall INTEGER,
                draft_team TEXT,

                -- Combine metrics
                combine_forty REAL,
                combine_bench INTEGER,
                combine_vertical REAL,
                combine_broad INTEGER,
                combine_three_cone REAL,
                combine_shuttle REAL,
                combine_arm_length REAL,
                combine_hand_size REAL,

                -- Career info
                rookie_year INTEGER,
                years_experience INTEGER,
                career_teams TEXT,  -- JSON array

                -- Media
                photo_url TEXT,
                headshot_url TEXT,

                -- Social
                twitter TEXT,
                instagram TEXT,

                -- Full profile JSON
                profile_json TEXT,

                -- Metadata
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),

                FOREIGN KEY (player_uid) REFERENCES players(player_uid)
            )
        """)
        conn.commit()

    def _load_nflverse_players(self) -> pd.DataFrame:
        """Load player data from NFLverse."""
        cache_path = self.data_path / "nflverse_players.parquet"

        if self.use_cache and cache_path.exists():
            logger.info(f"Loading from cache: {cache_path}")
            return pd.read_parquet(cache_path)

        # Try CSV fallback
        csv_path = self.data_path / "nflverse_players.csv"
        if csv_path.exists():
            return pd.read_csv(csv_path)

        # Try to download
        try:
            url = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
            logger.info(f"Downloading from {url}")
            df = pd.read_csv(url)

            # Cache as parquet
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(cache_path, index=False)

            return df

        except Exception as e:
            logger.warning(f"Failed to download NFLverse players: {e}")
            return pd.DataFrame()

    def _parse_nflverse_player(self, row: pd.Series) -> Dict[str, Any]:
        """Parse NFLverse player row into profile data."""
        data = {}

        # Basic info
        if "display_name" in row and pd.notna(row["display_name"]):
            data["name"] = str(row["display_name"])
        elif "full_name" in row and pd.notna(row["full_name"]):
            data["name"] = str(row["full_name"])

        if "position" in row and pd.notna(row["position"]):
            data["position"] = str(row["position"])

        if "birth_date" in row and pd.notna(row["birth_date"]):
            data["birth_date"] = str(row["birth_date"])[:10]

        if "college" in row and pd.notna(row["college"]):
            data["college"] = str(row["college"])

        # Physical
        if "height" in row and pd.notna(row["height"]):
            data["height"] = str(row["height"])
        if "weight" in row and pd.notna(row["weight"]):
            try:
                data["weight"] = int(row["weight"])
            except (ValueError, TypeError):
                pass

        # Current team/status
        if "team" in row and pd.notna(row["team"]):
            data["current_team"] = str(row["team"])
        if "status" in row and pd.notna(row["status"]):
            data["status"] = str(row["status"])
        if "jersey_number" in row and pd.notna(row["jersey_number"]):
            try:
                data["jersey_number"] = int(row["jersey_number"])
            except (ValueError, TypeError):
                pass
        if "years_exp" in row and pd.notna(row["years_exp"]):
            try:
                data["years_experience"] = int(row["years_exp"])
            except (ValueError, TypeError):
                pass

        # Draft info
        draft = {}
        if "draft_year" in row and pd.notna(row["draft_year"]):
            try:
                draft["year"] = int(row["draft_year"])
            except (ValueError, TypeError):
                pass
        if "draft_round" in row and pd.notna(row["draft_round"]):
            try:
                draft["round"] = int(row["draft_round"])
            except (ValueError, TypeError):
                pass
        if "draft_pick" in row and pd.notna(row["draft_pick"]):
            try:
                draft["pick"] = int(row["draft_pick"])
            except (ValueError, TypeError):
                pass
        if "draft_number" in row and pd.notna(row["draft_number"]):
            try:
                draft["overall_pick"] = int(row["draft_number"])
            except (ValueError, TypeError):
                pass
        if "draft_club" in row and pd.notna(row["draft_club"]):
            draft["team"] = str(row["draft_club"])

        if draft:
            data["draft"] = draft

        # External IDs
        external_ids = {}
        id_fields = [
            ("gsis_id", "gsis"),
            ("espn_id", "espn"),
            ("sportradar_id", "sportradar"),
            ("yahoo_id", "yahoo"),
            ("rotowire_id", "rotowire"),
            ("pff_id", "pff"),
            ("pfr_id", "pfr"),
            ("fantasy_data_id", "fantasy_data"),
            ("sleeper_id", "sleeper"),
        ]
        for col, source in id_fields:
            if col in row and pd.notna(row[col]):
                external_ids[source] = str(row[col])

        if external_ids:
            data["external_ids"] = external_ids

        # Photo URLs
        if "headshot_url" in row and pd.notna(row["headshot_url"]):
            data["headshot_url"] = str(row["headshot_url"])
        if "ngs_headshot" in row and pd.notna(row["ngs_headshot"]):
            data["photo_url"] = str(row["ngs_headshot"])

        return data

    def _build_profile_from_db(self, player_uid: str) -> Optional[PlayerProfile]:
        """Build profile from database records."""
        conn = self._get_connection()

        # Get player record
        player = conn.execute("""
            SELECT * FROM players WHERE player_uid = ?
        """, (player_uid,)).fetchone()

        if not player:
            return None

        # Get identifiers
        identifiers = conn.execute("""
            SELECT source, external_id FROM player_identifiers
            WHERE player_uid = ?
        """, (player_uid,)).fetchall()

        external_ids = {row["source"]: row["external_id"] for row in identifiers}

        # Calculate age if birth_date available
        age = None
        if player["birth_date"]:
            try:
                birth = datetime.strptime(player["birth_date"][:10], "%Y-%m-%d")
                age = (datetime.now() - birth).days // 365
            except (ValueError, TypeError):
                pass

        # Build profile
        profile = PlayerProfile(
            player_uid=player_uid,
            canonical_name=player["canonical_name"],
            position=player["position"],
            birth_date=player["birth_date"],
            age=age,
            college=player["college"],
            height_inches=player["height_inches"],
            weight=player["weight_lbs"],
            current_team=player["current_nfl_team"],
            status=player["status"],
            external_ids=external_ids,
            last_updated=datetime.now().isoformat(),
            sources=["database"]
        )

        # Try to get existing profile data
        existing = conn.execute("""
            SELECT * FROM player_profiles WHERE player_uid = ?
        """, (player_uid,)).fetchone()

        if existing:
            if existing["draft_year"]:
                profile.draft = DraftInfo(
                    year=existing["draft_year"],
                    round=existing["draft_round"],
                    pick=existing["draft_pick"],
                    overall_pick=existing["draft_overall"],
                    team=existing["draft_team"]
                )
            if existing["combine_forty"]:
                profile.combine = CombineMetrics(
                    forty_yard=existing["combine_forty"],
                    bench_press=existing["combine_bench"],
                    vertical_jump=existing["combine_vertical"],
                    broad_jump=existing["combine_broad"],
                    three_cone=existing["combine_three_cone"],
                    shuttle=existing["combine_shuttle"],
                    arm_length=existing["combine_arm_length"],
                    hand_size=existing["combine_hand_size"]
                )
            if existing["headshot_url"]:
                profile.headshot_url = existing["headshot_url"]
            if existing["photo_url"]:
                profile.photo_url = existing["photo_url"]
            if existing["twitter"]:
                profile.social = SocialLinks(
                    twitter=existing["twitter"],
                    instagram=existing["instagram"]
                )

        return profile

    def build_profile(
        self,
        player_uid: str,
        include_nflverse: bool = True,
        dry_run: bool = False
    ) -> Optional[PlayerProfile]:
        """
        Build complete profile for a single player.

        Args:
            player_uid: Player UID to build profile for
            include_nflverse: Include data from NFLverse
            dry_run: Don't save to database

        Returns:
            PlayerProfile or None if player not found
        """
        # Start with database profile
        profile = self._build_profile_from_db(player_uid)

        if not profile:
            logger.warning(f"Player not found: {player_uid}")
            return None

        # Enrich from NFLverse if available
        if include_nflverse and profile.external_ids:
            nflverse_df = self._load_nflverse_players()

            if not nflverse_df.empty:
                # Try to match by GSIS ID
                gsis_id = profile.external_ids.get("gsis")
                if gsis_id and "gsis_id" in nflverse_df.columns:
                    match = nflverse_df[nflverse_df["gsis_id"] == gsis_id]
                    if not match.empty:
                        nfl_data = self._parse_nflverse_player(match.iloc[0])
                        self._merge_profile_data(profile, nfl_data)
                        profile.sources.append("nflverse")

        # Save to database
        if not dry_run:
            self._save_profile(profile)

        return profile

    def _merge_profile_data(self, profile: PlayerProfile, data: Dict[str, Any]) -> None:
        """Merge external data into profile."""
        # Basic info (only fill if empty)
        if not profile.position and data.get("position"):
            profile.position = data["position"]
        if not profile.college and data.get("college"):
            profile.college = data["college"]
        if not profile.current_team and data.get("current_team"):
            profile.current_team = data["current_team"]
        if not profile.status and data.get("status"):
            profile.status = data["status"]
        if not profile.jersey_number and data.get("jersey_number"):
            profile.jersey_number = data["jersey_number"]
        if not profile.years_experience and data.get("years_experience"):
            profile.years_experience = data["years_experience"]
        if not profile.weight and data.get("weight"):
            profile.weight = data["weight"]
        if not profile.height and data.get("height"):
            profile.height = data["height"]

        # Draft info
        if not profile.draft and data.get("draft"):
            draft_data = data["draft"]
            profile.draft = DraftInfo(
                year=draft_data.get("year"),
                round=draft_data.get("round"),
                pick=draft_data.get("pick"),
                overall_pick=draft_data.get("overall_pick"),
                team=draft_data.get("team")
            )

        # Media
        if not profile.headshot_url and data.get("headshot_url"):
            profile.headshot_url = data["headshot_url"]
        if not profile.photo_url and data.get("photo_url"):
            profile.photo_url = data["photo_url"]

        # Merge external IDs
        if data.get("external_ids"):
            for source, ext_id in data["external_ids"].items():
                if source not in profile.external_ids:
                    profile.external_ids[source] = ext_id

    def _save_profile(self, profile: PlayerProfile) -> None:
        """Save profile to database."""
        self._ensure_profiles_table()
        conn = self._get_connection()

        draft_year = profile.draft.year if profile.draft else None
        draft_round = profile.draft.round if profile.draft else None
        draft_pick = profile.draft.pick if profile.draft else None
        draft_overall = profile.draft.overall_pick if profile.draft else None
        draft_team = profile.draft.team if profile.draft else None

        combine_forty = profile.combine.forty_yard if profile.combine else None
        combine_bench = profile.combine.bench_press if profile.combine else None
        combine_vertical = profile.combine.vertical_jump if profile.combine else None
        combine_broad = profile.combine.broad_jump if profile.combine else None
        combine_three_cone = profile.combine.three_cone if profile.combine else None
        combine_shuttle = profile.combine.shuttle if profile.combine else None
        combine_arm = profile.combine.arm_length if profile.combine else None
        combine_hand = profile.combine.hand_size if profile.combine else None

        twitter = profile.social.twitter if profile.social else None
        instagram = profile.social.instagram if profile.social else None

        # Serialize full profile
        profile_dict = asdict(profile)
        profile_json = json.dumps(profile_dict, default=str)

        conn.execute("""
            INSERT OR REPLACE INTO player_profiles (
                player_uid,
                draft_year, draft_round, draft_pick, draft_overall, draft_team,
                combine_forty, combine_bench, combine_vertical, combine_broad,
                combine_three_cone, combine_shuttle, combine_arm_length, combine_hand_size,
                photo_url, headshot_url,
                twitter, instagram,
                profile_json,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            profile.player_uid,
            draft_year, draft_round, draft_pick, draft_overall, draft_team,
            combine_forty, combine_bench, combine_vertical, combine_broad,
            combine_three_cone, combine_shuttle, combine_arm, combine_hand,
            profile.photo_url, profile.headshot_url,
            twitter, instagram,
            profile_json
        ))
        conn.commit()

    def build_all_profiles(
        self,
        limit: Optional[int] = None,
        include_nflverse: bool = True,
        dry_run: bool = False
    ) -> BuildResult:
        """
        Build profiles for all players in the database.

        Args:
            limit: Maximum number of profiles to build
            include_nflverse: Include NFLverse data
            dry_run: Don't save to database

        Returns:
            BuildResult with counts and errors
        """
        result = BuildResult()
        conn = self._get_connection()

        # Get all player UIDs
        query = "SELECT player_uid FROM players"
        if limit:
            query += f" LIMIT {limit}"

        players = conn.execute(query).fetchall()
        total = len(players)

        logger.info(f"Building profiles for {total} players")

        for i, row in enumerate(players):
            player_uid = row["player_uid"]

            try:
                profile = self.build_profile(player_uid, include_nflverse, dry_run)
                if profile:
                    result.profiles_built += 1
                else:
                    result.profiles_skipped += 1

                if (i + 1) % 100 == 0:
                    logger.info(f"Progress: {i + 1}/{total}")

            except Exception as e:
                result.errors.append(f"Failed to build profile for {player_uid}: {e}")

        logger.info(f"Built {result.profiles_built} profiles, {result.profiles_skipped} skipped, {len(result.errors)} errors")
        return result

    def export_profiles(
        self,
        output_path: Path,
        player_uids: Optional[List[str]] = None
    ) -> int:
        """
        Export profiles to JSON file.

        Args:
            output_path: Path to output JSON file
            player_uids: Optional list of player UIDs to export

        Returns:
            Number of profiles exported
        """
        conn = self._get_connection()

        if player_uids:
            placeholders = ",".join("?" * len(player_uids))
            query = f"SELECT profile_json FROM player_profiles WHERE player_uid IN ({placeholders})"
            rows = conn.execute(query, player_uids).fetchall()
        else:
            rows = conn.execute("SELECT profile_json FROM player_profiles").fetchall()

        profiles = []
        for row in rows:
            if row["profile_json"]:
                try:
                    profile = json.loads(row["profile_json"])
                    profiles.append(profile)
                except json.JSONDecodeError:
                    pass

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(profiles, indent=2, default=str))

        logger.info(f"Exported {len(profiles)} profiles to {output_path}")
        return len(profiles)


# Convenience function
def build_profiles(
    db_path: Path = PLAYERS_DB_PATH,
    limit: Optional[int] = None
) -> BuildResult:
    """Build profiles for all players."""
    with ProfileBuilder(db_path=db_path) as builder:
        return builder.build_all_profiles(limit=limit)


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Advanced Player Profile Builder",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Build all profiles
  python build_profiles.py --all

  # Build for specific player
  python build_profiles.py --player-uid abc-123-uuid

  # Export to JSON
  python build_profiles.py --export profiles.json

  # Dry run
  python build_profiles.py --all --dry-run
        """
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Build profiles for all players"
    )

    parser.add_argument(
        "--player-uid",
        type=str,
        help="Build profile for specific player"
    )

    parser.add_argument(
        "--export",
        type=Path,
        help="Export profiles to JSON file"
    )

    parser.add_argument(
        "--limit",
        type=int,
        help="Limit number of profiles to build"
    )

    parser.add_argument(
        "--no-nflverse",
        action="store_true",
        help="Don't include NFLverse data"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without saving"
    )

    parser.add_argument(
        "--db",
        type=Path,
        default=PLAYERS_DB_PATH,
        help=f"Path to players database (default: {PLAYERS_DB_PATH})"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    builder = ProfileBuilder(db_path=args.db)

    try:
        if args.export:
            count = builder.export_profiles(args.export)
            print(f"Exported {count} profiles to {args.export}")
            return 0

        if args.player_uid:
            profile = builder.build_profile(
                args.player_uid,
                include_nflverse=not args.no_nflverse,
                dry_run=args.dry_run
            )
            if profile:
                print(json.dumps(asdict(profile), indent=2, default=str))
                return 0
            else:
                print(f"Player not found: {args.player_uid}")
                return 1

        if args.all:
            result = builder.build_all_profiles(
                limit=args.limit,
                include_nflverse=not args.no_nflverse,
                dry_run=args.dry_run
            )

            print(f"\nBuild Summary:")
            print(f"  Profiles built: {result.profiles_built}")
            print(f"  Profiles skipped: {result.profiles_skipped}")
            print(f"  Errors: {len(result.errors)}")

            if result.errors:
                print("\nErrors:")
                for error in result.errors[:10]:
                    print(f"  - {error}")
                if len(result.errors) > 10:
                    print(f"  ... and {len(result.errors) - 10} more")

            return 0 if not result.errors else 1

        parser.print_help()
        return 0

    finally:
        builder.close()


if __name__ == "__main__":
    sys.exit(main())
