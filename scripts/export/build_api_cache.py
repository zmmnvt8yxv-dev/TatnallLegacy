#!/usr/bin/env python3
"""
API-Ready Exports Builder

Prepares data exports for a future REST API layer:
- RESTful resource structure
- Pagination-ready lists
- HATEOAS-style links
- Consistent response format

Usage:
    # Build all API cache
    python build_api_cache.py --all

    # Build specific resources
    python build_api_cache.py --resources players,stats

    # Set page size
    python build_api_cache.py --all --page-size 50
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sqlite3
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

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
STATS_DB_PATH = PROJECT_ROOT / "db" / "stats.sqlite"
LEAGUE_DB_PATH = PROJECT_ROOT / "db" / "league.sqlite"
API_CACHE_PATH = PROJECT_ROOT / "public" / "api"

# Default pagination
DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


@dataclass
class APIResponse:
    """Standard API response format."""
    data: Any
    meta: Dict[str, Any] = field(default_factory=dict)
    links: Dict[str, str] = field(default_factory=dict)
    included: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class PaginationMeta:
    """Pagination metadata."""
    page: int
    per_page: int
    total_pages: int
    total_count: int
    has_next: bool
    has_prev: bool


@dataclass
class BuildResult:
    """Result of building API cache."""
    resources_built: int = 0
    files_created: int = 0
    total_bytes: int = 0
    errors: List[str] = field(default_factory=list)


class APICacheBuilder:
    """
    Builds API-ready cached responses.

    Features:
    - RESTful resource structure (/api/v1/players, /api/v1/stats, etc.)
    - Pre-paginated lists for common page sizes
    - HATEOAS links for navigation
    - Individual resource files for detail views
    """

    def __init__(
        self,
        players_db: Path = PLAYERS_DB_PATH,
        stats_db: Path = STATS_DB_PATH,
        league_db: Path = LEAGUE_DB_PATH,
        output_path: Path = API_CACHE_PATH,
        base_url: str = "/api/v1",
        page_size: int = DEFAULT_PAGE_SIZE
    ):
        self.players_db = players_db
        self.stats_db = stats_db
        self.league_db = league_db
        self.output_path = output_path
        self.base_url = base_url
        self.page_size = min(page_size, MAX_PAGE_SIZE)
        self._connections: Dict[str, sqlite3.Connection] = {}

    def _get_connection(self, db_name: str) -> Optional[sqlite3.Connection]:
        """Get database connection."""
        if db_name in self._connections:
            return self._connections[db_name]

        db_paths = {
            "players": self.players_db,
            "stats": self.stats_db,
            "league": self.league_db
        }

        db_path = db_paths.get(db_name)
        if not db_path or not db_path.exists():
            return None

        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        self._connections[db_name] = conn
        return conn

    def close(self) -> None:
        """Close all database connections."""
        for conn in self._connections.values():
            conn.close()
        self._connections.clear()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    def _write_response(
        self,
        response: APIResponse,
        output_file: Path
    ) -> int:
        """Write API response to file."""
        output_file.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "data": response.data,
            "meta": response.meta,
            "links": response.links
        }

        if response.included:
            data["included"] = response.included

        json_str = json.dumps(data, indent=2, default=str)
        output_file.write_text(json_str)

        return len(json_str)

    def _build_pagination_meta(
        self,
        page: int,
        total_count: int
    ) -> PaginationMeta:
        """Build pagination metadata."""
        total_pages = math.ceil(total_count / self.page_size) if total_count > 0 else 1

        return PaginationMeta(
            page=page,
            per_page=self.page_size,
            total_pages=total_pages,
            total_count=total_count,
            has_next=page < total_pages,
            has_prev=page > 1
        )

    def _build_pagination_links(
        self,
        resource: str,
        page: int,
        total_pages: int,
        extra_params: str = ""
    ) -> Dict[str, str]:
        """Build HATEOAS pagination links."""
        base = f"{self.base_url}/{resource}"
        params = f"?page_size={self.page_size}{extra_params}"

        links = {
            "self": f"{base}{params}&page={page}",
            "first": f"{base}{params}&page=1",
            "last": f"{base}{params}&page={total_pages}"
        }

        if page > 1:
            links["prev"] = f"{base}{params}&page={page - 1}"
        if page < total_pages:
            links["next"] = f"{base}{params}&page={page + 1}"

        return links

    # =========================================================================
    # Players Resource
    # =========================================================================

    def build_players_resource(self) -> int:
        """
        Build /api/v1/players resource.

        Creates:
        - /players/index.json (paginated list)
        - /players/page-{n}.json (individual pages)
        - /players/{id}.json (individual players)
        """
        conn = self._get_connection("players")
        if not conn:
            return 0

        files_created = 0

        # Get total count
        total_count = conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]
        total_pages = math.ceil(total_count / self.page_size)

        logger.info(f"Building players resource: {total_count} players, {total_pages} pages")

        # Build paginated lists
        for page in range(1, total_pages + 1):
            offset = (page - 1) * self.page_size

            players = conn.execute("""
                SELECT
                    player_uid, canonical_name, position,
                    current_nfl_team, status, birth_date, college
                FROM players
                ORDER BY canonical_name
                LIMIT ? OFFSET ?
            """, (self.page_size, offset)).fetchall()

            data = [
                {
                    "id": p["player_uid"],
                    "type": "player",
                    "attributes": {
                        "name": p["canonical_name"],
                        "position": p["position"],
                        "team": p["current_nfl_team"],
                        "status": p["status"],
                        "birthDate": p["birth_date"],
                        "college": p["college"]
                    },
                    "links": {
                        "self": f"{self.base_url}/players/{p['player_uid']}"
                    }
                }
                for p in players
            ]

            pagination = self._build_pagination_meta(page, total_count)
            links = self._build_pagination_links("players", page, total_pages)

            response = APIResponse(
                data=data,
                meta={
                    "pagination": asdict(pagination),
                    "generatedAt": datetime.now().isoformat()
                },
                links=links
            )

            output_file = self.output_path / "v1" / "players" / f"page-{page}.json"
            self._write_response(response, output_file)
            files_created += 1

        # Build index (first page as default)
        index_link = self.output_path / "v1" / "players" / "index.json"
        first_page = self.output_path / "v1" / "players" / "page-1.json"
        if first_page.exists():
            index_link.write_text(first_page.read_text())
            files_created += 1

        # Build individual player resources
        all_players = conn.execute("""
            SELECT
                p.player_uid, p.canonical_name, p.position,
                p.current_nfl_team, p.status, p.birth_date, p.college,
                p.height_inches, p.weight_lbs, p.nfl_debut_year
            FROM players p
        """).fetchall()

        for player in all_players:
            uid = player["player_uid"]

            # Get identifiers
            identifiers = conn.execute("""
                SELECT source, external_id
                FROM player_identifiers
                WHERE player_uid = ?
            """, (uid,)).fetchall()

            ids_dict = {i["source"]: i["external_id"] for i in identifiers}

            # Get aliases
            aliases = conn.execute("""
                SELECT alias FROM player_aliases WHERE player_uid = ?
            """, (uid,)).fetchall()

            data = {
                "id": uid,
                "type": "player",
                "attributes": {
                    "name": player["canonical_name"],
                    "position": player["position"],
                    "team": player["current_nfl_team"],
                    "status": player["status"],
                    "birthDate": player["birth_date"],
                    "college": player["college"],
                    "height": player["height_inches"],
                    "weight": player["weight_lbs"],
                    "debutYear": player["nfl_debut_year"]
                },
                "relationships": {
                    "identifiers": {
                        "data": [{"type": "identifier", "id": f"{s}:{i}"} for s, i in ids_dict.items()]
                    }
                },
                "links": {
                    "self": f"{self.base_url}/players/{uid}",
                    "stats": f"{self.base_url}/players/{uid}/stats"
                }
            }

            included = [
                {
                    "type": "identifier",
                    "id": f"{source}:{ext_id}",
                    "attributes": {"source": source, "externalId": ext_id}
                }
                for source, ext_id in ids_dict.items()
            ]

            if aliases:
                data["attributes"]["aliases"] = [a["alias"] for a in aliases]

            response = APIResponse(data=data, included=included)
            output_file = self.output_path / "v1" / "players" / f"{uid}.json"
            self._write_response(response, output_file)
            files_created += 1

        return files_created

    # =========================================================================
    # Stats Resource
    # =========================================================================

    def build_stats_resource(self, season: int) -> int:
        """
        Build /api/v1/stats/{season} resource.

        Creates:
        - /stats/{season}/index.json (paginated list)
        - /stats/{season}/page-{n}.json (individual pages)
        - /stats/{season}/players/{id}.json (player season stats)
        """
        conn = self._get_connection("stats")
        if not conn:
            return 0

        files_created = 0

        # Get total count
        total_count = conn.execute("""
            SELECT COUNT(*) FROM player_season_stats
            WHERE season = ? AND season_type = 'REG'
        """, (season,)).fetchone()[0]

        if total_count == 0:
            return 0

        total_pages = math.ceil(total_count / self.page_size)

        logger.info(f"Building stats resource for {season}: {total_count} records, {total_pages} pages")

        # Build paginated lists
        for page in range(1, total_pages + 1):
            offset = (page - 1) * self.page_size

            stats = conn.execute("""
                SELECT
                    player_uid, position, team, games_played,
                    fantasy_points_ppr, fantasy_ppg_ppr, metrics
                FROM player_season_stats
                WHERE season = ? AND season_type = 'REG'
                ORDER BY fantasy_points_ppr DESC
                LIMIT ? OFFSET ?
            """, (season, self.page_size, offset)).fetchall()

            data = []
            for s in stats:
                entry = {
                    "id": f"{s['player_uid']}_{season}",
                    "type": "seasonStats",
                    "attributes": {
                        "season": season,
                        "position": s["position"],
                        "team": s["team"],
                        "gamesPlayed": s["games_played"],
                        "fantasyPointsPpr": round(s["fantasy_points_ppr"] or 0, 2),
                        "fantasyPpg": round(s["fantasy_ppg_ppr"] or 0, 2)
                    },
                    "relationships": {
                        "player": {
                            "data": {"type": "player", "id": s["player_uid"]}
                        }
                    },
                    "links": {
                        "self": f"{self.base_url}/stats/{season}/players/{s['player_uid']}",
                        "player": f"{self.base_url}/players/{s['player_uid']}"
                    }
                }

                if s["metrics"]:
                    try:
                        metrics = json.loads(s["metrics"])
                        entry["attributes"]["metrics"] = metrics
                    except json.JSONDecodeError:
                        pass

                data.append(entry)

            pagination = self._build_pagination_meta(page, total_count)
            links = self._build_pagination_links(f"stats/{season}", page, total_pages)

            response = APIResponse(
                data=data,
                meta={
                    "season": season,
                    "pagination": asdict(pagination),
                    "generatedAt": datetime.now().isoformat()
                },
                links=links
            )

            output_file = self.output_path / "v1" / "stats" / str(season) / f"page-{page}.json"
            self._write_response(response, output_file)
            files_created += 1

        # Create index
        index_link = self.output_path / "v1" / "stats" / str(season) / "index.json"
        first_page = self.output_path / "v1" / "stats" / str(season) / "page-1.json"
        if first_page.exists():
            index_link.write_text(first_page.read_text())
            files_created += 1

        return files_created

    # =========================================================================
    # Games Resource
    # =========================================================================

    def build_games_resource(self, season: int) -> int:
        """Build /api/v1/games/{season} resource."""
        conn = self._get_connection("stats")
        if not conn:
            return 0

        files_created = 0

        games = conn.execute("""
            SELECT
                game_id, season, week, season_type,
                home_team, away_team, home_score, away_score,
                game_date, game_time, status, stadium
            FROM nfl_games
            WHERE season = ?
            ORDER BY week, game_date
        """, (season,)).fetchall()

        if not games:
            return 0

        # Group by week
        by_week: Dict[int, List] = {}
        for g in games:
            week = g["week"]
            if week not in by_week:
                by_week[week] = []

            by_week[week].append({
                "id": g["game_id"],
                "type": "game",
                "attributes": {
                    "season": g["season"],
                    "week": g["week"],
                    "seasonType": g["season_type"],
                    "homeTeam": g["home_team"],
                    "awayTeam": g["away_team"],
                    "homeScore": g["home_score"],
                    "awayScore": g["away_score"],
                    "gameDate": g["game_date"],
                    "gameTime": g["game_time"],
                    "status": g["status"],
                    "stadium": g["stadium"]
                },
                "links": {
                    "self": f"{self.base_url}/games/{g['game_id']}"
                }
            })

        # Build per-week files
        for week, week_games in by_week.items():
            response = APIResponse(
                data=week_games,
                meta={
                    "season": season,
                    "week": week,
                    "gameCount": len(week_games),
                    "generatedAt": datetime.now().isoformat()
                },
                links={
                    "self": f"{self.base_url}/games/{season}/week/{week}"
                }
            )

            output_file = self.output_path / "v1" / "games" / str(season) / f"week-{week}.json"
            self._write_response(response, output_file)
            files_created += 1

        # Build season index
        all_data = [g for week_games in by_week.values() for g in week_games]
        response = APIResponse(
            data=all_data,
            meta={
                "season": season,
                "weekCount": len(by_week),
                "gameCount": len(all_data),
                "generatedAt": datetime.now().isoformat()
            },
            links={
                "self": f"{self.base_url}/games/{season}"
            }
        )

        output_file = self.output_path / "v1" / "games" / str(season) / "index.json"
        self._write_response(response, output_file)
        files_created += 1

        return files_created

    # =========================================================================
    # Build All
    # =========================================================================

    def build_all(
        self,
        seasons: Optional[List[int]] = None,
        resources: Optional[List[str]] = None
    ) -> BuildResult:
        """
        Build all API cache resources.

        Args:
            seasons: List of seasons (default: 2015-2025)
            resources: List of resources to build (default: all)

        Returns:
            BuildResult with counts
        """
        result = BuildResult()

        if seasons is None:
            seasons = list(range(2015, 2026))

        if resources is None:
            resources = ["players", "stats", "games"]

        try:
            if "players" in resources:
                logger.info("Building players resource...")
                files = self.build_players_resource()
                result.files_created += files
                result.resources_built += 1

            if "stats" in resources:
                for season in seasons:
                    logger.info(f"Building stats resource for {season}...")
                    files = self.build_stats_resource(season)
                    result.files_created += files
                result.resources_built += 1

            if "games" in resources:
                for season in seasons:
                    logger.info(f"Building games resource for {season}...")
                    files = self.build_games_resource(season)
                    result.files_created += files
                result.resources_built += 1

            # Build API index
            self._build_api_index(seasons)
            result.files_created += 1

        except Exception as e:
            result.errors.append(str(e))
            logger.error(f"Build error: {e}")

        return result

    def _build_api_index(self, seasons: List[int]) -> None:
        """Build API root index."""
        index = {
            "version": "1.0.0",
            "generatedAt": datetime.now().isoformat(),
            "resources": {
                "players": {
                    "href": f"{self.base_url}/players",
                    "description": "Player directory with biographical data"
                },
                "stats": {
                    "href": f"{self.base_url}/stats/{{season}}",
                    "description": "Player statistics by season",
                    "seasons": seasons
                },
                "games": {
                    "href": f"{self.base_url}/games/{{season}}",
                    "description": "NFL game schedules and scores",
                    "seasons": seasons
                }
            },
            "links": {
                "self": self.base_url,
                "documentation": "/docs/api"
            }
        }

        output_file = self.output_path / "v1" / "index.json"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_text(json.dumps(index, indent=2))


def build_api_cache(
    seasons: Optional[List[int]] = None,
    page_size: int = DEFAULT_PAGE_SIZE
) -> BuildResult:
    """Build API cache for specified seasons."""
    with APICacheBuilder(page_size=page_size) as builder:
        return builder.build_all(seasons)


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Build API-Ready Exports"
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Build all resources"
    )

    parser.add_argument(
        "--resources",
        type=str,
        help="Comma-separated list of resources (players,stats,games)"
    )

    parser.add_argument(
        "--seasons",
        type=str,
        help="Comma-separated list of seasons"
    )

    parser.add_argument(
        "--page-size",
        type=int,
        default=DEFAULT_PAGE_SIZE,
        help=f"Page size for pagination (default: {DEFAULT_PAGE_SIZE})"
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=API_CACHE_PATH,
        help=f"Output directory (default: {API_CACHE_PATH})"
    )

    parser.add_argument(
        "--base-url",
        type=str,
        default="/api/v1",
        help="Base URL for API links"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    seasons = None
    if args.seasons:
        seasons = [int(s) for s in args.seasons.split(",")]

    resources = None
    if args.resources:
        resources = args.resources.split(",")

    builder = APICacheBuilder(
        output_path=args.output,
        base_url=args.base_url,
        page_size=args.page_size
    )

    try:
        if args.all or args.resources or args.seasons:
            result = builder.build_all(seasons=seasons, resources=resources)

            print(f"\nAPI Cache Build Summary:")
            print(f"  Resources built: {result.resources_built}")
            print(f"  Files created: {result.files_created}")

            if result.errors:
                print(f"  Errors: {len(result.errors)}")
                for error in result.errors:
                    print(f"    - {error}")

            return 0 if not result.errors else 1
        else:
            parser.print_help()
            return 0

    finally:
        builder.close()


if __name__ == "__main__":
    sys.exit(main())
