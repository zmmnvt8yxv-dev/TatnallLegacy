# scripts/build_player_week_war.py
from __future__ import annotations

import numpy as np
import pandas as pd
from pathlib import Path

IN_PATH = Path("data_raw/master/player_week_fantasy_2015_2025_with_z.parquet")

OUT_WEEK = Path("data_raw/master/player_week_war_2015_2025.parquet")
OUT_SEASON = Path("data_raw/master/player_season_war_2015_2025.parquet")
OUT_CAREER = Path("data_raw/master/player_career_war_2015_2025.parquet")

# 8-team league lineup demand
TEAMS = 8
BASE_STARTERS = {
    "QB": TEAMS * 2,  # 16
    "RB": TEAMS * 3,  # 24
    "WR": TEAMS * 3,  # 24
    "TE": TEAMS * 2,  # 16
}
FLEX_SLOTS = TEAMS * 2  # 16 (RB/WR/TE only)

# "waiver-ish" cushion beyond last starter
BUFFERS = {"QB": 4, "RB": 6, "WR": 6, "TE": 4}

POINTS_COL = "fantasy_points_custom_week_with_bonus"

def _require_cols(df: pd.DataFrame, cols: list[str]) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

def compute_flex_shares(week_df: pd.DataFrame) -> dict[str, int]:
    """
    For a given (season, week) slice:
      1) remove base starters at RB/WR/TE
      2) choose top FLEX_SLOTS remaining among RB/WR/TE
      3) return counts by position (RB/WR/TE)
    """
    elig = week_df[week_df["position"].isin(["RB", "WR", "TE"])].copy()
    elig = elig.sort_values(POINTS_COL, ascending=False)

    # Drop base starters per position
    kept = []
    for pos in ["RB", "WR", "TE"]:
        pos_df = elig[elig["position"] == pos]
        kept.append(pos_df.iloc[BASE_STARTERS[pos]:])  # after base starters
    remaining = pd.concat(kept, ignore_index=True)

    flex = remaining.sort_values(POINTS_COL, ascending=False).head(FLEX_SLOTS)
    counts = flex["position"].value_counts().to_dict()
    return {"RB": int(counts.get("RB", 0)), "WR": int(counts.get("WR", 0)), "TE": int(counts.get("TE", 0))}

def replacement_points_for_pos(week_df: pd.DataFrame, pos: str, cutoff_rank: int) -> float:
    """
    week_df is already filtered to one week.
    Return the points of the player at (cutoff_rank) within position that week.
    If not enough players, fallback to last available player in that position.
    """
    pos_df = week_df[week_df["position"] == pos].sort_values(POINTS_COL, ascending=False)
    if len(pos_df) == 0:
        return 0.0
    idx = min(cutoff_rank - 1, len(pos_df) - 1)  # ranks are 1-based
    return float(pos_df.iloc[idx][POINTS_COL])

def main():
    df = pd.read_parquet(IN_PATH)
    _require_cols(df, ["season", "week", "gsis_id", "display_name", "team", "position", POINTS_COL])

    # Only skill positions we care about for WAR now
    d = df[df["position"].isin(["QB", "RB", "WR", "TE"])].copy()

    out_rows = []

    for (season, week), wk in d.groupby(["season", "week"], sort=True):
        wk = wk.copy()

        flex_share = compute_flex_shares(wk)
        cutoffs = {
            "QB": BASE_STARTERS["QB"] + BUFFERS["QB"],
            "RB": BASE_STARTERS["RB"] + flex_share["RB"] + BUFFERS["RB"],
            "WR": BASE_STARTERS["WR"] + flex_share["WR"] + BUFFERS["WR"],
            "TE": BASE_STARTERS["TE"] + flex_share["TE"] + BUFFERS["TE"],
        }

        rep_points = {pos: replacement_points_for_pos(wk, pos, cutoffs[pos]) for pos in cutoffs.keys()}

        # Rank within position for delta_to_next
        wk["pos_rank"] = (
            wk.groupby("position")[POINTS_COL]
              .rank(method="first", ascending=False)
              .astype(int)
        )
        wk = wk.sort_values(["position", "pos_rank"])

        # Compute next-guy delta
        wk["next_points_same_pos"] = wk.groupby("position")[POINTS_COL].shift(-1)
        wk["delta_to_next_week"] = wk[POINTS_COL] - wk["next_points_same_pos"]
        wk["delta_to_next_week"] = wk["delta_to_next_week"].fillna(0.0)

        # WAR vs replacement
        wk["replacement_points_week"] = wk["position"].map(rep_points).astype(float)
        wk["war_week"] = wk[POINTS_COL] - wk["replacement_points_week"]

        # annotate flex shares/cutoffs for debugging
        wk["flex_share_rb"] = flex_share["RB"]
        wk["flex_share_wr"] = flex_share["WR"]
        wk["flex_share_te"] = flex_share["TE"]
        wk["rep_cutoff_qb"] = cutoffs["QB"]
        wk["rep_cutoff_rb"] = cutoffs["RB"]
        wk["rep_cutoff_wr"] = cutoffs["WR"]
        wk["rep_cutoff_te"] = cutoffs["TE"]

        out_rows.append(wk)

    week_out = pd.concat(out_rows, ignore_index=True)

    OUT_WEEK.parent.mkdir(parents=True, exist_ok=True)
    week_out.to_parquet(OUT_WEEK, index=False)
    print("Wrote:", OUT_WEEK, "rows:", len(week_out), "cols:", len(week_out.columns))

    # Season + Career WAR (sum of weekly)
    season = (week_out.groupby(["gsis_id", "display_name", "position", "season"], as_index=False)
              .agg(team=("team", "last"),
                   games=("week", "count"),
                   points=(POINTS_COL, "sum"),
                   war=("war_week", "sum"),
                   delta_to_next=("delta_to_next_week", "sum"),
                   avg_war=("war_week", "mean"),
                   avg_points=(POINTS_COL, "mean")))

    season.to_parquet(OUT_SEASON, index=False)
    print("Wrote:", OUT_SEASON, "rows:", len(season), "cols:", len(season.columns))

    career = (season.groupby(["gsis_id", "display_name", "position"], as_index=False)
              .agg(seasons=("season", "nunique"),
                   games=("games", "sum"),
                   points=("points", "sum"),
                   war=("war", "sum"),
                   delta_to_next=("delta_to_next", "sum"),
                   avg_war=("avg_war", "mean"),
                   avg_points=("avg_points", "mean")))

    career.to_parquet(OUT_CAREER, index=False)
    print("Wrote:", OUT_CAREER, "rows:", len(career), "cols:", len(career.columns))

if __name__ == "__main__":
    main()
