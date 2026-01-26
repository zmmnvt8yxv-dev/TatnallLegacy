"""
Shared library modules for TatnallLegacy scripts.

This package contains reusable utilities and APIs that other scripts
should use for common operations.

Modules:
    player_lookup: Centralized API for player identity resolution
"""

from scripts.lib.player_lookup import (
    resolve,
    resolve_by_name,
    get_all_ids,
    get_id,
    get_canonical_name,
    get_player,
    get_player_with_ids,
    batch_resolve,
    batch_get_all_ids,
    batch_get_names,
    search_players,
    configure,
    clear_cache,
    PlayerLookup,
)

__all__ = [
    "resolve",
    "resolve_by_name",
    "get_all_ids",
    "get_id",
    "get_canonical_name",
    "get_player",
    "get_player_with_ids",
    "batch_resolve",
    "batch_get_all_ids",
    "batch_get_names",
    "search_players",
    "configure",
    "clear_cache",
    "PlayerLookup",
]
