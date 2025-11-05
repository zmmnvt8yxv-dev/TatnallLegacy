#!/usr/bin/env python3
# scripts/build_trade_metrics_2025.py
# Outputs:
#   data/lineups-2025.json   -> started points by team/player per week (actuals, starters only)
#   data/proj-2025-cum.json  -> cumulative ROS projections keyed by "start week"
#
# Strategy:
# 1) Try Sleeper projections endpoint:
#    GET https://api.sleeper.app/projections/nfl/<season>/<week>?season_type=regular&position[]=FLEX&position[]=K&position[]=QB&position[]=RB&position[]=TE&position[]=WR&position[]=DEF
# 2) If projections are empty for all weeks, fall back to a deterministic, league-local model:
#    For each player_id, expected_week_points = median(last 3 started-points across recorded weeks).
#    ROS(start_week) = expected_week_points * (REG_SEASON_WEEKS - start_week)
#    This guarantees non-empty cumulative projections for trade grading.

import os, sys, json, time, statistics
from pathlib import Path
from typing import Dict, Any, List
import requests

# ---------------- CONFIG ----------------
YEAR = 2025
DEFAULT_LEAGUE_ID = "1262418074540195841"
API_BASE = "https://api.sleeper.app/v1"
REG_SEASON_WEEKS = 18
UA = {"User-Agent": "tatnall-legacy/trade-metrics/1.7"}

# ---------------- HTTP ----------------
S = requests.Session()
S.headers.update(UA)

def http_get(url: str, *, params: Dict[str, Any] | None = None, ok_404: bool = False):
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

# ---------------- RESOLUTION ----------------
def resolve_league_id():
    lid = os.getenv("SLEEPER_LEAGUE_ID") or (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LEAGUE_ID)
    lid = str(lid).strip()
    if not lid:
        raise SystemExit("ERROR: missing league id")
    return lid

# ---------------- ROSTERS ----------------
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
        out[r["roster_id"]] = {
            "team_name": team_label(r),
            "owner_id": r.get("owner_id"),
        }
    return out

# ---------------- LINEUPS (ACTUAL STARTED POINTS) ----------------
def fetch_lineups_rows(league_id: str, roster_by_id: Dict[int, Dict[str, Any]]):
    rows = []
    for w in range(1, REG_SEASON_WEEKS + 1):
        wk = get_json(f"{API_BASE}/league/{league_id}/matchups/{w}", ok_404=True)
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

# ---------------- PROJECTIONS: SLEEPER ----------------
def _extract_fp(row: dict) -> float:
    for k in ("fp", "fpts", "proj", "points", "pts_ppr", "pts", "fantasy_points", "projected_points"):
        v = row.get(k)
        if v is not None:
            try:
                return float(v)
            except Exception:
                pass
    return 0.0

def _extract_pid(row: dict) -> str | None:
    return row.get("player_id") or (row.get("player") or {}).get("player_id") or row.get("id")

def fetch_weekly_projections_any(season_year: int, week: int) -> Dict[str, float]:
    attempts = [
        ("https://api.sleeper.app/projections/nfl/{season}/{week}",
         [("season_type","regular"),
          ("position[]","FLEX"),("position[]","K"),("position[]","QB"),
          ("position[]","RB"),("position[]","TE"),("position[]","WR"),("position[]","DEF")]),
        ("https://api.sleeper.app/projections/nfl/{season}/{week}", None),
        ("https://api.sleeper.app/projections/nfl/regular/{season}/{week}", None),
    ]
    for url_tmpl, params in attempts:
        url = url_tmpl.format(season=season_year, week=week)
        p = dict(params) if params else None
        try:
            r = http_get(url, params=p)
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

def build_cumulative_from_sleeper(season_year: int) -> Dict[int, Dict[str, float]]:
    weekly: Dict[int, Dict[str, float]] = {}
    all_pids: set[str] = set()
    non_empty = 0

    for w in range(1, REG_SEASON_WEEKS + 1):
        m = fetch_weekly_projections_any(season_year, w)
        weekly[w] = m
        if m:
            non_empty += 1
        all_pids.update(m.keys())
        time.sleep(0.12)

    if non_empty == 0:
        return {}

    suffix = {pid: 0.0 for pid in all_pids}
    cumulative_from: Dict[int, Dict[str, float]] = {}

    for w in range(REG_SEASON_WEEKS, 0, -1):
        wkmap = weekly.get(w, {})
        for pid in all_pids:
            suffix[pid] += float(wkmap.get(pid, 0.0) or 0.0)
        cf = {}
        for pid in all_pids:
            val = suffix[pid] - float(wkmap.get(pid, 0.0) or 0.0)
            if val > 0.0:
                cf[pid] = round(val, 4)
        cumulative_from[w] = cf

    return cumulative_from

# ---------------- PROJECTIONS: FALLBACK (NAIVE ROS) ----------------
def build_cumulative_from_naive(lineups_rows: List[Dict[str, Any]]) -> Dict[int, Dict[str, float]]:
    # Per player weekly history from starters only
    by_pid_weeks: Dict[str, List[float]] = {}
    for r in lineups_rows:
        if not r.get("started"):
            continue
        pid = str(r.get("player_id"))
        pts = float(r.get("points", 0.0) or 0.0)
        by_pid_weeks.setdefault(pid, []).append(pts)

    # Expected week points = median(last 3 starts). If <3 starts, median of available; if none, 0.
    exp_week_pts: Dict[str, float] = {}
    for pid, pts_list in by_pid_weeks.items():
        if not pts_list:
            exp_week_pts[pid] = 0.0
        else:
            tail = pts_list[-3:]
            exp_week_pts[pid] = float(statistics.median(tail))

    # Cumulative from start week = exp_week_pts * remaining_weeks
    out: Dict[int, Dict[str, float]] = {}
    for w in range(1, REG_SEASON_WEEKS + 1):
        remain = REG_SEASON_WEEKS - w
        if remain <= 0:
            out[w] = {}
            continue
        cf = {}
        for pid, val in exp_week_pts.items():
            if val > 0.0:
                cf[pid] = round(val * remain, 4)
        out[w] = cf
    return out

# ---------------- MAIN ----------------
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

    print("→ fetching projections …")
    season_year, cur_week = fetch_state()
    cum = build_cumulative_from_sleeper(season_year)

    used_source = "sleeper"
    if not cum:  # fallback if Sleeper projections empty
        print("Sleeper projections empty. Building naive ROS from league lineups …")
        cum = build_cumulative_from_naive(rows)
        used_source = "naive_lineups_median_last3"

    non_empty_weeks = sum(1 for v in cum.values() if v)
    (out_dir / f"proj-{YEAR}-cum.json").write_text(json.dumps({
        "year": YEAR,
        "weeks": REG_SEASON_WEEKS,
        "season_source": season_year,
        "cumulative_from": {str(k): v for k, v in cum.items()},
        "generated_at": int(time.time()),
        "non_empty_weeks": non_empty_weeks,
        "source": used_source
    }, indent=2))
    print(f"saved proj-{YEAR}-cum.json (non_empty_weeks={non_empty_weeks}/{REG_SEASON_WEEKS}, source={used_source})")
    print("✓ done")

if __name__ == "__main__":
    main()
