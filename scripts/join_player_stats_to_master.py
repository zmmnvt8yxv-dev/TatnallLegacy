from pathlib import Path
import pandas as pd

MASTER = Path("data_raw/master/players_master_nflverse_espn_sleeper.parquet")
STATS  = Path("data_raw/nflverse_stats/player_stats_2025_2025.parquet")
OUTDIR = Path("data_raw/master")
OUTDIR.mkdir(parents=True, exist_ok=True)

m = pd.read_parquet(MASTER)
s = pd.read_parquet(STATS)

# Find the join key on the stats table (usually gsis_id or player_id in nflverse datasets)
cand = [c for c in ["gsis_id", "player_id"] if c in s.columns]
if not cand:
    raise SystemExit(f"Couldn't find gsis_id/player_id in stats. Columns include: {list(s.columns)[:50]}")
stats_key = cand[0]

# Master has gsis_id from nflverse players
if "gsis_id" not in m.columns:
    raise SystemExit("MASTER missing gsis_id (unexpected).")

j = s.merge(m, left_on=stats_key, right_on="gsis_id", how="left", suffixes=("", "_master"))

out_parq = OUTDIR / "player_stats_2025_with_master.parquet"
out_csv  = OUTDIR / "player_stats_2025_with_master.csv"
j.to_parquet(out_parq, index=False)
j.to_csv(out_csv, index=False)

print("Join key used:", stats_key, "-> gsis_id")
print("Rows:", len(j), "Cols:", len(j.columns))
print("Wrote:", out_parq)
print("Wrote:", out_csv)
print("Unmatched stats rows (no master hit):", int(j["gsis_id"].isna().sum()))
