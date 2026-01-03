#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
import pandas as pd


IN_WEEK = Path("data_raw/master/player_week_fantasy_2015_2025_with_z.parquet")

OUT_WEEK = Path("data_raw/master/player_week_fantasy_war_2015_2025.parquet")
OUT_SEASON = Path("data_raw/master/player_season_fantasy_war_2015_2025.parquet")
OUT_CAREER = Path("data_raw/master/player_career_fantasy_war_2015_2025.parquet")

# Which weekly fantasy column to treat as "true" points
POINTS_COL = os.getenv("WAR_POINTS_COL", "fantasy_points_custom_week_with_bonus")

# Replacement ranks (N-th best at position each week). Tune anytime.
DEFAULT_REPL = {
    "QB": 12,
    "RB": 36,
    "WR": 36,
    "TE": 12,
    # Optional if you have these in weekly:
    "K": 12,
    "DEF": 12,
}
# Allow env override e.g. WAR_REPL_RB=30
REPL_RANK = {k: int(os.getenv(f"WAR_REPL_{k}", v)) for k, v in DEFAULT_REPL.items()}

# If you want WAR to be "above replacement only", clamp negatives to 0.
CLAMP_ZERO = os.getenv("WAR_CLAMP_ZERO", "0").strip() == "1"

# Filter to regular season only (recommended). Set WAR_SEASON_TYPE="" to disable.
SEASON_TYPE_FILTER = os.getenv("WAR_SEASON_TYPE", "REG").strip()


def ensure_parent(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)


def pick_points_col(df: pd.DataFrame) -> str:
    if POINTS_COL in df.columns:
        return POINTS_COL
    # common fallback if naming differs
    for c in [
        "fantasy_points_custom_week_with_bonus",
        "fantasy_points_custom_week",
        "fantasy_points_custom",
    ]:
        if c in df.columns:
            return c
    raise KeyError(
        f"Could not find weekly points column. Tried {POINTS_COL} and common fallbacks."
    )


def compute_replacement_points_week(df: pd.DataFrame, pts_col: str) -> pd.DataFrame:
    """
    For each (season, week, position), define replacement as the Nth highest scorer
    at that position that week. N is position-specific (REPL_RANK).

    We compute this on "active weeks" only (pos_week_percentile > 0 if present),
    otherwise on rows with pts_col not-null.
    """
    d = df.copy()

    # "active week" filter if available
    if "pos_week_percentile" in d.columns:
        d = d[d["pos_week_percentile"].fillna(0) > 0].copy()
    else:
        d = d[d[pts_col].notna()].copy()

    # only positions we know how to baseline
    d = d[d["position"].isin(REPL_RANK.keys())].copy()

    # rank within each week/position by points descending
    d["_rank_pos_week"] = (
        d.groupby(["season", "week", "position"])[pts_col]
        .rank(method="first", ascending=False)
    )

    # choose the Nth scorer as replacement for each pos/week
    # if a week has fewer than N players, we fall back to the minimum that week.
    repl_rows = []
    for pos, n in REPL_RANK.items():
        sub = d[d["position"] == pos].copy()
        # exact Nth rows
        exact = sub[sub["_rank_pos_week"] == float(n)][["season", "week", "position", pts_col]].copy()
        exact = exact.rename(columns={pts_col: "replacement_points_week"})
        exact["replacement_rank"] = n

        # fallback: week/pos min (only used where exact missing)
        mins = (
            sub.groupby(["season", "week", "position"], as_index=False)[pts_col]
            .min()
            .rename(columns={pts_col: "replacement_points_week"})
        )
        mins["replacement_rank"] = n
        mins["_is_fallback_min"] = True

        exact["_is_fallback_min"] = False

        repl_rows.append(pd.concat([exact, mins], ignore_index=True))

    repl = pd.concat(repl_rows, ignore_index=True)

    # Deduplicate: prefer exact over fallback min for each key
    repl = repl.sort_values(
        ["season", "week", "position", "_is_fallback_min"],
        ascending=[True, True, True, True],
    )
    repl = repl.drop_duplicates(["season", "week", "position"], keep="first")

    repl = repl.drop(columns=["_is_fallback_min"], errors="ignore")

    return repl


def main() -> None:
    if not IN_WEEK.exists():
        raise FileNotFoundError(f"Missing input: {IN_WEEK}")

    df = pd.read_parquet(IN_WEEK)

    # optional season_type filter
    if SEASON_TYPE_FILTER and "season_type" in df.columns:
        df = df[df["season_type"] == SEASON_TYPE_FILTER].copy()

    pts_col = pick_points_col(df)

    # compute replacement per week/pos and merge back
    repl = compute_replacement_points_week(df, pts_col)
    out = df.merge(repl, on=["season", "week", "position"], how="left")

    # compute WAR week
    out["fantasy_war_week"] = out[pts_col] - out["replacement_points_week"]
    if CLAMP_ZERO:
        out["fantasy_war_week"] = out["fantasy_war_week"].clip(lower=0)

    # ---- outputs ----
    ensure_parent(OUT_WEEK)
    ensure_parent(OUT_SEASON)
    ensure_parent(OUT_CAREER)

    # Weekly WAR table
    out.to_parquet(OUT_WEEK, index=False)

    # Season WAR aggregation
    group_keys_season = ["gsis_id", "display_name", "position", "team", "season"]
    if "player_id" in out.columns:
        group_keys_season.insert(1, "player_id")

    season = (
        out.groupby(group_keys_season, as_index=False)
        .agg(
            games_played=("week", "count"),
            fantasy_points_custom_season=(pts_col, "sum"),
            replacement_points_season=("replacement_points_week", "sum"),
            fantasy_war_season=("fantasy_war_week", "sum"),
            war_pg=("fantasy_war_week", "mean"),
            pts_pg=(pts_col, "mean"),
        )
    )

    season.to_parquet(OUT_SEASON, index=False)

    # Career WAR aggregation (sum seasons)
    group_keys_career = ["gsis_id", "display_name", "position"]
    if "player_id" in out.columns:
        group_keys_career.insert(1, "player_id")

    career = (
        season.groupby(group_keys_career, as_index=False)
        .agg(
            seasons=("season", "nunique"),
            games_played=("games_played", "sum"),
            fantasy_points_custom_career=("fantasy_points_custom_season", "sum"),
            replacement_points_career=("replacement_points_season", "sum"),
            fantasy_war_career=("fantasy_war_season", "sum"),
        )
    )
    career["war_pg"] = career["fantasy_war_career"] / career["games_played"].where(career["games_played"] != 0, pd.NA)
    career["pts_pg"] = career["fantasy_points_custom_career"] / career["games_played"].where(career["games_played"] != 0, pd.NA)

    career.to_parquet(OUT_CAREER, index=False)

    print("=== FANTASY WAR BUILT ===")
    print("Using points col:", pts_col)
    print("Replacement ranks:", REPL_RANK)
    print("Clamp zero:", CLAMP_ZERO)
    print("Weekly rows:", len(out), "cols:", len(out.columns))
    print("Wrote:", OUT_WEEK)
    print("Season rows:", len(season), "cols:", len(season.columns))
    print("Wrote:", OUT_SEASON)
    print("Career rows:", len(career), "cols:", len(career.columns))
    print("Wrote:", OUT_CAREER)


if __name__ == "__main__":
    main()
