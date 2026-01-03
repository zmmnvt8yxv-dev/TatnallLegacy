from pathlib import Path
import pandas as pd

INP = Path("data_raw/master/player_stats_2015_2025_players_only.parquet")
OUTDIR = Path("data_raw/master")
OUTDIR.mkdir(parents=True, exist_ok=True)

df = pd.read_parquet(INP)

# ---- REQUIRED COLUMNS ----
REQ = ["gsis_id", "season", "week"]
missing = [c for c in REQ if c not in df.columns]
if missing:
    raise SystemExit(f"Missing required columns: {missing}")

# ---- IDENTIFIER COLUMNS (kept, first value per season) ----
id_cols = [
    "gsis_id",
    "espn_id",
    "sleeper_id",
    "display_name",
    "first_name",
    "last_name",
    "position",
    "team",
]
id_cols = [c for c in id_cols if c in df.columns]

# ---- BUILD NAMED AGG MAP ----
named_agg = {}

for c in df.columns:
    if c in id_cols or c in ["season", "week"]:
        continue

    # Only aggregate numeric columns (prevents weird object columns blowing up)
    if not pd.api.types.is_numeric_dtype(df[c]):
        continue

    lc = c.lower()

    if any(k in lc for k in ["yards", "attempt", "touchdown", "reception", "carry", "target",
                             "fumble", "interception", "sack", "air_yards"]):
        named_agg[c] = (c, "sum")
    elif any(k in lc for k in ["long", "max"]):
        named_agg[c] = (c, "max")
    elif any(k in lc for k in ["rate", "pct", "percentage", "avg"]):
        named_agg[c] = (c, "mean")
    else:
        named_agg[c] = (c, "sum")

# games played: count unique weeks with any row
named_agg["games_played"] = ("week", "nunique")

# ---- RUN AGGREGATION ----
season_stats = (
    df
    .groupby(["gsis_id", "season"], as_index=False)
    .agg(**named_agg)
)

# ---- ATTACH IDENTIFIERS ----
ids = (
    df
    .groupby(["gsis_id", "season"], as_index=False)[id_cols]
    .first()
)

out = ids.merge(season_stats, on=["gsis_id", "season"], how="left")
out = out.sort_values(["season", "position", "display_name"], ignore_index=True)

# ---- WRITE OUTPUTS ----
parq = OUTDIR / "player_season_stats_2015_2025.parquet"
csv  = OUTDIR / "player_season_stats_2015_2025.csv"
cols = OUTDIR / "player_season_stats_columns.csv"

out.to_parquet(parq, index=False)
out.to_csv(csv, index=False)
pd.DataFrame({"column": out.columns}).to_csv(cols, index=False)

print("=== PLAYER SEASON AGGREGATES BUILT ===")
print("Rows:", len(out))
print("Cols:", len(out.columns))
print("Seasons:", sorted(out["season"].unique().tolist()))
print("Wrote:", parq)
print("Wrote:", csv)
print("Wrote:", cols)
