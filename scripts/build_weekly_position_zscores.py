from pathlib import Path
import numpy as np
import pandas as pd

INP  = Path("data_raw/master/player_week_fantasy_2015_2025_with_td_bonus.parquet")
OUTP = Path("data_raw/master/player_week_fantasy_2015_2025_with_z.parquet")
OUTC = Path("data_raw/master/player_week_fantasy_2015_2025_with_z.csv")

# Minimum weekly points to consider “active” for distribution
# (prevents random 0.0 rows from crushing weekly means)
ACTIVE_MIN_POINTS = 0.01

def main():
    df = pd.read_parquet(INP)

    # choose the right weekly fantasy column
    if "fantasy_points_custom_week_with_bonus" in df.columns:
        fp = "fantasy_points_custom_week_with_bonus"
    elif "fantasy_points_custom_week" in df.columns:
        fp = "fantasy_points_custom_week"
    else:
        raise KeyError("No weekly fantasy points column found.")

    df[fp] = pd.to_numeric(df[fp], errors="coerce").fillna(0.0)

    keys = ["season", "week", "position"]
    if "season_type" in df.columns:
        keys.append("season_type")

    # Build per-(season,week,position[,season_type]) mean/std using only “active” rows
    active = df[df[fp] >= ACTIVE_MIN_POINTS].copy()

    grp = (
        active.groupby(keys)[fp]
        .agg(pos_week_mean="mean", pos_week_std="std", pos_week_n="count")
        .reset_index()
    )

    # Merge back to all rows so every player-week gets the contextual mean/std
    out = df.merge(grp, on=keys, how="left")

    # If std is NaN/0 (tiny sample), z-score should be 0 (neutral)
    std = out["pos_week_std"].replace(0, np.nan)
    out["pos_week_z"] = (out[fp] - out["pos_week_mean"]) / std
    out["pos_week_z"] = out["pos_week_z"].replace([np.inf, -np.inf], np.nan).fillna(0.0)

    # Percentile within position-week (using rank over active subset)
    # Approach: rank only among active rows, then merge percentiles back.
    active2 = out[out[fp] >= ACTIVE_MIN_POINTS].copy()
    active2["_rank"] = active2.groupby(keys)[fp].rank(method="average", pct=True)
    pct = active2[keys + ["gsis_id", "_rank"]].rename(columns={"_rank": "pos_week_percentile"})

    out = out.merge(pct, on=keys + ["gsis_id"], how="left")
    out["pos_week_percentile"] = out["pos_week_percentile"].fillna(0.0)

    out.to_parquet(OUTP, index=False)
    out.to_csv(OUTC, index=False)

    print("=== WEEKLY POSITION Z-SCORES BUILT ===")
    print("Rows:", len(out), "Cols:", len(out.columns))
    print("Fantasy column used:", fp)
    print("Wrote:", OUTP)
    print("Wrote:", OUTC)

if __name__ == "__main__":
    main()
