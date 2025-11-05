#!/usr/bin/env python3
# Outputs:
#   data/lineups-2025.json   -> started points by team/player per week (actuals, starters only)
#   data/proj-2025-cum.json  -> cumulative Rest-Of-Season projections keyed by "start week"

import os, sys, json, time
from pathlib import Path
from typing import Dict, Any
import requests

# ---------- CONFIG ----------
YEAR = 2025
DEFAULT_LEAGUE_ID = "1262418074540195841"
API_BASE = "https://api.sleeper.app/v1"
REG_SEASON_WEEKS = 18
UA = {"User-Agent": "tatnall-legacy/trade-metrics/1.6"}

# ---------- HTTP ----------
S = requests.Session()
S.headers.update(UA)

def http_get(url: str, *, params: Dict[str, Any] | None = None, ok_404: bool = False):
    # Retry a few transient codes
    for attempt in range(5):
        r = S.get(url, params=params, timeout=30)
        if ok_404 and r.status_code == 404:
            return None
        if r.status_code in (429, 502, 503, 504):
            time.sleep(0.6 * (attempt + 1))
            continue
        r.raise_for_status()
        return r
    r.raise_for_status()

def get_json(url: str, *, params: Dict[str, Any] | None = None, ok_404: bool = False):
    r = http_get(url, params=params, ok_404=ok_404)
    if r is None:
        return None
    try:
        return r.json()
    except ValueError:
        return None

# ---------- RESOLVE LEAGUE ----------
def resolve_league_id() -> str:
    lid = os.getenv("SLEEPER_LEAGUE_ID") or (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LEAGUE_ID)
    lid = str(lid).strip()
    if not lid:
        raise SystemExit("ERROR: missing league id")
    return lid

# ---------- ROSTER / TEAM NAMES ----------
def build_roster_map(league_id: str) -> Dict[int, Dict[str, Any]]:
    users   = get_json(f"{API_BASE}/league/{league_id}/users") or []
    rosters = get_json(f"{API_BASE}/league/{league_id}/rosters") or []
    u_by_id = {u["user_id"]: u for u in users}

    def team_label(r):
        meta = r.get("metadata") or {}
        u = u_by_id.get(r.get("owner_id")) or {}
        return (
            meta.get("team_name") or meta.get("nickname")
            or (u.get("metadata") or {}).get("team_name")
            or (u.get("metadata") or {}).get("nickname")
            or u.get("display_name")
            or f"Roster {r.get('roster_id')}"
        )

    out = {}
    for r in rosters:
        out[r["roster_id"]] = {"team_name": team_label(r), "owner_id": r.get("owner_id")}
    return out

# ---------- ACTUALS: STARTED POINTS ----------
def fetch_lineups_rows(league_id: str, roster_by_id: Dict[int, Dict[str, Any]]):
    rows = []
    for w in range(1, REG_SEASON_WEEKS + 1):
        wk = get_json(f"{API_BASE}/league/{league_id}/matchups/{w}", ok_404=True)
        if wk is None:
            break  # league not active this deep yet
        if not wk:
            time.sleep(0.15)
            continue

        for m in wk:
            rid = m.get("roster_id")
            team = roster_by_id.get(rid, {}).get("team_name") or f"Roster {rid}"
            starters = m.get("starters") or []
            starters_points = m.get("starters_points") or []
            players_points  = m.get("players_points") or {}

            for i, pid in enumerate(starters):
                if not pid:
                    continue
                if i < len(starters_points) and starters_points[i] is not None:
                    pts = float(starters_points[i] or 0.0)
                else:
                    pts = float(players_points.get(pid, 0.0) or 0.0)
                rows.append({
                    "week": w,
                    "team": team,
                    "player_id": str(pid),
                    "player": str(pid),
                    "started": True,
                    "points": round(pts, 4),
                })
        time.sleep(0.15)
    return rows

# ---------- PROJECTIONS (MULTI-STRATEGY FETCH) ----------
# Sleeper has used different shapes. Try several, stop at first non-empty.
def _extract_fp(row: dict) -> float:
    # try the most common fantasy points keys
    for k in ("fp", "fpts", "proj", "points", "pts_ppr", "pts", "fantasy_points", "projected_points"):
        if k in row and row[k] is not None:
            try:
                return float(row[k])
            except Exception:
                pass
    return 0.0

def _extract_pid(row: dict) -> str | None:
    return (
        row.get("player_id")
        or (row.get("player") or {}).get("player_id")
        or row.get("id")
    )

def fetch_weekly_projections_any(season_year: int, week: int) -> Dict[str, float]:
    attempts = [
        # 1) current documented pattern (with season_type and positions)
        ("https://api.sleeper.app/projections/nfl/{season}/{week}",
         {"season_type": "regular",
          "position[]": ["QB", "RB", "WR", "TE", "K"]}),
        # 2) older pattern without params (some envs return all positions)
        ("https://api.sleeper.app/projections/nfl/{season}/{week}", None),
        # 3) legacy "regular" in path
        ("https://api.sleeper.app/projections/nfl/regular/{season}/{week}", None),
    ]
    for url_tmpl, params in attempts:
        url = url_tmpl.format(season=season_year, week=week)
        p = None
        if params:
            # expand repeated params properly
            p = []
            for k, v in params.items():
                if isinstance(v, list):
                    for item in v:
                        p.append((k, item))
                else:
                    p.append((k, v))
        try:
            r = http_get(url, params=dict(p) if p else None)
            if r.status_code in (400, 404):
                continue
            arr = r.json() or []
            out: Dict[str, float] = {}
            for row in arr:
                pid = _extract_pid(row)
                if not pid:
                    continue
                fp = _extract_fp(row)
                if fp > 0:
                    out[str(pid)] = fp
            if out:
                return out
        except requests.HTTPError:
            continue
        except Exception:
            continue
        time.sleep(0.15)
    return {}

def fetch_state():
    s = get_json(f"{API_BASE}/state/nfl") or {}
    season = int(s.get("season") or YEAR)
    week = int(s.get("week") or 0)
    return season, week

def build_cumulative_from(season_year: int) -> Dict[int, Dict[str, float]]:
    weekly: Dict[int, Dict[str, float]] = {}
    all_pids: set[str] = set()

    for w in range(1, REG_SEASON_WEEKS + 1):
        m = fetch_weekly_projections_any(season_year, w)
        weekly[w] = m
        all_pids.update(m.keys())
        time.sleep(0.15)

    suffix = {pid: 0.0 for pid in all_pids}
    cumulative_from: Dict[int, Dict[str, float]] = {}

    for w in range(REG_SEASON_WEEKS, 0, -1):
        wkmap = weekly.get(w, {})
        for pid in all_pids:
            suffix[pid] += float(wkmap.get(pid, 0.0) or 0.0)
        cf = {}
        for pid in all_pids:
            val = suffix[pid] - float(wkmap.get(pid, 0.0) or 0.0)  # weeks (w+1..end)
            if val > 0.0:
                cf[pid] = round(val, 4)
        cumulative_from[w] = cf

    return cumulative_from

# ---------- MAIN ----------
def main():
    league_id = resolve_league_id()
    print(f"[trade-metrics] league={league_id} year={YEAR}")

    out_dir = Path("data")
    out_dir.mkdir(exist_ok=True)

    roster_by_id = build_roster_map(league_id)

    print("→ fetching lineups/started points …")
    rows = fetch_lineups_rows(league_id, roster_by_id)
    weeks_recorded = sorted({r["week"] for r in rows})
    (out_dir / f"lineups-{YEAR}.json").write_text(json.dumps({
        "year": YEAR,
        "weeks_recorded": weeks_recorded,
        "rows": rows
    }, indent=2))
    print(f"saved lineups-{YEAR}.json (rows={len(rows)}, weeks={weeks_recorded})")

    print("→ fetching projections and building cumulative ROS …")
    season_year, cur_week = fetch_state()
    print(f"season_source={season_year} current_week={cur_week}")
    cumulative_from = build_cumulative_from(season_year)
    non_empty_weeks = sum(1 for v in cumulative_from.values() if v)
    (out_dir / f"proj-{YEAR}-cum.json").write_text(json.dumps({
        "year": YEAR,
        "weeks": REG_SEASON_WEEKS,
        "season_source": season_year,
        "cumulative_from": {str(k): v for k, v in cumulative_from.items()},
        "generated_at": int(time.time()),
        "non_empty_weeks": non_empty_weeks
    }, indent=2))
    print(f"saved proj-{YEAR}-cum.json (non_empty_weeks={non_empty_weeks}/{REG_SEASON_WEEKS})")
    print("✓ done")

if __name__ == "__main__":
    main()
