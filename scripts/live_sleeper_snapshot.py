#!/usr/bin/env python3
"""Build lightweight live Sleeper snapshots for ChatGPT/reference use.

Outputs:
- data/live/my_roster.json
- data/live/current_matchup.json
- data/live/status.json

The official Sleeper API is used for league/users/rosters/matchups/player metadata.
Projection data is attempted from Sleeper's public projection feed. If unavailable,
projection values remain null and projection_status explains why.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
LEAGUE_CONFIG = ROOT / "data" / "config" / "league.yml"
OUT_DIR = ROOT / "data" / "live"
SLEEPER_BASE = "https://api.sleeper.app/v1"
PROJECTIONS_BASE = "https://api.sleeper.com/projections/nfl"


def get_json(url: str, timeout: int = 30) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "TatnallLegacy-live-mirror/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def parse_league_config(path: Path) -> tuple[str, int]:
    # Keep this dependency-free for fast Actions runs.
    text = path.read_text(encoding="utf-8")
    in_current = False
    season = None
    league_id = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith("current_season:"):
            in_current = True
            continue
        if in_current and line and not line.startswith(" "):
            break
        if in_current:
            stripped = line.strip()
            if stripped.startswith("season:"):
                season = int(stripped.split(":", 1)[1].strip())
            elif stripped.startswith("league_id:"):
                league_id = stripped.split(":", 1)[1].strip().strip('"\'')
    if not league_id or not season:
        raise RuntimeError("Unable to resolve current_season league_id/season from data/config/league.yml")
    return league_id, season


def choose_user(users: list[dict[str, Any]]) -> dict[str, Any]:
    explicit_id = os.getenv("SLEEPER_USER_ID", "").strip()
    explicit_name = os.getenv("SLEEPER_USERNAME", "").strip().lower()
    display_hint = os.getenv("SLEEPER_DISPLAY_NAME", "Conner").strip().lower()

    if explicit_id:
        for u in users:
            if str(u.get("user_id")) == explicit_id:
                return u
        raise RuntimeError(f"SLEEPER_USER_ID {explicit_id} is not a member of this league")

    if explicit_name:
        for u in users:
            if str(u.get("username") or "").lower() == explicit_name:
                return u
        raise RuntimeError(f"SLEEPER_USERNAME {explicit_name!r} is not a member of this league")

    exact = [u for u in users if str(u.get("display_name") or "").lower() == display_hint]
    if len(exact) == 1:
        return exact[0]
    contains = [u for u in users if display_hint and display_hint in str(u.get("display_name") or "").lower()]
    if len(contains) == 1:
        return contains[0]

    raise RuntimeError(
        "Could not uniquely identify your Sleeper user. Add repository variable "
        "SLEEPER_USER_ID or SLEEPER_USERNAME to the live-snapshot workflow environment."
    )


def player_name(p: dict[str, Any] | None, player_id: str) -> str:
    if not p:
        return player_id
    full = p.get("full_name") or " ".join(x for x in [p.get("first_name"), p.get("last_name")] if x)
    return full or player_id


def projection_map(season: int, week: int, scoring: str = "ppr") -> tuple[dict[str, float], str]:
    # Sleeper's web client has historically consumed this public feed; it is not
    # part of the documented v1 API, so failure must degrade safely.
    params = urllib.parse.urlencode({"season_type": "regular", "season": season, "week": week, "position[]": ["QB"]}, doseq=True)
    candidates = [
        f"{PROJECTIONS_BASE}/{season}/{week}?season_type=regular",
        f"{PROJECTIONS_BASE}/{season}/{week}?{params}",
    ]
    raw = None
    last_error = None
    for url in candidates:
        try:
            raw = get_json(url, timeout=20)
            if raw:
                break
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
    if raw is None:
        return {}, f"unavailable: {last_error or 'projection feed returned no data'}"

    result: dict[str, float] = {}
    records = raw if isinstance(raw, list) else list(raw.values()) if isinstance(raw, dict) else []
    for rec in records:
        if not isinstance(rec, dict):
            continue
        pid = str(rec.get("player_id") or rec.get("player", {}).get("player_id") or "")
        if not pid:
            continue
        # Sleeper projection records may expose fantasy_points directly or stat fields.
        val = rec.get("pts_ppr") if scoring == "ppr" else rec.get("pts_half_ppr")
        if val is None:
            val = rec.get("fantasy_points") or rec.get("pts")
        if isinstance(val, (int, float)):
            result[pid] = round(float(val), 2)
    return result, "available" if result else "unavailable: feed returned no directly usable fantasy-point field"


def enrich(ids: list[str], players: dict[str, Any], projections: dict[str, float], starters: set[str]) -> list[dict[str, Any]]:
    rows = []
    for pid in ids:
        p = players.get(pid) or {}
        rows.append({
            "player_id": pid,
            "name": player_name(p, pid),
            "position": p.get("position"),
            "team": p.get("team"),
            "injury_status": p.get("injury_status"),
            "starter": pid in starters,
            "projected_points": projections.get(pid),
        })
    return rows


def main() -> int:
    league_id, configured_season = parse_league_config(LEAGUE_CONFIG)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    league = get_json(f"{SLEEPER_BASE}/league/{league_id}")
    state = get_json(f"{SLEEPER_BASE}/state/nfl")
    users = get_json(f"{SLEEPER_BASE}/league/{league_id}/users")
    rosters = get_json(f"{SLEEPER_BASE}/league/{league_id}/rosters")
    me = choose_user(users)
    my_roster = next((r for r in rosters if str(r.get("owner_id")) == str(me.get("user_id"))), None)
    if not my_roster:
        raise RuntimeError("Found your Sleeper user but no owned roster in the current league")

    # Prefer NFL state's display week during preseason/regular season; fall back to config.
    week = int(state.get("display_week") or state.get("week") or 1)
    season = int(league.get("season") or configured_season)
    matchups = get_json(f"{SLEEPER_BASE}/league/{league_id}/matchups/{week}")

    my_matchup = next((m for m in matchups if int(m.get("roster_id")) == int(my_roster["roster_id"])), None)
    opponent_matchup = None
    opponent_roster = None
    opponent_user = None
    if my_matchup and my_matchup.get("matchup_id") is not None:
        opponent_matchup = next(
            (m for m in matchups if m.get("matchup_id") == my_matchup.get("matchup_id") and int(m.get("roster_id")) != int(my_roster["roster_id"])),
            None,
        )
        if opponent_matchup:
            opponent_roster = next((r for r in rosters if int(r.get("roster_id")) == int(opponent_matchup["roster_id"])), None)
            if opponent_roster:
                opponent_user = next((u for u in users if str(u.get("user_id")) == str(opponent_roster.get("owner_id"))), None)

    # Player map: once-per-day guidance is handled by the workflow cache file.
    players_cache = OUT_DIR / "players_cache.json"
    players = {}
    refresh_players = True
    if players_cache.exists():
        age = datetime.now(timezone.utc).timestamp() - players_cache.stat().st_mtime
        if age < 23 * 3600:
            try:
                players = json.loads(players_cache.read_text(encoding="utf-8"))
                refresh_players = False
            except Exception:  # noqa: BLE001
                refresh_players = True
    if refresh_players:
        players = get_json(f"{SLEEPER_BASE}/players/nfl")
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        players_cache.write_text(json.dumps(players, separators=(",", ":")), encoding="utf-8")

    projections, projection_status = projection_map(season, week)

    my_players = [str(x) for x in (my_roster.get("players") or [])]
    my_starters = {str(x) for x in (my_roster.get("starters") or [])}
    my_rows = enrich(my_players, players, projections, my_starters)

    my_payload = {
        "schema_version": "1.0.0",
        "generated_at": now,
        "source": "Sleeper",
        "league": {"league_id": league_id, "name": league.get("name"), "season": season, "week": week, "status": league.get("status")},
        "owner": {"user_id": me.get("user_id"), "username": me.get("username"), "display_name": me.get("display_name"), "team_name": (me.get("metadata") or {}).get("team_name")},
        "roster_id": my_roster.get("roster_id"),
        "settings": my_roster.get("settings") or {},
        "starters": [r for r in my_rows if r["starter"]],
        "bench": [r for r in my_rows if not r["starter"]],
        "reserve": [str(x) for x in (my_roster.get("reserve") or [])],
        "taxi": [str(x) for x in (my_roster.get("taxi") or [])],
    }

    matchup_payload: dict[str, Any] = {
        "schema_version": "1.0.0",
        "generated_at": now,
        "source": "Sleeper",
        "league_id": league_id,
        "season": season,
        "week": week,
        "projection_status": projection_status,
        "matchup_available": bool(my_matchup and opponent_matchup),
        "my_team": None,
        "opponent": None,
    }

    def team_block(roster: dict[str, Any], user: dict[str, Any] | None, matchup: dict[str, Any] | None) -> dict[str, Any]:
        ids = [str(x) for x in (roster.get("players") or [])]
        starts = {str(x) for x in ((matchup or {}).get("starters") or roster.get("starters") or [])}
        rows = enrich(ids, players, projections, starts)
        starter_projection_values = [r["projected_points"] for r in rows if r["starter"] and isinstance(r["projected_points"], (int, float))]
        return {
            "roster_id": roster.get("roster_id"),
            "owner": {"user_id": (user or {}).get("user_id"), "username": (user or {}).get("username"), "display_name": (user or {}).get("display_name"), "team_name": ((user or {}).get("metadata") or {}).get("team_name")},
            "matchup_id": (matchup or {}).get("matchup_id"),
            "current_points": (matchup or {}).get("points"),
            "projected_points": round(sum(starter_projection_values), 2) if starter_projection_values else None,
            "starters": [r for r in rows if r["starter"]],
            "bench": [r for r in rows if not r["starter"]],
        }

    matchup_payload["my_team"] = team_block(my_roster, me, my_matchup)
    if opponent_roster:
        matchup_payload["opponent"] = team_block(opponent_roster, opponent_user, opponent_matchup)

    status_payload = {
        "schema_version": "1.0.0",
        "generated_at": now,
        "league_id": league_id,
        "season": season,
        "week": week,
        "league_status": league.get("status"),
        "projection_status": projection_status,
        "my_roster_id": my_roster.get("roster_id"),
        "opponent_roster_id": (opponent_roster or {}).get("roster_id"),
        "player_map_refreshed": refresh_players,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "my_roster.json").write_text(json.dumps(my_payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    (OUT_DIR / "current_matchup.json").write_text(json.dumps(matchup_payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    (OUT_DIR / "status.json").write_text(json.dumps(status_payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    print(json.dumps(status_payload, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
