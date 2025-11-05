#!/usr/bin/env python3
import os, json, math, time
from pathlib import Path
import requests

# -------- config --------
YEAR = 2025
LEAGUE_ID = os.getenv("SLEEPER_LEAGUE_ID", "1262418074540195841")
BASE = "https://api.sleeper.app/v1"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "tatnall-legacy/grades/1.0"})

OUT_DIR = Path(__file__).resolve().parents[1] / "data"  # repo_root/data
OUT_DIR.mkdir(exist_ok=True)

def get(url, **kw):
    r = SESSION.get(url, timeout=30, **kw)
    r.raise_for_status()
    return r.json()

def load_core(league_id):
    users  = get(f"{BASE}/league/{league_id}/users")
    rosters= get(f"{BASE}/league/{league_id}/rosters")
    u_by_id = {}
    for u in users:
        name = u.get("display_name") or u.get("username") or f"user_{u.get('user_id')}"
        team_nick = (u.get("metadata") or {}).get("team_name")
        u_by_id[u["user_id"]] = {"name": name, "team_nick": team_nick}
    r_by_id = {}
    for r in rosters:
        owner_id = r.get("owner_id")
        meta = r.get("metadata") or {}
        rteam = meta.get("team_name") or meta.get("nickname")
        fallback = None
        if owner_id and owner_id in u_by_id:
            fallback = u_by_id[owner_id]["team_nick"] or u_by_id[owner_id]["name"]
        r_by_id[r["roster_id"]] = {
            "owner_id": owner_id,
            "owner_name": u_by_id.get(owner_id, {}).get("name", "Unknown"),
            "team_name": rteam or fallback or f"Roster {r['roster_id']}",
        }
    return r_by_id

def nfl_state():
    s = get(f"{BASE}/state/nfl")
    season = int(s.get("season") or YEAR)
    week   = int(s.get("week") or 0)
    return season, week

def fetch_lineups_per_week(league_id, week, r_by_id):
    """Return rows of: {week, team, player, player_id, started, points}"""
    arr = get(f"{BASE}/league/{league_id}/matchups/{week}") or []
    rows = []
    for m in arr:
        team = r_by_id.get(m.get("roster_id"), {}).get("team_name") or f"Roster {m.get('roster_id')}"
        starters        = m.get("starters") or []
        starters_points = m.get("starters_points") or []
        players_points  = m.get("players_points") or {}
        # Starters
        for i, pid in enumerate(starters):
            if not pid: continue
            pts = float(starters_points[i] if i < len(starters_points) else players_points.get(pid, 0.0) or 0.0)
            rows.append({
                "week": week,
                "team": team,
                "player_id": str(pid),
                "player": str(pid),     # name will be enriched later if you want; not required for compute
                "started": True,
                "points": round(pts, 4),
            })
        # (Optional) non-zero bench — not needed for Δ, skip to keep file small
    return rows

def fetch_projections(season, week):
    """Return {player_id(str): projected_points(float)} for a given week."""
    try:
        arr = get(f"https://api.sleeper.app/projections/nfl/regular/{season}/{week}")
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code in (404, 400):
            return {}
        raise
    out = {}
    for row in arr or []:
        pid = row.get("player_id") or (row.get("player") or {}).get("player_id") or row.get("id")
        if not pid: continue
        pts = row.get("fp") or row.get("fpts") or row.get("proj") or row.get("points") or 0
        try:
            out[str(pid)] = float(pts)
        except Exception:
            pass
    return out

def main():
    season, cur_week = nfl_state()
    r_by_id = load_core(LEAGUE_ID)

    # ------ LINEUPS: started points by team/player across played weeks ------
    lineup_rows = []
    for w in range(1, max(1, cur_week) + 1):
        try:
            lineup_rows.extend(fetch_lineups_per_week(LEAGUE_ID, w, r_by_id))
        except requests.HTTPError as e:
            # stop at first 404 (preseason) or continue on empty
            if e.response is not None and e.response.status_code == 404:
                break
            raise

    (OUT_DIR / f"lineups-{YEAR}.json").write_text(json.dumps({
        "year": YEAR,
        "weeks_recorded": sorted({r["week"] for r in lineup_rows}),
        "rows": lineup_rows
    }, indent=2))

    # ------ PROJECTIONS: cumulative ROS per player for each trade week t ------
    # Build weekly projections for all weeks 1..18, then cumulative-from-(t+1).
    WEEK_MAX = 18
    weekly = {}
    for w in range(1, WEEK_MAX + 1):
        try:
            weekly[w] = fetch_projections(season, w)
        except Exception:
            weekly[w] = {}

    # cumulative_from[w][pid] = sum of projections for weeks (w+1..WEEK_MAX)
    cumulative_from = {}
    all_pids = set()
    for w in range(1, WEEK_MAX + 1):
        # union pids for stable iteration
        for k in weekly.get(w, {}).keys():
            all_pids.add(k)
    for w in range(1, WEEK_MAX + 1):
        acc = {}
        for pid in all_pids:
            s = 0.0
            for u in range(w + 1, WEEK_MAX + 1):
                s += float(weekly.get(u, {}).get(pid, 0.0))
            if s:
                acc[pid] = round(s, 4)
        cumulative_from[w] = acc

    (OUT_DIR / f"proj-{YEAR}-cum.json").write_text(json.dumps({
        "year": YEAR,
        "weeks": WEEK_MAX,
        "cumulative_from": cumulative_from,  # dict[int->dict[player_id->float]]
    }, indent=2))

    print(f"wrote {OUT_DIR}/lineups-{YEAR}.json and {OUT_DIR}/proj-{YEAR}-cum.json")

if __name__ == "__main__":
    main()
