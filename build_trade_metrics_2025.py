#!/usr/bin/env python3
# build_trade_metrics_2025.py
# Outputs:
#   data/lineups-2025.json   -> started points by team/player per week
#   data/proj-2025-cum.json  -> cumulative ROS projections keyed by start week

import os, sys, json, time
from pathlib import Path
from typing import Dict, Any
import requests

# ---------------- CONFIG ----------------
YEAR = 2025
DEFAULT_LEAGUE_ID = "1262418074540195841"
BASE = "https://api.sleeper.app/v1"
REG_SEASON_WEEKS = 18
UA = {"User-Agent": "tatnall-legacy/trade-metrics/1.5"}

# If set to "1", omit generated_at to keep byte-stable outputs
FORCE_STABLE = os.getenv("FORCE_STABLE_OUTPUT", "0") == "1"

# ---------------- RESOLUTION ----------------
def resolve_league_id():
    lid = os.getenv("SLEEPER_LEAGUE_ID") or (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LEAGUE_ID)
    lid = str(lid).strip()
    if not lid:
        raise SystemExit("ERROR: missing league id")
    return lid

# ---------------- HTTP (with retries) ----------------
S = requests.Session()
S.headers.update(UA)

def http_get(url: str, *, params: Dict[str, Any] | None = None, ok_404: bool = False):
    for attempt in range(5):
        r = S.get(url, params=params, timeout=30)
        if ok_404 and r.status_code == 404:
            return None
        if r.status_code in (429, 502, 503, 504):
            time.sleep(0.75 * (attempt + 1))
            continue
        r.raise_for_status()
        return r
    r.raise_for_status()  # final raise

def get_json(url: str, *, params: Dict[str, Any] | None = None, ok_404: bool = False):
    r = http_get(url, params=params, ok_404=ok_404)
    if r is None:
        return None
    try:
        return r.json()
    except ValueError:
        return None

# ---------------- HELPERS ----------------
def build_roster_maps(league_id):
    users   = get_json(f"{BASE}/league/{league_id}/users") or []
    rosters = get_json(f"{BASE}/league/{league_id}/rosters") or []
    u_by_id = {u["user_id"]: u for u in users}

    def team_label(r):
        meta = r.get("metadata") or {}
        u = u_by_id.get(r.get("owner_id")) or {}
        return (
            meta.get("team_name")
            or meta.get("nickname")
            or (u.get("metadata") or {}).get("team_name")
            or (u.get("metadata") or {}).get("nickname")
            or u.get("display_name")
            or f"Roster {r.get('roster_id')}"
        )

    roster_by_id = {}
    for r in rosters:
        roster_by_id[r["roster_id"]] = {
            "team_name": team_label(r),
            "owner_id": r.get("owner_id"),
        }
    return roster_by_id

# ---------------- LINEUPS (ACTUAL STARTED POINTS) ----------------
def fetch_lineups_rows(league_id, roster_by_id):
    rows = []
    for w in range(1, REG_SEASON_WEEKS + 1):
        wk = get_json(f"{BASE}/league/{league_id}/matchups/{w}", ok_404=True)
        if wk is None:
            break
        if not wk:
            time.sleep(0.15)
            continue

        for m in wk:
            rid = m.get("roster_id")
            team = roster_by_id.get(rid, {}).get("team_name") or f"Roster {rid}"
            starters = m.get("starters") or []
            starters_points = m.get("starters_points") or []
            players_points = m.get("players_points") or {}

            for i, pid in enumerate(starters):
                if not pid:
                    continue
                pts = 0.0
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

# ---------------- PROJECTIONS (CUMULATIVE ROS) ----------------
# Endpoint pattern:
#   GET https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular&position[]=QB&...&position[]=K
def fetch_weekly_projections(season_year: int, week: int) -> dict[str, float]:
    params = [
        ("season_type", "regular"),
        ("position[]", "QB"),
        ("position[]", "RB"),
        ("position[]", "WR"),
        ("position[]", "TE"),
        ("position[]", "K"),
    ]
    url = f"https://api.sleeper.app/projections/nfl/{season_year}/{week}"
    r = http_get(url, params=dict(params))
    # Some weeks may 400/404; treat as empty
    if r.status_code in (400, 404):
        return {}
    arr = r.json() or []
    out: dict[str, float] = {}
    for row in arr:
        pid = row.get("player_id") or (row.get("player") or {}).get("player_id") or row.get("id")
        if not pid:
            continue
        val = row.get("fp")
        if val is None: val = row.get("fpts")
        if val is None: val = row.get("proj")
        if val is None: val = row.get("points", 0)
        try:
            out[str(pid)] = float(val or 0.0)
        except Exception:
            pass
    return out

def fetch_nfl_state_year_week():
    s = get_json(f"{BASE}/state/nfl") or {}
    season = int(s.get("season") or YEAR)
    week = int(s.get("week") or 0)
    return season, week

def build_cumulative_from(season_year: int) -> dict[int, dict[str, float]]:
    weekly: dict[int, dict[str, float]] = {}
    all_pids: set[str] = set()

    print("→ pulling weekly projection snapshots:")
    for w in range(1, REG_SEASON_WEEKS + 1):
        try:
            m = fetch_weekly_projections(season_year, w)
        except requests.HTTPError:
            m = {}
        weekly[w] = m or {}
        all_pids.update(weekly[w].keys())
        print(f"  week {w:>2}: {len(weekly[w])} players")
        time.sleep(0.15)

    suffix = {pid: 0.0 for pid in all_pids}
    cumulative_from: dict[int, dict[str, float]] = {}

    for w in range(REG_SEASON_WEEKS, 0, -1):
        wkmap = weekly.get(w, {})
        for pid in all_pids:
            suffix[pid] += float(wkmap.get(pid, 0.0) or 0.0)
        cf: dict[str, float] = {}
        for pid in all_pids:
            val = suffix[pid] - float(wkmap.get(pid, 0.0) or 0.0)  # (w+1..end)
            if val > 0.0:
                cf[pid] = round(val, 4)
        cumulative_from[w] = cf

    non_empty = sum(1 for v in cumulative_from.values() if v)
    print(f"→ cumulative_from non-empty weeks: {non_empty}/{REG_SEASON_WEEKS}")
    return cumulative_from

# ---------------- MAIN ----------------
def main():
    league_id = resolve_league_id()
    print(f"Using League ID: {league_id}")

    out_dir = Path("data")
    out_dir.mkdir(exist_ok=True)

    roster_by_id = build_roster_maps(league_id)

    print("→ fetching lineups/started points …")
    rows = fetch_lineups_rows(league_id, roster_by_id)
    weeks_recorded = sorted({r["week"] for r in rows})
    lineups_payload = {
        "year": YEAR,
        "weeks_recorded": weeks_recorded,
        "rows": rows
    }
    if not FORCE_STABLE:
        lineups_payload["generated_at"] = int(time.time())
    (out_dir / f"lineups-{YEAR}.json").write_text(json.dumps(lineups_payload, indent=2))
    print(f"saved lineups-{YEAR}.json (rows={len(rows)}, weeks={weeks_recorded})")

    print("→ fetching projections and building cumulative ROS …")
    season_year, _ = fetch_nfl_state_year_week()
    cumulative_from = build_cumulative_from(season_year)
    proj_payload = {
        "year": YEAR,
        "weeks": REG_SEASON_WEEKS,
        "season_source": season_year,
        "cumulative_from": {str(k): v for k, v in cumulative_from.items()}
    }
    if not FORCE_STABLE:
        proj_payload["generated_at"] = int(time.time())
    (out_dir / f"proj-{YEAR}-cum.json").write_text(json.dumps(proj_payload, indent=2))
    print("saved proj-{YEAR}-cum.json")

    print("done")

if __name__ == "__main__":
    main()
