"""
Database management package.

This package provides tools for initializing and managing the
unified player identity database.

Modules:
    init_db: Database initialization and schema management
"""

from scripts.db.init_db import (
    PlayerIdentityDB,
    PlayerRecord,
    IdentifierRecord,
    normalize_name,
    generate_player_uid,
    generate_deterministic_uid,
)

__all__ = [
    "PlayerIdentityDB",
    "PlayerRecord",
    "IdentifierRecord",
    "normalize_name",
    "generate_player_uid",
    "generate_deterministic_uid",
]
