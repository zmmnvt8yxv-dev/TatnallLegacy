from __future__ import annotations

import json
import urllib.request
from pathlib import Path
import re
from typing import Any, Dict, Iterable, List, Optional

from data_schemas import SCHEMA_VERSION

JsonDict = Dict[str, Any]

BENCH_SLOTS = {
    "be",
    "bench",
    "bn",
    "ir",
    "ir+",
    "injuredreserve",
    "injured reserve",
    "reserve",
}


def normalize_espn_lineups(raw: Any) -> Optional[List[Dict[str, Any]]]:
    """Normalize ESPN lineup exports into schema-compatible rows."""
    if raw is None:
        return None

    rows = _extract_rows(raw)
    if rows is None:
        return None

    normalized: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        normalized.append(_normalize_lineup_row(row))
    return normalized


def _extract_rows(raw: Any) -> Optional[Iterable[Dict[str, Any]]]:
    if isinstance(raw, list):
        if raw and isinstance(raw[0], list):
            return None
        return raw

    if not isinstance(raw, dict):
        return None

    if "rows" in raw and isinstance(raw["rows"], list):
        rows = raw["rows"]
        if rows and isinstance(rows[0], list):
            columns = raw.get("columns") or raw.get("headers") or []
            if not columns:
                return None
            return [dict(zip(columns, row)) for row in rows]
        return rows

    if "data" in raw and isinstance(raw["data"], list):
        rows = raw["data"]
        if rows and isinstance(rows[0], list):
            columns = raw.get("columns") or raw.get("headers") or []
            if not columns:
                return None
            return [dict(zip(columns, row)) for row in rows]
        return rows

    return None


def _normalize_lineup_row(row: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(row)
    key_map = {normalize_label(k): k for k in row.keys()}

    week = extract_value(row, key_map, {"week", "wk"})
    team = extract_value(row, key_map, {"team", "teamname", "fantasyteam", "owner", "ownername"})
    player = extract_value(row, key_map, {"player", "playername", "name"})
    player_id = extract_value(row, key_map, {"playerid", "player_id", "id"})
    points = extract_value(row, key_map, {"points", "pts", "fpts", "fantasypoints", "score"})
    started = extract_value(row, key_map, {"started", "starter", "isstarter", "isstarting", "starting"})
    slot = extract_value(
        row,
        key_map,
        {"slot", "lineupslot", "position", "pos", "lineupposition", "rosterposition"},
    )

    if week is not None:
        normalized["week"] = coerce_week(week)
    if team is not None:
        normalized["team"] = stringify(team)
    if player is not None:
        normalized["player"] = stringify(player)
    if player_id is not None:
        normalized["player_id"] = stringify(player_id)
    if points is not None:
        normalized["points"] = coerce_points(points)

    if started is not None:
        normalized["started"] = coerce_started(started)
    elif slot is not None:
        normalized["started"] = slot_to_started(slot)

    if slot is not None and "slot" not in normalized:
        normalized["slot"] = stringify(slot)

    return normalized


def normalize_label(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", label.lower()).strip()


def extract_value(row: Dict[str, Any], key_map: Dict[str, str], keys: set[str]) -> Any:
    for key in keys:
        source_key = key_map.get(key)
        if source_key is not None:
            return row.get(source_key)
    return None


def stringify(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def coerce_week(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value)
    match = re.search(r"\d+", text)
    if match:
        return int(match.group(0))
    return None


def coerce_points(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def coerce_started(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"true", "yes", "y", "1", "starter", "started"}:
        return True
    if text in {"false", "no", "n", "0", "bench", "be", "bn"}:
        return False
    return None


def slot_to_started(value: Any) -> Optional[bool]:
    slot = stringify(value)
    if slot is None:
        return None
    slot_key = normalize_label(slot)
    if slot_key in BENCH_SLOTS:
        return False
    return True


def load_json(path: Path) -> JsonDict:
    """Load JSON from disk into a dictionary."""
    return json.loads(path.read_text())


def load_api_json(url: str, timeout: int = 20) -> JsonDict:
    """Fetch JSON payloads from the given URL with a timeout."""
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize_season(source: JsonDict, year: int, lineups: Optional[List[Dict[str, Any]]]) -> JsonDict:
    """Normalize raw season payloads into the shared schema used by the front end."""
    supplemental_source = source.get("supplemental") if isinstance(source.get("supplemental"), dict) else {}
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
            "raw_transactions",
            "player_points",
            "draft_id",
        )
    ):
        supplemental = {
            **supplemental_source,
            "current_roster": supplemental_source.get("current_roster") or source.get("current_roster"),
            "player_index": supplemental_source.get("player_index") or source.get("player_index"),
            "draft_day_roster": supplemental_source.get("draft_day_roster") or source.get("draft_day_roster"),
            "users": supplemental_source.get("users") or source.get("users"),
            "trade_evals": supplemental_source.get("trade_evals") or source.get("trade_evals"),
            "acquisitions": supplemental_source.get("acquisitions") or source.get("acquisitions"),
            "raw_transactions": supplemental_source.get("raw_transactions") or source.get("raw_transactions"),
            "player_points": supplemental_source.get("player_points") or source.get("player_points"),
            "draft_id": supplemental_source.get("draft_id") or source.get("draft_id"),
        }
    elif supplemental_source:
        supplemental = supplemental_source

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

    if lineups is not None:
        payload["lineups"] = lineups
    else:
        normalized_lineups = normalize_espn_lineups(source.get("lineups"))
        if normalized_lineups is not None:
            payload["lineups"] = normalized_lineups
        elif isinstance(source.get("lineups"), list):
            payload["lineups"] = source.get("lineups")
        else:
            payload["lineups"] = []

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
