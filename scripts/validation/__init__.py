"""
Validation Framework for Tatnall Legacy Data Pipeline

This module provides:
- Pydantic-compatible dataclass schemas for all data types
- Pre-insert validation functions
- Post-build verification utilities
- CI integration helpers
"""

from scripts.validation.schemas import (
    # Player schemas
    PlayerSchema,
    PlayerIdentifierSchema,
    PlayerAliasSchema,

    # Stats schemas
    NFLGameSchema,
    PlayerGameStatsSchema,
    PlayerSeasonStatsSchema,

    # League schemas
    FantasyTeamSchema,
    TransactionSchema,
    LineupSchema,
    MatchupSchema,

    # Validation utilities
    ValidationResult,
    ValidationError,
    validate_record,
    validate_batch,
)

from scripts.validation.validate import (
    DataValidator,
    validate_pre_insert,
    validate_post_build,
    run_ci_validation,
)

__all__ = [
    # Schemas
    "PlayerSchema",
    "PlayerIdentifierSchema",
    "PlayerAliasSchema",
    "NFLGameSchema",
    "PlayerGameStatsSchema",
    "PlayerSeasonStatsSchema",
    "FantasyTeamSchema",
    "TransactionSchema",
    "LineupSchema",
    "MatchupSchema",
    # Utilities
    "ValidationResult",
    "ValidationError",
    "validate_record",
    "validate_batch",
    "DataValidator",
    "validate_pre_insert",
    "validate_post_build",
    "run_ci_validation",
]
