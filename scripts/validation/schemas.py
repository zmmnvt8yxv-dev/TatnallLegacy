#!/usr/bin/env python3
"""
Schema Validation Framework

Defines Pydantic-compatible dataclass schemas for all data types in the pipeline:
- Player identity schemas (players, identifiers, aliases)
- Stats schemas (games, player stats, aggregations)
- League schemas (transactions, lineups, matchups)

Each schema includes validation rules matching the SQL schema constraints.

Usage:
    from scripts.validation.schemas import PlayerSchema, validate_record

    # Validate a player record
    result = validate_record(PlayerSchema, player_dict)
    if not result.valid:
        print(f"Validation errors: {result.errors}")

    # Batch validation
    results = validate_batch(PlayerSchema, players_list)
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Tuple, Type, TypeVar, Union

# Type definitions matching SQL schema CHECK constraints
SourceType = Literal[
    "sleeper", "espn", "gsis", "sportradar", "yahoo", "pfr",
    "rotowire", "nflverse", "fantasy_data", "cbs", "fleaflicker", "mfl"
]

MatchMethodType = Literal[
    "exact", "crosswalk", "name_dob", "name_only", "fuzzy", "manual", "inferred"
]

PlayerStatusType = Literal[
    "active", "practice", "injured", "suspended", "retired", "unsigned", "unknown"
]

PositionType = Literal[
    "QB", "RB", "WR", "TE", "K", "DEF",
    "FB", "OL", "OT", "OG", "C",
    "DL", "DE", "DT", "NT",
    "LB", "ILB", "OLB", "MLB",
    "DB", "CB", "S", "FS", "SS",
    "LS", "P", None
]

SeasonTypeEnum = Literal["PRE", "REG", "POST", "ALL"]

GameStatusType = Literal["scheduled", "in_progress", "final", "postponed", "cancelled"]

TransactionType = Literal[
    "add", "drop", "waiver", "trade", "trade_add", "trade_drop",
    "ir", "taxi", "commissioner"
]

TransactionStatus = Literal["complete", "failed", "vetoed", "pending", "cancelled"]

TransactionAction = Literal["added", "dropped"]

MatchupType = Literal["regular", "playoff", "consolation", "championship", "toilet_bowl"]

AliasType = Literal[
    "variation", "nickname", "maiden", "misspelling",
    "abbreviation", "legal", "broadcast"
]

NameHistoryReason = Literal[
    "initial", "legal_change", "correction", "marriage", "preference", "other"
]


# Validation result types
@dataclass
class ValidationError:
    """A single validation error."""
    field: str
    message: str
    value: Any = None
    constraint: Optional[str] = None


@dataclass
class ValidationResult:
    """Result of validating a record."""
    valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    warnings: List[ValidationError] = field(default_factory=list)
    record_type: Optional[str] = None
    record_id: Optional[str] = None

    def add_error(self, field: str, message: str, value: Any = None, constraint: str = None) -> None:
        """Add a validation error."""
        self.errors.append(ValidationError(field, message, value, constraint))
        self.valid = False

    def add_warning(self, field: str, message: str, value: Any = None) -> None:
        """Add a validation warning (doesn't fail validation)."""
        self.warnings.append(ValidationError(field, message, value))


# =============================================================================
# PLAYER IDENTITY SCHEMAS
# =============================================================================

@dataclass
class PlayerSchema:
    """
    Schema for player identity records.

    Validates against the players table in schema.sql.
    """
    player_uid: str
    canonical_name: str
    canonical_name_norm: Optional[str] = None  # Auto-generated if not provided

    # Optional fields
    position: Optional[PositionType] = None
    birth_date: Optional[str] = None
    college: Optional[str] = None
    nfl_debut_year: Optional[int] = None
    nfl_final_year: Optional[int] = None
    height_inches: Optional[int] = None
    weight_lbs: Optional[int] = None
    current_nfl_team: Optional[str] = None
    status: PlayerStatusType = "active"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this player record."""
        result = ValidationResult(valid=True, record_type="player", record_id=self.player_uid)

        # player_uid must be 36 chars (UUID format)
        if not self.player_uid:
            result.add_error("player_uid", "player_uid is required")
        elif len(self.player_uid) != 36:
            result.add_error("player_uid", f"player_uid must be 36 characters, got {len(self.player_uid)}", self.player_uid, "CHECK(length(player_uid) = 36)")

        # canonical_name is required
        if not self.canonical_name or not self.canonical_name.strip():
            result.add_error("canonical_name", "canonical_name is required and cannot be empty")

        # Validate position if provided
        valid_positions = {
            "QB", "RB", "WR", "TE", "K", "DEF",
            "FB", "OL", "OT", "OG", "C",
            "DL", "DE", "DT", "NT",
            "LB", "ILB", "OLB", "MLB",
            "DB", "CB", "S", "FS", "SS",
            "LS", "P", None
        }
        if self.position and self.position not in valid_positions:
            result.add_error("position", f"Invalid position: {self.position}", self.position)

        # Validate birth_date format if provided
        if self.birth_date:
            if not _is_valid_date(self.birth_date):
                result.add_error("birth_date", "birth_date must be in YYYY-MM-DD format", self.birth_date)

        # Validate year ranges
        if self.nfl_debut_year is not None:
            if self.nfl_debut_year < 1920 or self.nfl_debut_year > 2100:
                result.add_error("nfl_debut_year", "nfl_debut_year must be between 1920 and 2100", self.nfl_debut_year)

        if self.nfl_final_year is not None:
            if self.nfl_final_year < 1920 or self.nfl_final_year > 2100:
                result.add_error("nfl_final_year", "nfl_final_year must be between 1920 and 2100", self.nfl_final_year)

            if self.nfl_debut_year is not None and self.nfl_final_year < self.nfl_debut_year:
                result.add_error("nfl_final_year", "nfl_final_year cannot be before nfl_debut_year", self.nfl_final_year)

        # Validate physical attributes
        if self.height_inches is not None:
            if self.height_inches <= 0 or self.height_inches >= 100:
                result.add_error("height_inches", "height_inches must be between 1 and 99", self.height_inches)

        if self.weight_lbs is not None:
            if self.weight_lbs <= 0 or self.weight_lbs >= 500:
                result.add_error("weight_lbs", "weight_lbs must be between 1 and 499", self.weight_lbs)

        # Validate status
        valid_statuses = {"active", "practice", "injured", "suspended", "retired", "unsigned", "unknown"}
        if self.status and self.status not in valid_statuses:
            result.add_error("status", f"Invalid status: {self.status}", self.status)

        return result


@dataclass
class PlayerIdentifierSchema:
    """
    Schema for external identifier mappings.

    Validates against the player_identifiers table.
    """
    player_uid: str
    source: SourceType
    external_id: str
    confidence: float = 1.0
    match_method: MatchMethodType = "exact"
    verified_at: Optional[str] = None
    verified_by: Optional[str] = None
    last_seen_at: Optional[str] = None
    match_attempts: int = 1
    notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this identifier record."""
        result = ValidationResult(valid=True, record_type="player_identifier", record_id=f"{self.source}:{self.external_id}")

        # player_uid required
        if not self.player_uid:
            result.add_error("player_uid", "player_uid is required")
        elif len(self.player_uid) != 36:
            result.add_error("player_uid", f"player_uid must be 36 characters", self.player_uid)

        # source must be valid
        valid_sources = {
            "sleeper", "espn", "gsis", "sportradar", "yahoo", "pfr",
            "rotowire", "nflverse", "fantasy_data", "cbs", "fleaflicker", "mfl"
        }
        if not self.source:
            result.add_error("source", "source is required")
        elif self.source not in valid_sources:
            result.add_error("source", f"Invalid source: {self.source}", self.source)

        # external_id required
        if not self.external_id:
            result.add_error("external_id", "external_id is required")

        # confidence must be 0.0-1.0
        if self.confidence < 0.0 or self.confidence > 1.0:
            result.add_error("confidence", "confidence must be between 0.0 and 1.0", self.confidence)

        # match_method must be valid
        valid_methods = {"exact", "crosswalk", "name_dob", "name_only", "fuzzy", "manual", "inferred"}
        if self.match_method and self.match_method not in valid_methods:
            result.add_error("match_method", f"Invalid match_method: {self.match_method}", self.match_method)

        # Validate datetime fields
        if self.verified_at and not _is_valid_datetime(self.verified_at):
            result.add_error("verified_at", "verified_at must be a valid datetime", self.verified_at)

        return result


@dataclass
class PlayerAliasSchema:
    """Schema for player name aliases."""
    player_uid: str
    alias: str
    alias_norm: Optional[str] = None
    source: Optional[str] = None
    alias_type: AliasType = "variation"
    created_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this alias record."""
        result = ValidationResult(valid=True, record_type="player_alias", record_id=f"{self.player_uid}:{self.alias}")

        if not self.player_uid:
            result.add_error("player_uid", "player_uid is required")
        elif len(self.player_uid) != 36:
            result.add_error("player_uid", "player_uid must be 36 characters", self.player_uid)

        if not self.alias or not self.alias.strip():
            result.add_error("alias", "alias is required and cannot be empty")

        valid_types = {"variation", "nickname", "maiden", "misspelling", "abbreviation", "legal", "broadcast"}
        if self.alias_type and self.alias_type not in valid_types:
            result.add_error("alias_type", f"Invalid alias_type: {self.alias_type}", self.alias_type)

        return result


# =============================================================================
# STATS SCHEMAS
# =============================================================================

@dataclass
class NFLGameSchema:
    """
    Schema for NFL game records.

    Validates against the nfl_games table.
    """
    game_id: str
    season: int
    week: int
    home_team: str
    away_team: str
    season_type: SeasonTypeEnum = "REG"
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    game_date: Optional[str] = None
    game_time: Optional[str] = None
    game_datetime: Optional[str] = None
    status: GameStatusType = "scheduled"
    stadium: Optional[str] = None
    location: Optional[str] = None
    roof_type: Optional[Literal["dome", "open", "retractable"]] = None
    surface: Optional[Literal["grass", "turf"]] = None
    weather_temp: Optional[int] = None
    weather_wind: Optional[int] = None
    weather_condition: Optional[str] = None
    spread_line: Optional[float] = None
    over_under: Optional[float] = None
    source: str = "nflverse"
    source_game_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this game record."""
        result = ValidationResult(valid=True, record_type="nfl_game", record_id=self.game_id)

        # game_id required
        if not self.game_id:
            result.add_error("game_id", "game_id is required")

        # season validation
        if self.season < 2000 or self.season > 2100:
            result.add_error("season", "season must be between 2000 and 2100", self.season)

        # week validation
        if self.week < 0 or self.week > 22:
            result.add_error("week", "week must be between 0 and 22", self.week)

        # season_type validation
        valid_season_types = {"PRE", "REG", "POST"}
        if self.season_type not in valid_season_types:
            result.add_error("season_type", f"Invalid season_type: {self.season_type}", self.season_type)

        # Teams required
        if not self.home_team:
            result.add_error("home_team", "home_team is required")
        if not self.away_team:
            result.add_error("away_team", "away_team is required")

        # Status validation
        valid_statuses = {"scheduled", "in_progress", "final", "postponed", "cancelled"}
        if self.status and self.status not in valid_statuses:
            result.add_error("status", f"Invalid status: {self.status}", self.status)

        # Date validation
        if self.game_date and not _is_valid_date(self.game_date):
            result.add_error("game_date", "game_date must be in YYYY-MM-DD format", self.game_date)

        # roof_type validation
        if self.roof_type and self.roof_type not in {"dome", "open", "retractable"}:
            result.add_error("roof_type", f"Invalid roof_type: {self.roof_type}", self.roof_type)

        # surface validation
        if self.surface and self.surface not in {"grass", "turf"}:
            result.add_error("surface", f"Invalid surface: {self.surface}", self.surface)

        return result


@dataclass
class PlayerGameStatsSchema:
    """
    Schema for player game statistics.

    Validates against the player_game_stats table.
    """
    player_uid: str
    game_id: str
    season: int
    week: int
    stats: Union[Dict[str, Any], str]  # JSON or dict
    team: Optional[str] = None
    opponent: Optional[str] = None
    is_home: int = 0
    position: Optional[str] = None
    played: int = 1
    started: Optional[int] = None
    snap_count: Optional[int] = None
    snap_pct: Optional[float] = None
    fantasy_points_ppr: Optional[float] = None
    fantasy_points_half: Optional[float] = None
    fantasy_points_std: Optional[float] = None
    fantasy_points_custom: Optional[float] = None
    source: str = "nflverse"
    source_player_id: Optional[str] = None
    source_game_id: Optional[str] = None
    version: int = 1
    is_current: int = 1
    superseded_by: Optional[int] = None
    correction_reason: Optional[str] = None
    imported_at: Optional[str] = None
    updated_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this player game stats record."""
        result = ValidationResult(valid=True, record_type="player_game_stats", record_id=f"{self.player_uid}:{self.game_id}")

        # player_uid required
        if not self.player_uid:
            result.add_error("player_uid", "player_uid is required")

        # game_id required
        if not self.game_id:
            result.add_error("game_id", "game_id is required")

        # season validation
        if self.season < 2000 or self.season > 2100:
            result.add_error("season", "season must be between 2000 and 2100", self.season)

        # week validation
        if self.week < 0 or self.week > 22:
            result.add_error("week", "week must be between 0 and 22", self.week)

        # stats must be valid JSON or dict
        if self.stats:
            if isinstance(self.stats, str):
                try:
                    json.loads(self.stats)
                except json.JSONDecodeError:
                    result.add_error("stats", "stats must be valid JSON", self.stats)

        # is_home must be 0 or 1
        if self.is_home not in {0, 1}:
            result.add_error("is_home", "is_home must be 0 or 1", self.is_home)

        # played must be 0 or 1
        if self.played not in {0, 1}:
            result.add_error("played", "played must be 0 or 1", self.played)

        # is_current must be 0 or 1
        if self.is_current not in {0, 1}:
            result.add_error("is_current", "is_current must be 0 or 1", self.is_current)

        # Validate snap_pct range if provided
        if self.snap_pct is not None:
            if self.snap_pct < 0 or self.snap_pct > 100:
                result.add_error("snap_pct", "snap_pct must be between 0 and 100", self.snap_pct)

        return result


@dataclass
class PlayerSeasonStatsSchema:
    """
    Schema for player season statistics.

    Validates against the player_season_stats table.
    """
    player_uid: str
    season: int
    stats: Union[Dict[str, Any], str]
    season_type: SeasonTypeEnum = "REG"
    team: Optional[str] = None
    teams_played_for: Optional[str] = None
    position: Optional[str] = None
    games_played: int = 0
    games_started: int = 0
    total_snaps: Optional[int] = None
    avg_snap_pct: Optional[float] = None
    fantasy_points_ppr: Optional[float] = None
    fantasy_points_half: Optional[float] = None
    fantasy_points_std: Optional[float] = None
    fantasy_points_custom: Optional[float] = None
    fantasy_ppg_ppr: Optional[float] = None
    fantasy_ppg_half: Optional[float] = None
    fantasy_ppg_std: Optional[float] = None
    metrics: Optional[Union[Dict[str, Any], str]] = None
    source: str = "computed"
    computation_method: Optional[str] = None
    computed_at: Optional[str] = None
    updated_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this player season stats record."""
        result = ValidationResult(valid=True, record_type="player_season_stats", record_id=f"{self.player_uid}:{self.season}")

        if not self.player_uid:
            result.add_error("player_uid", "player_uid is required")

        if self.season < 2000 or self.season > 2100:
            result.add_error("season", "season must be between 2000 and 2100", self.season)

        valid_season_types = {"REG", "POST", "ALL"}
        if self.season_type not in valid_season_types:
            result.add_error("season_type", f"Invalid season_type: {self.season_type}", self.season_type)

        if self.games_played < 0:
            result.add_error("games_played", "games_played cannot be negative", self.games_played)

        if self.games_started < 0:
            result.add_error("games_started", "games_started cannot be negative", self.games_started)

        if self.games_started > self.games_played:
            result.add_warning("games_started", "games_started exceeds games_played", self.games_started)

        return result


# =============================================================================
# LEAGUE SCHEMAS
# =============================================================================

@dataclass
class FantasyTeamSchema:
    """Schema for fantasy team records."""
    team_id: str
    season: int
    team_name: str
    source: Literal["espn", "sleeper"]
    owner_name: Optional[str] = None
    owner_id: Optional[str] = None
    source_league_id: Optional[str] = None
    created_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this fantasy team record."""
        result = ValidationResult(valid=True, record_type="fantasy_team", record_id=f"{self.source}:{self.season}:{self.team_id}")

        if not self.team_id:
            result.add_error("team_id", "team_id is required")

        if self.season < 2000 or self.season > 2100:
            result.add_error("season", "season must be between 2000 and 2100", self.season)

        if not self.team_name or not self.team_name.strip():
            result.add_error("team_name", "team_name is required")

        if self.source not in {"espn", "sleeper"}:
            result.add_error("source", f"Invalid source: {self.source}", self.source)

        return result


@dataclass
class TransactionSchema:
    """
    Schema for unified transaction records.

    Validates against the unified_transactions table.
    """
    transaction_id: str
    season: int
    week: int
    transaction_type: TransactionType
    team_id: str
    action: TransactionAction
    source: Literal["espn", "sleeper"]
    status: TransactionStatus = "complete"
    team_name: Optional[str] = None
    player_uid: Optional[str] = None
    trade_group_id: Optional[str] = None
    trade_partner_team_id: Optional[str] = None
    waiver_bid: Optional[int] = None
    waiver_priority: Optional[int] = None
    draft_picks_json: Optional[str] = None
    transaction_timestamp: Optional[int] = None
    processed_at: Optional[str] = None
    source_league_id: Optional[str] = None
    source_transaction_id: Optional[str] = None
    source_data_json: Optional[str] = None
    source_player_id: Optional[str] = None
    resolution_confidence: Optional[float] = None
    resolution_method: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this transaction record."""
        result = ValidationResult(valid=True, record_type="transaction", record_id=self.transaction_id)

        if not self.transaction_id:
            result.add_error("transaction_id", "transaction_id is required")

        if self.season < 2000 or self.season > 2100:
            result.add_error("season", "season must be between 2000 and 2100", self.season)

        if self.week < 0 or self.week > 22:
            result.add_error("week", "week must be between 0 and 22", self.week)

        valid_types = {"add", "drop", "waiver", "trade", "trade_add", "trade_drop", "ir", "taxi", "commissioner"}
        if self.transaction_type not in valid_types:
            result.add_error("transaction_type", f"Invalid transaction_type: {self.transaction_type}", self.transaction_type)

        valid_statuses = {"complete", "failed", "vetoed", "pending", "cancelled"}
        if self.status not in valid_statuses:
            result.add_error("status", f"Invalid status: {self.status}", self.status)

        if not self.team_id:
            result.add_error("team_id", "team_id is required")

        valid_actions = {"added", "dropped"}
        if self.action not in valid_actions:
            result.add_error("action", f"Invalid action: {self.action}", self.action)

        if self.source not in {"espn", "sleeper"}:
            result.add_error("source", f"Invalid source: {self.source}", self.source)

        # Warn if trade but no trade_group_id
        if self.transaction_type in {"trade", "trade_add", "trade_drop"} and not self.trade_group_id:
            result.add_warning("trade_group_id", "trade_group_id recommended for trade transactions")

        # Validate confidence range
        if self.resolution_confidence is not None:
            if self.resolution_confidence < 0 or self.resolution_confidence > 1:
                result.add_error("resolution_confidence", "resolution_confidence must be between 0 and 1", self.resolution_confidence)

        return result


@dataclass
class LineupSchema:
    """
    Schema for unified lineup records.

    Validates against the unified_lineups table.
    """
    season: int
    week: int
    team_id: str
    slot: str
    source: Literal["espn", "sleeper"]
    team_name: Optional[str] = None
    matchup_id: Optional[int] = None
    player_uid: Optional[str] = None
    slot_index: Optional[int] = None
    is_starter: int = 0
    points_actual: Optional[float] = None
    points_projected: Optional[float] = None
    source_player_id: Optional[str] = None
    source_slot_id: Optional[str] = None
    resolution_confidence: Optional[float] = None
    resolution_method: Optional[str] = None
    created_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this lineup record."""
        result = ValidationResult(valid=True, record_type="lineup", record_id=f"{self.team_id}:{self.season}:{self.week}:{self.slot}")

        if self.season < 2000 or self.season > 2100:
            result.add_error("season", "season must be between 2000 and 2100", self.season)

        if self.week < 0 or self.week > 22:
            result.add_error("week", "week must be between 0 and 22", self.week)

        if not self.team_id:
            result.add_error("team_id", "team_id is required")

        if not self.slot:
            result.add_error("slot", "slot is required")

        if self.is_starter not in {0, 1}:
            result.add_error("is_starter", "is_starter must be 0 or 1", self.is_starter)

        if self.source not in {"espn", "sleeper"}:
            result.add_error("source", f"Invalid source: {self.source}", self.source)

        return result


@dataclass
class MatchupSchema:
    """
    Schema for unified matchup records.

    Validates against the unified_matchups table.
    """
    season: int
    week: int
    home_team_id: str
    away_team_id: str
    source: Literal["espn", "sleeper", "manual"]
    matchup_type: MatchupType = "regular"
    home_team_name: Optional[str] = None
    away_team_name: Optional[str] = None
    home_score: Optional[float] = None
    away_score: Optional[float] = None
    margin: Optional[float] = None
    winner_team_id: Optional[str] = None
    nfl_week_info: Optional[str] = None
    playoff_seed_home: Optional[int] = None
    playoff_seed_away: Optional[int] = None
    elimination_game: int = 0
    source_matchup_id: Optional[str] = None
    created_at: Optional[str] = None

    def validate(self) -> ValidationResult:
        """Validate this matchup record."""
        result = ValidationResult(valid=True, record_type="matchup", record_id=f"{self.season}:{self.week}:{self.home_team_id}:{self.away_team_id}")

        if self.season < 2000 or self.season > 2100:
            result.add_error("season", "season must be between 2000 and 2100", self.season)

        if self.week < 0 or self.week > 22:
            result.add_error("week", "week must be between 0 and 22", self.week)

        if not self.home_team_id:
            result.add_error("home_team_id", "home_team_id is required")

        if not self.away_team_id:
            result.add_error("away_team_id", "away_team_id is required")

        valid_types = {"regular", "playoff", "consolation", "championship", "toilet_bowl"}
        if self.matchup_type not in valid_types:
            result.add_error("matchup_type", f"Invalid matchup_type: {self.matchup_type}", self.matchup_type)

        if self.source not in {"espn", "sleeper", "manual"}:
            result.add_error("source", f"Invalid source: {self.source}", self.source)

        if self.elimination_game not in {0, 1}:
            result.add_error("elimination_game", "elimination_game must be 0 or 1", self.elimination_game)

        # Validate margin consistency
        if self.home_score is not None and self.away_score is not None:
            expected_margin = self.home_score - self.away_score
            if self.margin is not None and abs(self.margin - expected_margin) > 0.01:
                result.add_warning("margin", f"margin ({self.margin}) doesn't match score difference ({expected_margin})")

        return result


# =============================================================================
# VALIDATION UTILITY FUNCTIONS
# =============================================================================

def _is_valid_date(date_str: str) -> bool:
    """Check if a string is a valid YYYY-MM-DD date."""
    if not date_str:
        return False
    try:
        datetime.strptime(date_str[:10], "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _is_valid_datetime(dt_str: str) -> bool:
    """Check if a string is a valid datetime."""
    if not dt_str:
        return False
    try:
        # Try ISO format
        datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return True
    except ValueError:
        pass
    try:
        # Try common format
        datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        return True
    except ValueError:
        return False


T = TypeVar("T")


def validate_record(
    schema_class: Type[T],
    data: Dict[str, Any],
    strict: bool = False
) -> ValidationResult:
    """
    Validate a data dictionary against a schema class.

    Args:
        schema_class: The schema dataclass to validate against
        data: Dictionary of field values
        strict: If True, treat warnings as errors

    Returns:
        ValidationResult with validation status and any errors
    """
    try:
        # Filter data to only include fields defined in the schema
        schema_fields = {f.name for f in schema_class.__dataclass_fields__.values()}
        filtered_data = {k: v for k, v in data.items() if k in schema_fields}

        # Create instance and validate
        instance = schema_class(**filtered_data)
        result = instance.validate()

        if strict and result.warnings:
            for warning in result.warnings:
                result.add_error(warning.field, warning.message, warning.value)

        return result

    except TypeError as e:
        result = ValidationResult(valid=False, record_type=schema_class.__name__)
        result.add_error("_schema", f"Failed to create schema instance: {e}")
        return result
    except Exception as e:
        result = ValidationResult(valid=False, record_type=schema_class.__name__)
        result.add_error("_unknown", f"Unexpected validation error: {e}")
        return result


def validate_batch(
    schema_class: Type[T],
    records: List[Dict[str, Any]],
    stop_on_first_error: bool = False,
    strict: bool = False
) -> Tuple[List[ValidationResult], int, int]:
    """
    Validate a batch of records against a schema.

    Args:
        schema_class: The schema dataclass to validate against
        records: List of dictionaries to validate
        stop_on_first_error: If True, stop after first invalid record
        strict: If True, treat warnings as errors

    Returns:
        Tuple of (list of results, valid_count, invalid_count)
    """
    results = []
    valid_count = 0
    invalid_count = 0

    for record in records:
        result = validate_record(schema_class, record, strict)
        results.append(result)

        if result.valid:
            valid_count += 1
        else:
            invalid_count += 1
            if stop_on_first_error:
                break

    return results, valid_count, invalid_count


# Schema registry for dynamic lookup
SCHEMA_REGISTRY: Dict[str, Type] = {
    "player": PlayerSchema,
    "player_identifier": PlayerIdentifierSchema,
    "player_alias": PlayerAliasSchema,
    "nfl_game": NFLGameSchema,
    "player_game_stats": PlayerGameStatsSchema,
    "player_season_stats": PlayerSeasonStatsSchema,
    "fantasy_team": FantasyTeamSchema,
    "transaction": TransactionSchema,
    "lineup": LineupSchema,
    "matchup": MatchupSchema,
}


def get_schema(schema_name: str) -> Optional[Type]:
    """Get a schema class by name."""
    return SCHEMA_REGISTRY.get(schema_name.lower())


if __name__ == "__main__":
    # Example usage
    import sys

    # Test player validation
    valid_player = {
        "player_uid": "12345678-1234-1234-1234-123456789012",
        "canonical_name": "Patrick Mahomes",
        "position": "QB",
        "birth_date": "1995-09-17",
        "status": "active"
    }

    invalid_player = {
        "player_uid": "short",  # Invalid - not 36 chars
        "canonical_name": "",  # Invalid - empty
        "position": "INVALID",  # Invalid position
        "nfl_debut_year": 1800,  # Invalid - too early
    }

    print("Valid player test:")
    result = validate_record(PlayerSchema, valid_player)
    print(f"  Valid: {result.valid}")
    print(f"  Errors: {len(result.errors)}")

    print("\nInvalid player test:")
    result = validate_record(PlayerSchema, invalid_player)
    print(f"  Valid: {result.valid}")
    print(f"  Errors: {len(result.errors)}")
    for error in result.errors:
        print(f"    - {error.field}: {error.message}")

    sys.exit(0 if result.valid else 1)
