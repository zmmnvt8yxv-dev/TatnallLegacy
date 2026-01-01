from __future__ import annotations

from typing import Any, Dict

SCHEMA_VERSION = "1.0.0"
SCHEMA_URI = "https://json-schema.org/draft/2020-12/schema"

TEAM_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "team_id": {"type": ["integer", "null"]},
        "team_name": {"type": "string"},
        "owner": {"type": ["string", "null"]},
        "record": {"type": ["string", "null"]},
        "points_for": {"type": ["number", "null"]},
        "points_against": {"type": ["number", "null"]},
        "regular_season_rank": {"type": ["integer", "null"]},
        "final_rank": {"type": ["integer", "null"]},
    },
}

MATCHUP_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "week": {"type": ["integer", "null"]},
        "home_team": {"type": ["string", "null"]},
        "home_score": {"type": ["number", "null"]},
        "away_team": {"type": ["string", "null"]},
        "away_score": {"type": ["number", "null"]},
        "is_playoff": {"type": ["boolean", "null"]},
    },
}

TRANSACTION_ENTRY_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "type": {"type": "string"},
        "team": {"type": ["string", "null"]},
        "player": {"type": ["string", "null"]},
        "faab": {"type": ["number", "null"]},
    },
}

TRANSACTION_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["date", "entries"],
    "properties": {
        "date": {"type": "string"},
        "entries": {"type": "array", "items": TRANSACTION_ENTRY_SCHEMA},
    },
}

DRAFT_PICK_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "round": {"type": ["integer", "null"]},
        "overall": {"type": ["integer", "null"]},
        "team": {"type": ["string", "null"]},
        "player": {"type": ["string", "null"]},
        "player_nfl": {"type": ["string", "null"]},
        "keeper": {"type": ["boolean", "null"]},
    },
}

POWER_RANKING_ENTRY_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["week", "team", "rank"],
    "properties": {
        "week": {"type": "integer"},
        "team": {"type": "string"},
        "rank": {"type": "integer"},
        "record": {"type": ["string", "null"]},
        "points_for": {"type": ["number", "null"]},
        "note": {"type": ["string", "null"]},
    },
}

WEEKLY_RECAP_ENTRY_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["week", "title", "summary"],
    "properties": {
        "week": {"type": "integer"},
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "highlights": {"type": "array", "items": {"type": "string"}},
        "notable_teams": {"type": "array", "items": {"type": "string"}},
    },
}

SEASON_SCHEMA: Dict[str, Any] = {
    "$schema": SCHEMA_URI,
    "type": "object",
    "required": [
        "schemaVersion",
        "year",
        "teams",
        "matchups",
        "transactions",
        "draft",
        "awards",
        "lineups",
    ],
    "properties": {
        "schemaVersion": {"type": "string"},
        "year": {"type": "integer"},
        "league_id": {"type": ["string", "null"]},
        "generated_at": {"type": ["string", "null"]},
        "teams": {"type": "array", "items": TEAM_SCHEMA},
        "matchups": {"type": "array", "items": MATCHUP_SCHEMA},
        "transactions": {"type": "array", "items": TRANSACTION_SCHEMA},
        "draft": {"type": "array", "items": DRAFT_PICK_SCHEMA},
        "awards": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "title"],
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                    "team": {"type": ["string", "null"]},
                    "owner": {"type": ["string", "null"]},
                    "value": {"type": ["number", "null"]},
                },
            },
        },
        "lineups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "week": {"type": ["integer", "null"]},
                    "team": {"type": ["string", "null"]},
                    "player_id": {"type": ["string", "null"]},
                    "player": {"type": ["string", "null"]},
                    "started": {"type": ["boolean", "null"]},
                    "points": {"type": ["number", "null"]},
                },
            },
        },
        "supplemental": {
            "type": "object",
            "properties": {
                "current_roster": {
                    "type": "object",
                    "additionalProperties": {"type": "array", "items": {"type": "string"}},
                },
                "player_index": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "object",
                        "properties": {
                            "full_name": {"type": ["string", "null"]},
                            "name": {"type": ["string", "null"]},
                            "team": {"type": ["string", "null"]},
                            "pos": {"type": ["string", "null"]},
                        },
                    },
                },
                "draft_day_roster": {
                    "type": "object",
                    "additionalProperties": {"type": "array", "items": {"type": "string"}},
                },
                "users": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "user_id": {"type": "string"},
                            "display_name": {"type": ["string", "null"]},
                        },
                    },
                },
                "trade_evals": {"type": "array"},
                "acquisitions": {"type": "array"},
                "raw_transactions": {"type": "array"},
                "player_points": {
                    "type": "object",
                    "properties": {
                        "by_week": {
                            "type": "object",
                            "additionalProperties": {
                                "type": "object",
                                "additionalProperties": {"type": "number"},
                            },
                        },
                        "cumulative": {
                            "type": "object",
                            "additionalProperties": {"type": "number"},
                        },
                        "weeks_complete": {"type": "integer"},
                    },
                },
                "draft_id": {"type": ["string", "null"]},
            },
        },
    },
}

POWER_RANKINGS_SCHEMA: Dict[str, Any] = {
    "$schema": SCHEMA_URI,
    "type": "object",
    "required": ["schemaVersion", "entries"],
    "properties": {
        "schemaVersion": {"type": "string"},
        "generated_at": {"type": ["string", "null"]},
        "season": {"type": ["integer", "null"]},
        "entries": {"type": "array", "items": POWER_RANKING_ENTRY_SCHEMA},
    },
}

WEEKLY_RECAPS_SCHEMA: Dict[str, Any] = {
    "$schema": SCHEMA_URI,
    "type": "object",
    "required": ["schemaVersion", "entries"],
    "properties": {
        "schemaVersion": {"type": "string"},
        "generated_at": {"type": ["string", "null"]},
        "season": {"type": ["integer", "null"]},
        "entries": {"type": "array", "items": WEEKLY_RECAP_ENTRY_SCHEMA},
    },
}
