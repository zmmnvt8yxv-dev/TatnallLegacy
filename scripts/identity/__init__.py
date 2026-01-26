"""
Identity resolution package.

This package provides tools for resolving player identities across
different data sources (Sleeper, ESPN, NFLverse, Sportradar, etc.).

Modules:
    resolver: Multi-pass identity resolution engine with confidence scoring
    load_all_sources: Bootstrap the identity database from all data sources
"""

from scripts.identity.resolver import (
    IdentityResolver,
    ResolutionResult,
    resolve_player,
    normalize_name,
    normalize_dob,
)

__all__ = [
    "IdentityResolver",
    "ResolutionResult",
    "resolve_player",
    "normalize_name",
    "normalize_dob",
]
