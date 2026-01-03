from pathlib import Path
import pandas as pd
import numpy as np

INP = Path("data_raw/master/player_season_stats_2015_2025.parquet")
OUTDIR = Path("data_raw/master")
OUTDIR.mkdir(parents=True, exist_ok=True)

df = pd.read_parquet(INP)

# ---- choose identifier + label columns ----
id_col = "gsis_id" if "gsis_id" in df.columns else None
if not id_col:
    raise SystemExit("Expected gsis_id in season aggregates file.")

label_cols = [c for c in ["display_name","position","team","espn_id","sleeper_id"] if c in df.columns]

# ---- numeric columns to aggregate (sum) ----
exclude = set([id_col, "season"] + label_cols)
num_cols = [c for c in df.columns if c not in exclude and pd.api.types.is_numeric_dtype(df[c])]

# Make sure games_played exists or create a safe fallback
if "games_played" not in df.columns:
    # if your season data has "games" or "g" use it
    for alt in ["games","g"]:
        if alt in df.columns and pd.api.types.is_numeric_dtype(df[alt]):
            df["games_played"] = df[alt]
            break
    else:
        df["games_played"] = np.nan
        print("WARN: games_played not found; created but mostly NaN.")

# ---- aggregate ----
# stable labels: take last non-null (most recent season)
def last_nonnull(s):
    s2 = s.dropna()
    return s2.iloc[-1] if len(s2) else ""

# sort so "last" means most recent season
df = df.sort_values(["gsis_id","season"])

agg_dict = {c: "sum" for c in num_cols}
agg_dict["season"] = ["min", "max", "nunique"]
for c in label_cols:
    agg_dict[c] = last_nonnull

career = (
    df.groupby(id_col, as_index=False)
      .agg(agg_dict)
)

# flatten multiindex cols from season min/max/nunique
career.columns = [
    f"{a}_{b}" if b else a
    for (a,b) in (career.columns if isinstance(career.columns, pd.MultiIndex) else [(c,"") for c in career.columns])
]

# Rename the season summary columns into nicer names
ren = {
    "season_min": "first_season",
    "season_max": "last_season",
    "season_nunique": "seasons_played",
}
career = career.rename(columns=ren)

# Ensure games_played is present and numeric
if "games_played" in career.columns:
    career["games_played"] = pd.to_numeric(career["games_played"], errors="coerce")

out_parq = OUTDIR / "player_career_aggregates_2015_2025.parquet"
out_csv  = OUTDIR / "player_career_aggregates_2015_2025.csv"
career.to_parquet(out_parq, index=False)
career.to_csv(out_csv, index=False)

print("=== CAREER AGGREGATES BUILT ===")
print("Rows:", len(career), "Cols:", len(career.columns))
print("Wrote:", out_parq)
print("Wrote:", out_csv)
