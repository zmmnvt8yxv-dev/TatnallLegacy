#!/usr/bin/env python3
# scripts/build_trade_metrics_2025.py
# Generates:
#   data/lineups-2025.json      -> started points by team/player per week
#   data/proj-2025-cum.json     -> cumulative ROS projections keyed by "start week"

import os, sys, json, time
from pathlib import Path
import requests

# ---------------- CONFIG ----------------
YEAR = 2025
DEFAULT_LEAGUE_ID = "1262418074540195841"
BASE = "https://api.sleeper.app/v1"
REG_SEASON_WEEKS = 18
UA = {"User-Agent": "tatnall-legacy/trade-metrics/1.3"}

# ---------------- RESOLUTION ----------------
def resolve_league_id():
    lid = os.getenv("SLEEPER_LEAGUE_ID") or (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LEAGUE_ID)
    lid = str(lid).strip()
    if not lid:
        raise SystemExit("ERROR: missing league id")
    return lid

# ---------------- HTTP ----------------
S = requests.Session()
S.headers.update(UA)

def get(url, ok_404=False):
    r = S.get(url, timeout=30)
    if ok_404 and r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()

# ---------------- HELPERS ----------------
def build_roster_maps(league_id):
    users   = get(f"{BASE}/league/{league_id}/users") or []
    rosters = get(f"{BASE}/league/{league_id}/rosters") or []
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
    """
    rows: {week, team, player_id, player, started:true, points}
    Only starters; bench omitted.
    """
    rows = []
    for w in range(1, REG_SEASON_WEEKS + 1):
        wk = get(f"{BASE}/league/{league_id}/matchups/{w}", ok_404=True)
        if wk is None:
            break
        if not wk:
            time.sleep(0.2)
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
                    "player": str(pid),   # name not required for client math
                    "started": True,
                    "points": round(pts, 4),
                })
        time.sleep(0.2)
    return rows

# ---------------- PROJECTIONS (CUMULATIVE ROS) ----------------
def fetch_weekly_projections(season_year, week):
    """
    Return {player_id: projected_points} for week.
    Endpoint: /projections/nfl/<season>/<week>?season_type=regular&position[]=QB&... 
    """
    params = [
        ("season_type", "regular"),
        ("position[]", "QB"),
        ("position[]", "RB"),
        ("position[]", "WR"),
        ("position[]", "TE"),
        ("position[]", "K"),
        ("position[]", "DEF"),
        ("position[]", "FLEX"),
    ]
    url = f"https://api.sleeper.app/projections/nfl/{season_year}/{week}"
    r = S.get(url, params=params, timeout=30)
    if r.status_code in (400, 404):
        return {}
    r.raise_for_status()
    arr = r.json() or []
    out = {}
    for row in arr:
        pid = (
            row.get("player_id")
            or (row.get("player") or {}).get("player_id")
            or row.get("id")
        )
        if not pid:
            continue
        # common numeric fields seen in responses
        val = (
            row.get("fp", None)
            if row.get("fp", None) is not None else
            row.get("fpts", None)
            if row.get("fpts", None) is not None else
            row.get("proj", None)
            if row.get("proj", None) is not None else
            row.get("points", 0)
        )
        try:
            out[str(pid)] = float(val or 0.0)
        except Exception:
            pass
    return out

def fetch_nfl_state_year_week():
    s = get(f"{BASE}/state/nfl") or {}
    season = int(s.get("season") or YEAR)
    week = int(s.get("week") or 0)
    return season, week

def build_cumulative_from(season_year):
    """
    cumulative_from[w][pid] = sum(projection(pid) for weeks (w+1..REG_SEASON_WEEKS))
    """
    weekly = {}
    all_pids = set()

    for w in range(1, REG_SEASON_WEEKS + 1):
        try:
            weekly[w] = fetch_weekly_projections(season_year, w)
            all_pids.update(weekly[w].keys())
        except requests.HTTPError:
            weekly[w] = {}
        time.sleep(0.2)

    # suffix sum by player id
    suffix = {pid: 0.0 for pid in all_pids}
    cumulative_from = {}

    for w in range(REG_SEASON_WEEKS, 0, -1):
        wkmap = weekly.get(w, {})
        # update suffix with week w
        for pid in all_pids:
            suffix[pid] += float(wkmap.get(pid, 0.0) or 0.0)
        # for key w, store sum of (w+1..end) => suffix minus week w
        cf = {}
        for pid in all_pids:
            val = suffix[pid] - float(wkmap.get(pid, 0.0) or 0.0)
            if val > 0.0:
                cf[pid] = round(val, 4)
        cumulative_from[w] = cf

    return cumulative_from

# ---------------- MAIN ----------------
def main():
    league_id = resolve_league_id()
    print(f"[trade-metrics] league={league_id} year={YEAR}")

    out_dir = Path("data")
    out_dir.mkdir(exist_ok=True)

    # map roster -> team name
    roster_by_id = build_roster_maps(league_id)

    # actual started points (rows)
    print("→ fetching lineups/started points …")
    rows = fetch_lineups_rows(league_id, roster_by_id)
    weeks_recorded = sorted({r["week"] for r in rows})
    with open(out_dir / f"lineups-{YEAR}.json", "w") as f:
        json.dump({
            "year": YEAR,
            "weeks_recorded": weeks_recorded,
            "rows": rows
        }, f, indent=2)
    print(f"saved lineups-{YEAR}.json (rows={len(rows)}, weeks={weeks_recorded})")

    # projections cumulative (ROS)
    print("→ fetching projections and building cumulative ROS …")
    season_year, _ = fetch_nfl_state_year_week()
    cumulative_from = build_cumulative_from(season_year)
    with open(out_dir / f"proj-{YEAR}-cum.json", "w") as f:
        json.dump({
            "year": YEAR,
            "weeks": REG_SEASON_WEEKS,
            "season_source": season_year,
            "cumulative_from": {str(k): v for k, v in cumulative_from.items()}
        }, f, indent=2)
    print(f"saved proj-{YEAR}-cum.json (weeks=1..{REG_SEASON_WEEKS}, season_source={season_year})")

    print("✓ done")

if __name__ == "__main__":
    main()
