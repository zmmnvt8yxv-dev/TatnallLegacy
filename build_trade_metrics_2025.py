# .github/workflows/build-trade-metrics.yml
name: Build Trade Metrics (2025)

on:
  workflow_dispatch:
  push:
    branches: [ main, master ]
    paths:
      - scripts/build_trade_metrics_2025.py
      - .github/workflows/build-trade-metrics.yml
  schedule:
    - cron: "22 6 * * 2,5"

permissions:
  contents: write

concurrency:
  group: build-trade-metrics
  cancel-in-progress: false

env:
  PYTHON_VERSION: "3.11"
  DEFAULT_LEAGUE_ID: "1262418074540195841"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install requests

      - name: Run trade metrics builder
        env:
          SLEEPER_LEAGUE_ID: ${{ secrets.SLEEPER_LEAGUE_ID }}
        run: |
          set -euo pipefail
          mkdir -p data
          LID="${SLEEPER_LEAGUE_ID:-${DEFAULT_LEAGUE_ID}}"
          echo "Using League ID: $LID"
          python scripts/build_trade_metrics_2025.py "$LID"

      - name: Commit any new data
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/lineups-2025.json data/proj-2025-cum.json || true
          if ! git diff --cached --quiet; then
            git commit -m "Update trade metrics data [skip ci]"
            git push
          else
            echo "No data changes detected."
          fi

      - name: Upload artifacts (best-effort)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: trade-metrics-2025-${{ github.run_id }}-${{ github.run_attempt }}
          path: |
            data/lineups-2025.json
            data/proj-2025-cum.json
          if-no-files-found: warn                })
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
