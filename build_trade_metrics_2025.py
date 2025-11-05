#!/usr/bin/env python3
import os, sys, json, time
from pathlib import Path
import requests

# ---------- CONFIG ----------
DEFAULT_LEAGUE_ID = "1262418074540195841"
YEAR = 2025
BASE = "https://api.sleeper.app/v1"

# ---------- UTILITIES ----------
def resolve_league_id():
    lid = os.getenv("SLEEPER_LEAGUE_ID") or (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LEAGUE_ID)
    lid = str(lid).strip()
    if not lid:
        raise SystemExit("ERROR: No Sleeper League ID set. Use env SLEEPER_LEAGUE_ID or pass as argument.")
    return lid

def req_json(url):
    r = requests.get(url, timeout=30, headers={"User-Agent": "tatnall-legacy/metrics/1.0"})
    try:
        r.raise_for_status()
    except requests.HTTPError:
        print(f"[HTTP {r.status_code}] {url}")
        raise
    return r.json()

# ---------- CORE FETCHERS ----------
def get_lineups(league_id):
    """Fetch lineups and player scoring for each week"""
    data = []
    for week in range(1, 19):
        try:
            matchups = req_json(f"{BASE}/league/{league_id}/matchups/{week}")
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                break
            raise
        for m in matchups:
            rid = m.get("roster_id")
            starters = m.get("starters", [])
            players_points = m.get("players_points", {}) or {}
            for pid in starters:
                data.append({
                    "week": week,
                    "team_id": rid,
                    "player_id": pid,
                    "points": players_points.get(pid, 0.0)
                })
        time.sleep(0.4)
    return data

def get_projections():
    """Simplified placeholder for player rest-of-season expectations"""
    # This stub should be replaced with true projection integration later.
    # Currently builds an empty structure to avoid breaking downstream code.
    return {"timestamp": time.time(), "source": "placeholder", "players": {}}

# ---------- MAIN ----------
def main():
    league_id = resolve_league_id()
    print(f"Building trade metrics for {league_id} ({YEAR})")

    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)

    print("→ Fetching lineups/scoring…")
    lineups = get_lineups(league_id)
    with open(data_dir / f"lineups-{YEAR}.json", "w") as f:
        json.dump({"year": YEAR, "league_id": league_id, "lineups": lineups}, f, indent=2)
    print(f"Saved {len(lineups)} lineup rows.")

    print("→ Generating placeholder projections…")
    proj = get_projections()
    with open(data_dir / f"proj-{YEAR}-cum.json", "w") as f:
        json.dump(proj, f, indent=2)
    print("Projections saved (placeholder only).")

    print("✅ Completed build_trade_metrics_2025.py")

if __name__ == "__main__":
    main()
