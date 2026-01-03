# scripts/build_player_week_war_and_marginal.py
from __future__ import annotations

import numpy as np
import pandas as pd
from pathlib import Path

IN_WEEK = Path("data_raw/master/player_week_fantasy_2015_2025_with_z.parquet")

OUT_WEEK = Path("data_raw/master/player_week_fantasy_2015_2025_with_war.parquet")
OUT_SEASON = Path("data_raw/master/player_season_fantasy_2015_2025_with_war.parquet")
OUT_CAREER = Path("data_raw/master/player_career_fantasy_2015_2025_with_war.parquet")

# --- Choose which weekly points column to treat as "truth" ---
PTS_COL = "fantasy_points_custom_week_with_bonus"

# --- Starter cutoffs for "replacement"/starter pool ---
# League format: 8 teams, 2QB + 3RB + 3WR + 2 FLEX + 2 TE + 1 DEF + 1 K
# Replacement baselines assume fixed starters (flex handled separately in analysis).
STARTER_CUTOFF = {
    "QB": 16,
    "RB": 24,
    "WR": 24,
    "TE": 16,
    "K": 8,
    "DEF": 8,
}


def _prep_active_weeks(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()

    # Keep only rows with a meaningful weekly stat line
    d = d[d[PTS_COL].notna()].copy()

    # If you have percentiles, use them to exclude truly inactive weeks
    if "pos_week_percentile" in d.columns:
        d = d[d["pos_week_percentile"].fillna(0) > 0].copy()

    # Normalize position strings
    d["position"] = d["position"].astype(str).str.upper()

    return d


def add_delta_to_next(d: pd.DataFrame) -> pd.DataFrame:
    # Value over the next guy (all players)
    d = d.sort_values(["season", "week", "position", PTS_COL], ascending=[True, True, True, False]).copy()

    d["pos_rank_all"] = d.groupby(["season", "week", "position"])[PTS_COL].rank(
        method="first", ascending=False
    ).astype("int32")

    d["next_points_week_all"] = d.groupby(["season", "week", "position"])[PTS_COL].shift(-1)
    d["delta_to_next_week_all"] = d[PTS_COL] - d["next_points_week_all"]
    d["delta_to_next_week_all"] = d["delta_to_next_week_all"].fillna(0.0)

    # Value over the next guy (starter pool only: top N)
    # We compute within each (season, week, position) using the cutoff.
    def _starter_mask(sub: pd.DataFrame) -> pd.Series:
        pos = sub.name[2]
        n = int(STARTER_CUTOFF.get(pos, 0))
        if n <= 0:
            return pd.Series(False, index=sub.index)
        return sub["pos_rank_all"] <= n

    starter_mask = d.groupby(["season", "week", "position"], group_keys=False).apply(_starter_mask)
    d["is_starter_pool"] = starter_mask.values

    d["pos_rank_starters"] = np.where(d["is_starter_pool"], d["pos_rank_all"], np.nan)

    # For starters only, "next" is next within starter pool
    d["next_points_week_starters"] = np.nan
    d.loc[d["is_starter_pool"], "next_points_week_starters"] = (
        d[d["is_starter_pool"]]
        .groupby(["season", "week", "position"])[PTS_COL]
        .shift(-1)
        .values
    )

    d["delta_to_next_week_starters"] = d[PTS_COL] - d["next_points_week_starters"]
    d["delta_to_next_week_starters"] = d["delta_to_next_week_starters"].fillna(0.0)

    return d


def add_replacement_war(d: pd.DataFrame) -> pd.DataFrame:
    # Replacement baseline per (season, week, position) = Nth best score where N = STARTER_CUTOFF[pos]
    # Then WAR = points - baseline
    d = d.copy()

    # Build baseline table
    baselines = []
    for (season, week, pos), sub in d.groupby(["season", "week", "position"]):
        n = int(STARTER_CUTOFF.get(pos, 0))
        if n <= 0:
            continue

        sub_sorted = sub.sort_values(PTS_COL, ascending=False)
        if len(sub_sorted) >= n:
            baseline = float(sub_sorted.iloc[n - 1][PTS_COL])
        else:
            # If fewer than N players recorded, use last available
            baseline = float(sub_sorted.iloc[-1][PTS_COL])

        baselines.append((season, week, pos, n, baseline))

    b = pd.DataFrame(baselines, columns=["season", "week", "position", "starter_cutoff", "replacement_baseline_week"])
    d = d.merge(b, on=["season", "week", "position"], how="left")

    d["war_rep_week_all"] = d[PTS_COL] - d["replacement_baseline_week"]
    d["war_rep_week_all"] = d["war_rep_week_all"].fillna(0.0)

    # For starter pool only, you can choose:
    # - either still compute WAR for all players vs that baseline (done above),
    # - OR set non-starter-pool to 0 so “starter WAR only” focuses on relevant players.
    d["war_rep_week_starters"] = np.where(d["is_starter_pool"], d["war_rep_week_all"], 0.0)

    return d


def rollups(d: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    # Season rollup from weekly truth
    season = (
        d.groupby(["gsis_id", "display_name", "position", "team", "season"], as_index=False)
        .agg(
            games=("week", "count"),
            fantasy_points_custom=("fantasy_points_custom_week_with_bonus", "sum"),
            fantasy_points_custom_pg=("fantasy_points_custom_week_with_bonus", "mean"),

            war_rep=("war_rep_week_all", "sum"),
            war_rep_pg=("war_rep_week_all", "mean"),

            war_rep_starters=("war_rep_week_starters", "sum"),
            war_rep_starters_pg=("war_rep_week_starters", "mean"),

            delta_to_next=("delta_to_next_week_all", "sum"),
            delta_to_next_pg=("delta_to_next_week_all", "mean"),

            delta_to_next_starters=("delta_to_next_week_starters", "sum"),
            delta_to_next_starters_pg=("delta_to_next_week_starters", "mean"),

            boom_weeks_90p=("pos_week_percentile", lambda s: float((s >= 0.90).sum()) if "pos_week_percentile" in d.columns else 0.0),
        )
    )

    # Career rollup from weekly truth
    career = (
        d.groupby(["gsis_id", "display_name", "position"], as_index=False)
        .agg(
            games=("week", "count"),
            seasons=("season", "nunique"),
            fantasy_points_custom=("fantasy_points_custom_week_with_bonus", "sum"),
            fantasy_points_custom_pg=("fantasy_points_custom_week_with_bonus", "mean"),

            war_rep=("war_rep_week_all", "sum"),
            war_rep_pg=("war_rep_week_all", "mean"),

            war_rep_starters=("war_rep_week_starters", "sum"),
            war_rep_starters_pg=("war_rep_week_starters", "mean"),

            delta_to_next=("delta_to_next_week_all", "sum"),
            delta_to_next_pg=("delta_to_next_week_all", "mean"),

            delta_to_next_starters=("delta_to_next_week_starters", "sum"),
            delta_to_next_starters_pg=("delta_to_next_week_starters", "mean"),
        )
    )

    return season, career


def main():
    df = pd.read_parquet(IN_WEEK)
    d = _prep_active_weeks(df)

    # Compute B first (it creates starter pool flags we reuse)
    d = add_delta_to_next(d)

    # Compute A
    d = add_replacement_war(d)

    # Write weekly
    OUT_WEEK.parent.mkdir(parents=True, exist_ok=True)
    d.to_parquet(OUT_WEEK, index=False)
    d.to_csv(OUT_WEEK.with_suffix(".csv"), index=False)

    # Rollups
    season, career = rollups(d)

    season.to_parquet(OUT_SEASON, index=False)
    season.to_csv(OUT_SEASON.with_suffix(".csv"), index=False)

    career.to_parquet(OUT_CAREER, index=False)
    career.to_csv(OUT_CAREER.with_suffix(".csv"), index=False)

    print("=== WEEK + SEASON + CAREER WAR + MARGINAL BUILT ===")
    print("Weekly rows:", len(d), "cols:", len(d.columns))
    print("Season rows:", len(season), "cols:", len(season.columns))
    print("Career rows:", len(career), "cols:", len(career.columns))
    print("Wrote:", OUT_WEEK)
    print("Wrote:", OUT_SEASON)
    print("Wrote:", OUT_CAREER)


if __name__ == "__main__":
    main()
