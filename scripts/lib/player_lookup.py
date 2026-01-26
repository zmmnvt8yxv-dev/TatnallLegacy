#!/usr/bin/env python3
"""
Player Lookup API

Centralized functions for player identity resolution that all scripts should use.
This module provides a simple, consistent interface for resolving player IDs
across different data sources.

Functions:
    resolve(source_id, source_type) -> player_uid
    resolve_by_name(name, position=None, team=None, season=None) -> player_uid
    get_all_ids(player_uid) -> dict of all known IDs
    get_canonical_name(player_uid) -> str
    batch_resolve(ids, source_type) -> dict[source_id -> player_uid]

Usage:
    from scripts.lib.player_lookup import (
        resolve,
        resolve_by_name,
        get_all_ids,
        get_canonical_name,
        batch_resolve
    )

    # Resolve a Sleeper ID to player_uid
    player_uid = resolve("4046", "sleeper")

    # Resolve by name
    player_uid = resolve_by_name("Patrick Mahomes", position="QB")

    # Get all known IDs for a player
    ids = get_all_ids(player_uid)
    # -> {"sleeper": "4046", "espn": "3139477", "gsis": "00-0033873", ...}

    # Batch resolve multiple IDs
    results = batch_resolve(["4046", "1466", "3321"], "sleeper")
"""

from __future__ import annotations

import logging
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

# Configure logging
logger = logging.getLogger(__name__)

# Path constants
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "db" / "players.sqlite"

# Type definitions
SourceType = Literal[
    "sleeper", "espn", "gsis", "sportradar", "yahoo", "pfr",
    "rotowire", "nflverse", "fantasy_data", "cbs", "fleaflicker", "mfl"
]

# Module-level cache for database path (can be configured)
_db_path: Path = DEFAULT_DB_PATH
_connection_cache: Optional[sqlite3.Connection] = None


def configure(db_path: Union[str, Path] = DEFAULT_DB_PATH) -> None:
    """
    Configure the player lookup module with a specific database path.

    Call this once at application startup if using a non-default database location.

    Args:
        db_path: Path to the player identity SQLite database
    """
    global _db_path, _connection_cache
    _db_path = Path(db_path)
    _connection_cache = None
    # Clear caches when reconfigured
    _get_cached_player.cache_clear()
    _get_cached_identifiers.cache_clear()


def _get_connection() -> sqlite3.Connection:
    """Get a database connection."""
    global _connection_cache

    if _connection_cache is not None:
        try:
            # Test if connection is still valid
            _connection_cache.execute("SELECT 1")
            return _connection_cache
        except sqlite3.Error:
            _connection_cache = None

    if not _db_path.exists():
        raise FileNotFoundError(
            f"Player identity database not found at {_db_path}. "
            "Run 'python scripts/db/init_db.py --init' to create it, then "
            "'python scripts/identity/load_all_sources.py --all' to populate it."
        )

    conn = sqlite3.connect(str(_db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    _connection_cache = conn
    return conn


def close_connection() -> None:
    """Close the cached database connection."""
    global _connection_cache
    if _connection_cache is not None:
        _connection_cache.close()
        _connection_cache = None


# -----------------------------------------------------------------------------
# Core Resolution Functions
# -----------------------------------------------------------------------------

def resolve(
    source_id: Union[str, int],
    source_type: SourceType,
    create_if_missing: bool = False,
    source_data: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """
    Resolve an external source ID to a canonical player_uid.

    This is the primary function for looking up players by their platform-specific ID.

    Args:
        source_id: The external ID to resolve (e.g., "4046" for Sleeper)
        source_type: The source platform (e.g., "sleeper", "espn", "gsis")
        create_if_missing: If True and no match found, attempt to create via resolver
        source_data: Optional dict with additional player data for fuzzy matching

    Returns:
        player_uid if found/resolved, None otherwise

    Examples:
        >>> resolve("4046", "sleeper")
        "a1b2c3d4-e5f6-..."

        >>> resolve("3139477", "espn")
        "a1b2c3d4-e5f6-..."

        >>> resolve("unknown_id", "sleeper")
        None
    """
    source_id = str(source_id)

    try:
        conn = _get_connection()
        cursor = conn.execute("""
            SELECT player_uid FROM player_identifiers
            WHERE source = ? AND external_id = ?
        """, (source_type, source_id))

        row = cursor.fetchone()
        if row:
            return row["player_uid"]

        # If not found and create_if_missing is True, use the resolver
        if create_if_missing and source_data:
            try:
                from scripts.identity.resolver import IdentityResolver
                resolver = IdentityResolver(db_path=_db_path, log_audit=False)
                result = resolver.resolve(source_id, source_type, source_data)
                if result.success:
                    return result.player_uid
            except ImportError:
                logger.warning("IdentityResolver not available for create_if_missing")
            except Exception as e:
                logger.warning(f"Failed to resolve via IdentityResolver: {e}")

        return None

    except sqlite3.Error as e:
        logger.error(f"Database error in resolve(): {e}")
        return None


def resolve_by_name(
    name: str,
    position: Optional[str] = None,
    team: Optional[str] = None,
    season: Optional[int] = None,
    birth_date: Optional[str] = None
) -> Optional[str]:
    """
    Resolve a player by name and optional criteria.

    This is useful when you only have a player's name (e.g., from historical data
    or text parsing) and need to find their player_uid.

    Args:
        name: Player name to search for
        position: Optional position filter (e.g., "QB", "WR")
        team: Optional team filter (e.g., "KC", "SF")
        season: Optional season for historical team matching
        birth_date: Optional birth date (YYYY-MM-DD format)

    Returns:
        player_uid if a unique match is found, None otherwise

    Examples:
        >>> resolve_by_name("Patrick Mahomes")
        "a1b2c3d4-e5f6-..."

        >>> resolve_by_name("Josh Allen", position="QB")
        "x1y2z3..."  # Disambiguates from Josh Allen (WR/TE)
    """
    if not name:
        return None

    # Normalize name for matching
    import re
    name_norm = name.lower().strip()
    name_norm = re.sub(r"[^\w\s]", "", name_norm)
    name_norm = re.sub(r"\s+", " ", name_norm).strip()

    # Remove common suffixes
    for suffix in ["jr", "sr", "ii", "iii", "iv", "v"]:
        if name_norm.endswith(f" {suffix}"):
            name_norm = name_norm[:-len(suffix)-1]

    try:
        conn = _get_connection()

        # Build query based on available criteria
        query = "SELECT player_uid, canonical_name FROM players WHERE canonical_name_norm = ?"
        params: list = [name_norm]

        if position:
            query += " AND position = ?"
            params.append(position)

        if birth_date:
            query += " AND birth_date = ?"
            params.append(birth_date)

        if team:
            query += " AND current_nfl_team = ?"
            params.append(team)

        cursor = conn.execute(query, params)
        rows = cursor.fetchall()

        if len(rows) == 1:
            return rows[0]["player_uid"]
        elif len(rows) > 1:
            logger.warning(
                f"Multiple matches for name '{name}' with criteria: "
                f"position={position}, team={team}. Found {len(rows)} matches."
            )
            # Return first match but log warning
            return rows[0]["player_uid"]

        # Try alias lookup
        cursor = conn.execute("""
            SELECT DISTINCT pa.player_uid
            FROM player_aliases pa
            JOIN players p ON pa.player_uid = p.player_uid
            WHERE pa.alias_norm = ?
        """ + (" AND p.position = ?" if position else ""),
            [name_norm, position] if position else [name_norm]
        )

        rows = cursor.fetchall()
        if len(rows) == 1:
            return rows[0]["player_uid"]

        return None

    except sqlite3.Error as e:
        logger.error(f"Database error in resolve_by_name(): {e}")
        return None


@lru_cache(maxsize=1024)
def _get_cached_identifiers(player_uid: str) -> Dict[str, str]:
    """Cached helper to fetch all identifiers for a player."""
    try:
        conn = _get_connection()
        cursor = conn.execute("""
            SELECT source, external_id
            FROM player_identifiers
            WHERE player_uid = ?
        """, (player_uid,))

        return {row["source"]: row["external_id"] for row in cursor.fetchall()}

    except sqlite3.Error:
        return {}


def get_all_ids(player_uid: str) -> Dict[str, str]:
    """
    Get all known external IDs for a player.

    Args:
        player_uid: The canonical player UID

    Returns:
        Dict mapping source type to external ID

    Examples:
        >>> get_all_ids("a1b2c3d4-e5f6-...")
        {
            "sleeper": "4046",
            "espn": "3139477",
            "gsis": "00-0033873",
            "sportradar": "sr:player:123456",
            "yahoo": "29399"
        }
    """
    if not player_uid:
        return {}

    return dict(_get_cached_identifiers(player_uid))


def get_id(player_uid: str, source_type: SourceType) -> Optional[str]:
    """
    Get a specific external ID for a player.

    Args:
        player_uid: The canonical player UID
        source_type: The source platform to get the ID for

    Returns:
        The external ID if found, None otherwise

    Examples:
        >>> get_id("a1b2c3d4-e5f6-...", "sleeper")
        "4046"
    """
    all_ids = get_all_ids(player_uid)
    return all_ids.get(source_type)


@lru_cache(maxsize=1024)
def _get_cached_player(player_uid: str) -> Optional[Dict[str, Any]]:
    """Cached helper to fetch player record."""
    try:
        conn = _get_connection()
        cursor = conn.execute("""
            SELECT player_uid, canonical_name, position, birth_date,
                   college, current_nfl_team, status, nfl_debut_year
            FROM players
            WHERE player_uid = ?
        """, (player_uid,))

        row = cursor.fetchone()
        if row:
            return dict(row)
        return None

    except sqlite3.Error:
        return None


def get_canonical_name(player_uid: str) -> Optional[str]:
    """
    Get the canonical (display) name for a player.

    Args:
        player_uid: The canonical player UID

    Returns:
        The player's canonical name, or None if not found

    Examples:
        >>> get_canonical_name("a1b2c3d4-e5f6-...")
        "Patrick Mahomes"
    """
    player = _get_cached_player(player_uid)
    return player["canonical_name"] if player else None


def get_player(player_uid: str) -> Optional[Dict[str, Any]]:
    """
    Get full player record.

    Args:
        player_uid: The canonical player UID

    Returns:
        Dict with player data, or None if not found

    Examples:
        >>> get_player("a1b2c3d4-e5f6-...")
        {
            "player_uid": "a1b2c3d4-e5f6-...",
            "canonical_name": "Patrick Mahomes",
            "position": "QB",
            "birth_date": "1995-09-17",
            "college": "Texas Tech",
            "current_nfl_team": "KC",
            "status": "active",
            "nfl_debut_year": 2017
        }
    """
    player = _get_cached_player(player_uid)
    if player:
        return dict(player)  # Return a copy
    return None


def get_player_with_ids(player_uid: str) -> Optional[Dict[str, Any]]:
    """
    Get full player record including all external IDs.

    Args:
        player_uid: The canonical player UID

    Returns:
        Dict with player data and identifiers, or None if not found
    """
    player = get_player(player_uid)
    if player:
        player["identifiers"] = get_all_ids(player_uid)
    return player


# -----------------------------------------------------------------------------
# Batch Operations
# -----------------------------------------------------------------------------

def batch_resolve(
    source_ids: List[Union[str, int]],
    source_type: SourceType
) -> Dict[str, Optional[str]]:
    """
    Resolve multiple external IDs to player_uids in a single operation.

    More efficient than calling resolve() multiple times.

    Args:
        source_ids: List of external IDs to resolve
        source_type: The source platform for all IDs

    Returns:
        Dict mapping source_id -> player_uid (or None if not found)

    Examples:
        >>> batch_resolve(["4046", "1466", "3321"], "sleeper")
        {
            "4046": "a1b2c3d4-...",
            "1466": "e5f6g7h8-...",
            "3321": "i9j0k1l2-..."
        }
    """
    if not source_ids:
        return {}

    # Convert all to strings
    str_ids = [str(sid) for sid in source_ids]

    results: Dict[str, Optional[str]] = {sid: None for sid in str_ids}

    try:
        conn = _get_connection()

        # Use parameterized query with placeholders
        placeholders = ",".join("?" * len(str_ids))
        cursor = conn.execute(f"""
            SELECT external_id, player_uid
            FROM player_identifiers
            WHERE source = ? AND external_id IN ({placeholders})
        """, [source_type] + str_ids)

        for row in cursor.fetchall():
            results[row["external_id"]] = row["player_uid"]

    except sqlite3.Error as e:
        logger.error(f"Database error in batch_resolve(): {e}")

    return results


def batch_get_all_ids(player_uids: List[str]) -> Dict[str, Dict[str, str]]:
    """
    Get all external IDs for multiple players.

    Args:
        player_uids: List of player UIDs

    Returns:
        Dict mapping player_uid -> {source: external_id}

    Examples:
        >>> batch_get_all_ids(["uid1", "uid2"])
        {
            "uid1": {"sleeper": "4046", "espn": "3139477"},
            "uid2": {"sleeper": "1466", "espn": "15847"}
        }
    """
    if not player_uids:
        return {}

    results: Dict[str, Dict[str, str]] = {uid: {} for uid in player_uids}

    try:
        conn = _get_connection()

        placeholders = ",".join("?" * len(player_uids))
        cursor = conn.execute(f"""
            SELECT player_uid, source, external_id
            FROM player_identifiers
            WHERE player_uid IN ({placeholders})
        """, player_uids)

        for row in cursor.fetchall():
            uid = row["player_uid"]
            if uid in results:
                results[uid][row["source"]] = row["external_id"]

    except sqlite3.Error as e:
        logger.error(f"Database error in batch_get_all_ids(): {e}")

    return results


def batch_get_names(player_uids: List[str]) -> Dict[str, str]:
    """
    Get canonical names for multiple players.

    Args:
        player_uids: List of player UIDs

    Returns:
        Dict mapping player_uid -> canonical_name
    """
    if not player_uids:
        return {}

    results: Dict[str, str] = {}

    try:
        conn = _get_connection()

        placeholders = ",".join("?" * len(player_uids))
        cursor = conn.execute(f"""
            SELECT player_uid, canonical_name
            FROM players
            WHERE player_uid IN ({placeholders})
        """, player_uids)

        for row in cursor.fetchall():
            results[row["player_uid"]] = row["canonical_name"]

    except sqlite3.Error as e:
        logger.error(f"Database error in batch_get_names(): {e}")

    return results


# -----------------------------------------------------------------------------
# Search Functions
# -----------------------------------------------------------------------------

def search_players(
    query: str,
    position: Optional[str] = None,
    team: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20
) -> List[Dict[str, Any]]:
    """
    Search for players by name (partial match).

    Args:
        query: Search query (name or part of name)
        position: Optional position filter
        team: Optional team filter
        status: Optional status filter ("active", "retired", etc.)
        limit: Maximum number of results

    Returns:
        List of matching player records
    """
    import re
    query_norm = query.lower().strip()
    query_norm = re.sub(r"[^\w\s]", "", query_norm)

    try:
        conn = _get_connection()

        sql = """
            SELECT player_uid, canonical_name, position, current_nfl_team, status
            FROM players
            WHERE canonical_name_norm LIKE ?
        """
        params: list = [f"%{query_norm}%"]

        if position:
            sql += " AND position = ?"
            params.append(position)

        if team:
            sql += " AND current_nfl_team = ?"
            params.append(team)

        if status:
            sql += " AND status = ?"
            params.append(status)

        sql += " ORDER BY canonical_name LIMIT ?"
        params.append(limit)

        cursor = conn.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]

    except sqlite3.Error as e:
        logger.error(f"Database error in search_players(): {e}")
        return []


# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------

def player_exists(player_uid: str) -> bool:
    """Check if a player_uid exists in the database."""
    return get_player(player_uid) is not None


def identifier_exists(source_type: SourceType, external_id: str) -> bool:
    """Check if an identifier exists in the database."""
    return resolve(external_id, source_type) is not None


def get_stats() -> Dict[str, Any]:
    """
    Get database statistics.

    Returns:
        Dict with counts and statistics
    """
    try:
        conn = _get_connection()

        cursor = conn.execute("SELECT COUNT(*) FROM players")
        total_players = cursor.fetchone()[0]

        cursor = conn.execute("SELECT COUNT(*) FROM player_identifiers")
        total_identifiers = cursor.fetchone()[0]

        cursor = conn.execute("""
            SELECT source, COUNT(*) as count
            FROM player_identifiers
            GROUP BY source
            ORDER BY count DESC
        """)
        by_source = dict(cursor.fetchall())

        cursor = conn.execute("""
            SELECT status, COUNT(*) as count
            FROM players
            GROUP BY status
        """)
        by_status = dict(cursor.fetchall())

        return {
            "total_players": total_players,
            "total_identifiers": total_identifiers,
            "identifiers_by_source": by_source,
            "players_by_status": by_status
        }

    except sqlite3.Error as e:
        logger.error(f"Database error in get_stats(): {e}")
        return {}


def clear_cache() -> None:
    """Clear all internal caches."""
    _get_cached_player.cache_clear()
    _get_cached_identifiers.cache_clear()


# -----------------------------------------------------------------------------
# Context Manager Support
# -----------------------------------------------------------------------------

class PlayerLookup:
    """
    Context manager for player lookup operations.

    Useful when you want explicit control over connection lifecycle.

    Example:
        with PlayerLookup() as lookup:
            uid = lookup.resolve("4046", "sleeper")
            name = lookup.get_canonical_name(uid)
    """

    def __init__(self, db_path: Union[str, Path] = DEFAULT_DB_PATH):
        self.db_path = Path(db_path)

    def __enter__(self):
        configure(self.db_path)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        close_connection()
        return False

    # Delegate to module functions
    def resolve(self, source_id, source_type, **kwargs):
        return resolve(source_id, source_type, **kwargs)

    def resolve_by_name(self, name, **kwargs):
        return resolve_by_name(name, **kwargs)

    def get_all_ids(self, player_uid):
        return get_all_ids(player_uid)

    def get_canonical_name(self, player_uid):
        return get_canonical_name(player_uid)

    def batch_resolve(self, source_ids, source_type):
        return batch_resolve(source_ids, source_type)


# -----------------------------------------------------------------------------
# CLI Interface
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Player Lookup CLI")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # resolve command
    resolve_parser = subparsers.add_parser("resolve", help="Resolve an external ID")
    resolve_parser.add_argument("external_id", help="External ID to resolve")
    resolve_parser.add_argument("source", help="Source type (sleeper, espn, gsis, etc.)")

    # lookup command
    lookup_parser = subparsers.add_parser("lookup", help="Look up a player by name")
    lookup_parser.add_argument("name", help="Player name")
    lookup_parser.add_argument("--position", help="Position filter")
    lookup_parser.add_argument("--team", help="Team filter")

    # get-ids command
    getids_parser = subparsers.add_parser("get-ids", help="Get all IDs for a player")
    getids_parser.add_argument("player_uid", help="Player UID")

    # stats command
    subparsers.add_parser("stats", help="Show database statistics")

    # search command
    search_parser = subparsers.add_parser("search", help="Search for players")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("--position", help="Position filter")
    search_parser.add_argument("--limit", type=int, default=10, help="Max results")

    args = parser.parse_args()

    if args.command == "resolve":
        result = resolve(args.external_id, args.source)
        if result:
            name = get_canonical_name(result)
            print(f"player_uid: {result}")
            print(f"name: {name}")
            print(f"all_ids: {get_all_ids(result)}")
        else:
            print(f"No match found for {args.source}:{args.external_id}")

    elif args.command == "lookup":
        result = resolve_by_name(args.name, position=args.position, team=args.team)
        if result:
            player = get_player_with_ids(result)
            import json
            print(json.dumps(player, indent=2))
        else:
            print(f"No match found for name: {args.name}")

    elif args.command == "get-ids":
        ids = get_all_ids(args.player_uid)
        if ids:
            name = get_canonical_name(args.player_uid)
            print(f"Player: {name}")
            print("IDs:")
            for source, ext_id in sorted(ids.items()):
                print(f"  {source}: {ext_id}")
        else:
            print(f"No player found with UID: {args.player_uid}")

    elif args.command == "stats":
        import json
        stats = get_stats()
        print(json.dumps(stats, indent=2))

    elif args.command == "search":
        results = search_players(
            args.query,
            position=args.position,
            limit=args.limit
        )
        if results:
            for p in results:
                print(f"{p['canonical_name']} ({p['position']}) - {p['current_nfl_team']} [{p['status']}]")
        else:
            print(f"No players found matching: {args.query}")

    else:
        parser.print_help()
