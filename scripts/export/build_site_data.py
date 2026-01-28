#!/usr/bin/env python3
"""
Optimized JSON Export for Frontend

Builds efficient frontend data exports with:
- Minimal JSON (no redundant data)
- Consistent player_uid references everywhere
- Pre-computed aggregations
- Delta exports (what changed since last build)

Usage:
    # Full export
    python build_site_data.py --all

    # Export specific seasons
    python build_site_data.py --seasons 2024,2025

    # Delta export (changes only)
    python build_site_data.py --delta

    # Minified output
    python build_site_data.py --all --minify
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import logging
import sqlite3
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set, Tuple

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
PUBLIC_DATA_PATH = PROJECT_ROOT / "public" / "data"
MANIFEST_PATH = PUBLIC_DATA_PATH / "manifest.json"
DELTA_STATE_PATH = PROJECT_ROOT / ".build_state" / "export_state.json"


@dataclass
class ExportResult:
    """Result of an export operation."""
    files_created: int = 0
    files_updated: int = 0
    files_unchanged: int = 0
    total_bytes: int = 0
    compressed_bytes: int = 0
    duration_seconds: float = 0.0
    errors: List[str] = field(default_factory=list)


@dataclass
class DeltaState:
    """Tracks state for delta exports."""
    last_export: str
    file_hashes: Dict[str, str] = field(default_factory=dict)
    record_counts: Dict[str, int] = field(default_factory=dict)


class SiteDataExporter:
    """
    Exports optimized JSON data for the frontend.

    Features:
    - Removes redundant data (normalizes references)
    - Pre-computes aggregations
    - Supports delta exports
    - Optional gzip compression
    """

    def __init__(
        self,
        players_db: Path = PLAYERS_DB_PATH,
        stats_db: Path = STATS_DB_PATH,
        league_db: Path = LEAGUE_DB_PATH,
        output_path: Path = PUBLIC_DATA_PATH,
        minify: bool = False,
        compress: bool = False
    ):
        self.players_db = players_db
        self.stats_db = stats_db
        self.league_db = league_db
        self.output_path = output_path
        self.minify = minify
        self.compress = compress
        self._connections: Dict[str, sqlite3.Connection] = {}
        self._delta_state: Optional[DeltaState] = None

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

    def _load_delta_state(self) -> DeltaState:
        """Load delta state from disk."""
        if self._delta_state is not None:
            return self._delta_state

        if DELTA_STATE_PATH.exists():
            try:
                data = json.loads(DELTA_STATE_PATH.read_text())
                self._delta_state = DeltaState(
                    last_export=data.get("last_export", ""),
                    file_hashes=data.get("file_hashes", {}),
                    record_counts=data.get("record_counts", {})
                )
            except (json.JSONDecodeError, KeyError):
                self._delta_state = DeltaState(last_export="")
        else:
            self._delta_state = DeltaState(last_export="")

        return self._delta_state

    def _save_delta_state(self) -> None:
        """Save delta state to disk."""
        if self._delta_state is None:
            return

        self._delta_state.last_export = datetime.now().isoformat()

        DELTA_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        DELTA_STATE_PATH.write_text(json.dumps({
            "last_export": self._delta_state.last_export,
            "file_hashes": self._delta_state.file_hashes,
            "record_counts": self._delta_state.record_counts
        }, indent=2))

    def _write_json(
        self,
        data: Any,
        output_file: Path,
        force: bool = False
    ) -> Tuple[bool, int]:
        """
        Write JSON data to file with optional minification and compression.

        Returns:
            Tuple of (was_written, bytes_written)
        """
        # Serialize
        if self.minify:
            json_str = json.dumps(data, separators=(",", ":"), default=str)
        else:
            json_str = json.dumps(data, indent=2, default=str)

        json_bytes = json_str.encode("utf-8")

        # Calculate hash for delta detection
        content_hash = hashlib.md5(json_bytes).hexdigest()
        state = self._load_delta_state()

        # Check if unchanged
        file_key = str(output_file.relative_to(self.output_path))
        if not force and state.file_hashes.get(file_key) == content_hash:
            return False, 0

        # Write file
        output_file.parent.mkdir(parents=True, exist_ok=True)

        if self.compress:
            compressed = gzip.compress(json_bytes)
            output_file.with_suffix(".json.gz").write_bytes(compressed)
            bytes_written = len(compressed)
        else:
            output_file.write_text(json_str)
            bytes_written = len(json_bytes)

        # Update state
        state.file_hashes[file_key] = content_hash

        return True, bytes_written

    def _build_players_index(self) -> List[Dict[str, Any]]:
        """Build minimal player index for frontend."""
        conn = self._get_connection("players")
        if not conn:
            return []

        rows = conn.execute("""
            SELECT
                p.player_uid,
                p.canonical_name,
                p.position,
                p.current_nfl_team,
                p.status
            FROM players p
            ORDER BY p.canonical_name
        """).fetchall()

        players = []
        for row in rows:
            players.append({
                "id": row["player_uid"],
                "name": row["canonical_name"],
                "pos": row["position"],
                "team": row["current_nfl_team"],
                "status": row["status"]
            })

        return players

    def _build_player_ids_index(self) -> Dict[str, Dict[str, str]]:
        """Build player ID cross-reference index."""
        conn = self._get_connection("players")
        if not conn:
            return {}

        rows = conn.execute("""
            SELECT player_uid, source, external_id
            FROM player_identifiers
            WHERE confidence >= 0.8
        """).fetchall()

        # Group by player
        index: Dict[str, Dict[str, str]] = {}
        for row in rows:
            uid = row["player_uid"]
            if uid not in index:
                index[uid] = {}
            index[uid][row["source"]] = row["external_id"]

        return index

    def _build_season_data(self, season: int) -> Dict[str, Any]:
        """Build season summary data."""
        conn = self._get_connection("stats")
        league_conn = self._get_connection("league")

        data = {
            "season": season,
            "generated_at": datetime.now().isoformat()
        }

        # Get game counts
        if conn:
            games = conn.execute("""
                SELECT COUNT(*) as count, season_type
                FROM nfl_games
                WHERE season = ?
                GROUP BY season_type
            """, (season,)).fetchall()

            data["games"] = {row["season_type"]: row["count"] for row in games}

            # Get player stats summary
            stats_summary = conn.execute("""
                SELECT
                    position,
                    COUNT(DISTINCT player_uid) as players,
                    SUM(fantasy_points_ppr) as total_points
                FROM player_season_stats
                WHERE season = ? AND season_type = 'REG'
                GROUP BY position
            """, (season,)).fetchall()

            data["stats_by_position"] = {
                row["position"]: {
                    "players": row["players"],
                    "total_points": round(row["total_points"] or 0, 2)
                }
                for row in stats_summary
            }

        # Get league data
        if league_conn:
            transactions = league_conn.execute("""
                SELECT transaction_type, COUNT(*) as count
                FROM unified_transactions
                WHERE season = ?
                GROUP BY transaction_type
            """, (season,)).fetchall()

            data["transactions"] = {row["transaction_type"]: row["count"] for row in transactions}

        return data

    def _build_weekly_data(self, season: int, week: int) -> Dict[str, Any]:
        """Build weekly matchup and lineup data."""
        league_conn = self._get_connection("league")
        stats_conn = self._get_connection("stats")

        data = {
            "season": season,
            "week": week,
            "generated_at": datetime.now().isoformat()
        }

        # Get matchups
        if league_conn:
            matchups = league_conn.execute("""
                SELECT
                    id,
                    home_team_id, home_team_name, home_score,
                    away_team_id, away_team_name, away_score,
                    matchup_type, winner_team_id
                FROM unified_matchups
                WHERE season = ? AND week = ?
            """, (season, week)).fetchall()

            data["matchups"] = [
                {
                    "id": m["id"],
                    "home": {"id": m["home_team_id"], "name": m["home_team_name"], "score": m["home_score"]},
                    "away": {"id": m["away_team_id"], "name": m["away_team_name"], "score": m["away_score"]},
                    "type": m["matchup_type"],
                    "winner": m["winner_team_id"]
                }
                for m in matchups
            ]

            # Get lineups (minimal - just starters)
            lineups = league_conn.execute("""
                SELECT
                    team_id, player_uid, slot, points_actual
                FROM unified_lineups
                WHERE season = ? AND week = ? AND is_starter = 1
                ORDER BY team_id, slot
            """, (season, week)).fetchall()

            lineups_by_team: Dict[str, List] = {}
            for l in lineups:
                team = l["team_id"]
                if team not in lineups_by_team:
                    lineups_by_team[team] = []
                lineups_by_team[team].append({
                    "p": l["player_uid"],  # Short key for minimal JSON
                    "s": l["slot"],
                    "pts": l["points_actual"]
                })

            data["lineups"] = lineups_by_team

        # Get top performers
        if stats_conn:
            top_performers = stats_conn.execute("""
                SELECT
                    player_uid, position, fantasy_points_ppr
                FROM player_game_stats
                WHERE season = ? AND week = ? AND is_current = 1
                ORDER BY fantasy_points_ppr DESC
                LIMIT 20
            """, (season, week)).fetchall()

            data["top_performers"] = [
                {"p": p["player_uid"], "pos": p["position"], "pts": round(p["fantasy_points_ppr"] or 0, 2)}
                for p in top_performers
            ]

        return data

    def _build_player_stats(self, season: int) -> List[Dict[str, Any]]:
        """Build player stats for a season."""
        conn = self._get_connection("stats")
        if not conn:
            return []

        rows = conn.execute("""
            SELECT
                player_uid, position, team, games_played,
                fantasy_points_ppr, fantasy_ppg_ppr, metrics
            FROM player_season_stats
            WHERE season = ? AND season_type = 'REG'
            ORDER BY fantasy_points_ppr DESC
        """, (season,)).fetchall()

        stats = []
        for row in rows:
            stat = {
                "p": row["player_uid"],  # Short key
                "pos": row["position"],
                "tm": row["team"],
                "gp": row["games_played"],
                "pts": round(row["fantasy_points_ppr"] or 0, 2),
                "ppg": round(row["fantasy_ppg_ppr"] or 0, 2)
            }

            # Include metrics if available
            if row["metrics"]:
                try:
                    metrics = json.loads(row["metrics"])
                    if metrics.get("war_total"):
                        stat["war"] = round(metrics["war_total"], 2)
                    if metrics.get("consistency_score"):
                        stat["cons"] = round(metrics["consistency_score"], 1)
                except json.JSONDecodeError:
                    pass

            stats.append(stat)

        return stats

    def _build_manifest(self, seasons: List[int]) -> Dict[str, Any]:
        """Build manifest file with metadata and path templates."""
        # Determine weeks per season
        conn = self._get_connection("stats")
        weeks_by_season = {}

        if conn:
            for season in seasons:
                weeks = conn.execute("""
                    SELECT DISTINCT week FROM nfl_games
                    WHERE season = ? AND season_type = 'REG'
                    ORDER BY week
                """, (season,)).fetchall()
                weeks_by_season[season] = [w["week"] for w in weeks]

        manifest = {
            "schemaVersion": "3.0.0",
            "generatedAt": datetime.now().isoformat(),
            "seasons": seasons,
            "weeksBySeason": weeks_by_season,
            "paths": {
                "players": "players.json",
                "playerIds": "player_ids.json",
                "season": "season/{season}.json",
                "weekly": "weekly/{season}/week-{week}.json",
                "playerStats": "stats/season/{season}.json",
                "transactions": "transactions/{season}.json",
                "search": "search/index.json"
            },
            "features": {
                "compression": self.compress,
                "minified": self.minify
            }
        }

        return manifest

    def export_all(
        self,
        seasons: Optional[List[int]] = None,
        force: bool = False
    ) -> ExportResult:
        """
        Export all site data.

        Args:
            seasons: List of seasons to export (None = all)
            force: Force export even if unchanged

        Returns:
            ExportResult with counts
        """
        result = ExportResult()
        start_time = datetime.now()

        if seasons is None:
            seasons = list(range(2015, 2026))

        logger.info(f"Exporting site data for seasons: {seasons}")

        try:
            # Export players index
            logger.info("Exporting players index...")
            players = self._build_players_index()
            written, bytes_written = self._write_json(
                players,
                self.output_path / "players.json",
                force
            )
            if written:
                result.files_created += 1
                result.total_bytes += bytes_written
            else:
                result.files_unchanged += 1

            # Export player IDs index
            logger.info("Exporting player IDs index...")
            player_ids = self._build_player_ids_index()
            written, bytes_written = self._write_json(
                player_ids,
                self.output_path / "player_ids.json",
                force
            )
            if written:
                result.files_created += 1
                result.total_bytes += bytes_written
            else:
                result.files_unchanged += 1

            # Export per-season data
            for season in seasons:
                logger.info(f"Exporting season {season}...")

                # Season summary
                season_data = self._build_season_data(season)
                written, bytes_written = self._write_json(
                    season_data,
                    self.output_path / "season" / f"{season}.json",
                    force
                )
                if written:
                    result.files_created += 1
                    result.total_bytes += bytes_written
                else:
                    result.files_unchanged += 1

                # Player stats
                stats = self._build_player_stats(season)
                written, bytes_written = self._write_json(
                    stats,
                    self.output_path / "stats" / "season" / f"{season}.json",
                    force
                )
                if written:
                    result.files_created += 1
                    result.total_bytes += bytes_written
                else:
                    result.files_unchanged += 1

                # Weekly data
                weeks = self._get_weeks_for_season(season)
                for week in weeks:
                    weekly_data = self._build_weekly_data(season, week)
                    written, bytes_written = self._write_json(
                        weekly_data,
                        self.output_path / "weekly" / str(season) / f"week-{week}.json",
                        force
                    )
                    if written:
                        result.files_created += 1
                        result.total_bytes += bytes_written
                    else:
                        result.files_unchanged += 1

            # Export manifest
            logger.info("Exporting manifest...")
            manifest = self._build_manifest(seasons)
            written, bytes_written = self._write_json(
                manifest,
                self.output_path / "manifest.json",
                force=True  # Always update manifest
            )
            result.files_updated += 1
            result.total_bytes += bytes_written

            # Save delta state
            self._save_delta_state()

        except Exception as e:
            result.errors.append(str(e))
            logger.error(f"Export error: {e}")

        result.duration_seconds = (datetime.now() - start_time).total_seconds()
        logger.info(
            f"Export complete: {result.files_created} created, "
            f"{result.files_unchanged} unchanged, "
            f"{result.total_bytes:,} bytes"
        )

        return result

    def _get_weeks_for_season(self, season: int) -> List[int]:
        """Get list of weeks for a season."""
        conn = self._get_connection("stats")
        if not conn:
            return list(range(1, 18))

        rows = conn.execute("""
            SELECT DISTINCT week FROM nfl_games
            WHERE season = ? AND season_type = 'REG'
            ORDER BY week
        """, (season,)).fetchall()

        if rows:
            return [r["week"] for r in rows]
        return list(range(1, 18))

    def export_delta(self) -> ExportResult:
        """Export only changed data since last export."""
        state = self._load_delta_state()

        if not state.last_export:
            logger.info("No previous export found, running full export")
            return self.export_all(force=False)

        logger.info(f"Running delta export (last: {state.last_export})")
        return self.export_all(force=False)


def export_site_data(
    seasons: Optional[List[int]] = None,
    minify: bool = False,
    compress: bool = False
) -> ExportResult:
    """Export site data for specified seasons."""
    with SiteDataExporter(minify=minify, compress=compress) as exporter:
        return exporter.export_all(seasons)


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Optimized JSON Export for Frontend",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Export all seasons (2015-2025)"
    )

    parser.add_argument(
        "--seasons",
        type=str,
        help="Comma-separated list of seasons"
    )

    parser.add_argument(
        "--delta",
        action="store_true",
        help="Export only changed data"
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Force export even if unchanged"
    )

    parser.add_argument(
        "--minify",
        action="store_true",
        help="Minify JSON output"
    )

    parser.add_argument(
        "--compress",
        action="store_true",
        help="Gzip compress output"
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=PUBLIC_DATA_PATH,
        help=f"Output directory (default: {PUBLIC_DATA_PATH})"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    exporter = SiteDataExporter(
        output_path=args.output,
        minify=args.minify,
        compress=args.compress
    )

    try:
        if args.delta:
            result = exporter.export_delta()
        elif args.seasons:
            seasons = [int(s) for s in args.seasons.split(",")]
            result = exporter.export_all(seasons, args.force)
        elif args.all:
            result = exporter.export_all(force=args.force)
        else:
            parser.print_help()
            return 0

        print(f"\nExport Summary:")
        print(f"  Files created: {result.files_created}")
        print(f"  Files unchanged: {result.files_unchanged}")
        print(f"  Total bytes: {result.total_bytes:,}")
        print(f"  Duration: {result.duration_seconds:.2f}s")

        if result.errors:
            print(f"  Errors: {len(result.errors)}")
            for error in result.errors:
                print(f"    - {error}")

        return 0 if not result.errors else 1

    finally:
        exporter.close()


if __name__ == "__main__":
    sys.exit(main())
