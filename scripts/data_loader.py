from __future__ import annotations

import json
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from data_schemas import SCHEMA_VERSION

JsonDict = Dict[str, Any]


def load_json(path: Path) -> JsonDict:
    """Load JSON from disk into a dictionary."""
    return json.loads(path.read_text())


def load_api_json(url: str, timeout: int = 20) -> JsonDict:
    """Fetch JSON payloads from the given URL with a timeout."""
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize_season(source: JsonDict, year: int, lineups: Optional[List[Dict[str, Any]]]) -> JsonDict:
    """Normalize raw season payloads into the shared schema used by the front end."""
    supplemental = None
    if any(
        k in source
        for k in (
            "current_roster",
            "player_index",
            "draft_day_roster",
            "users",
            "trade_evals",
            "acquisitions",
        )
    ):
        supplemental = {
            "current_roster": source.get("current_roster"),
            "player_index": source.get("player_index"),
            "draft_day_roster": source.get("draft_day_roster"),
            "users": source.get("users"),
            "trade_evals": source.get("trade_evals"),
            "acquisitions": source.get("acquisitions"),
        }

    payload: JsonDict = {
        "schemaVersion": SCHEMA_VERSION,
        "year": int(source.get("year") or year),
        "league_id": source.get("league_id"),
        "generated_at": source.get("generated_at"),
        "teams": source.get("teams") or [],
        "matchups": source.get("matchups") or [],
        "transactions": source.get("transactions") or [],
        "draft": source.get("draft") or [],
        "awards": source.get("awards") or [],
    }

    if lineups:
        payload["lineups"] = lineups
    elif source.get("lineups"):
        payload["lineups"] = source.get("lineups")

    if supplemental:
        payload["supplemental"] = supplemental

    return payload


def normalize_power_rankings(source: JsonDict, season: Optional[int] = None) -> JsonDict:
    """Coerce power ranking exports into the shape expected by the UI."""
    return {
        "schemaVersion": source.get("schemaVersion") or SCHEMA_VERSION,
        "generated_at": source.get("generated_at"),
        "season": source.get("season") or season,
        "entries": source.get("entries") or source.get("rankings") or [],
    }


def normalize_weekly_recaps(source: JsonDict, season: Optional[int] = None) -> JsonDict:
    """Normalize weekly recap exports for consistent downstream rendering."""
    return {
        "schemaVersion": source.get("schemaVersion") or SCHEMA_VERSION,
        "generated_at": source.get("generated_at"),
        "season": source.get("season") or season,
        "entries": source.get("entries") or source.get("recaps") or [],
    }


def load_espn_season(path: Path, year: int, lineups: Optional[List[Dict[str, Any]]] = None) -> JsonDict:
    """Load and normalize ESPN season exports."""
    return normalize_season(load_json(path), year, lineups)


def load_sleeper_season(path: Path, year: int) -> JsonDict:
    """Load and normalize Sleeper season exports."""
    return normalize_season(load_json(path), year, None)


def load_api_season(url: str, year: int) -> JsonDict:
    """Load season data directly from a remote API URL."""
    return normalize_season(load_api_json(url), year, None)
