from pathlib import Path
import pandas as pd
import numpy as np

WEEKLY_IN = Path("data_raw/master/player_week_fantasy_2015_2025_with_td_bonus.parquet")

OUTDIR = Path("data_raw/master")
OUTDIR.mkdir(parents=True, exist_ok=True)

SEASON_OUT = OUTDIR / "player_season_fantasy_2015_2025_consistency.parquet"
CAREER_OUT = OUTDIR / "player_career_fantasy_2015_2025_consistency.parquet"

# Position-based thresholds
POS_THRESHOLDS = {
    "QB":  {"boom": 18, "bust": 8},
    "RB":  {"boom": 15, "bust": 6},
    "WR":  {"boom": 15, "bust": 6},
    "TE":  {"boom": 12, "bust": 5},
    "K":   {"boom": 12, "bust": 4},
    "DEF": {"boom": 10, "bust": 3},
}

def get_thresholds(pos):
    d = POS_THRESHOLDS.get(pos, {"boom": 15, "bust": 6})
    return d["boom"], d["bust"]

def main():
    df = pd.read_parquet(WEEKLY_IN)

    if "fantasy_points_custom_week_with_bonus" in df.columns:
        fp = "fantasy_points_custom_week_with_bonus"
    else:
        fp = "fantasy_points_custom_week"

    df[fp] = pd.to_numeric(df[fp], errors="coerce").fillna(0.0)

    # Compute per-row thresholds
    df["boom_threshold"] = df["position"].apply(lambda p: get_thresholds(p)[0])
    df["bust_threshold"] = df["position"].apply(lambda p: get_thresholds(p)[1])

    df["is_boom"] = df[fp] >= df["boom_threshold"]
    df["is_bust"] = df[fp] <= df["bust_threshold"]
    df["is_played"] = df[fp] > 0

    group_keys = ["gsis_id","season"]
    if "season_type" in df.columns:
        group_keys.append("season_type")

    id_cols = [
        "display_name","player_name","player_display_name",
        "position","position_group","team"
    ]
    id_cols = [c for c in id_cols if c in df.columns]

    # ===== SEASON AGG =====
    season = (
        df.groupby(group_keys, as_index=False)
          .agg(
              weeks=("week","count"),
              games_played=("is_played","sum"),
              boom_weeks_pos=("is_boom","sum"),
              bust_weeks_pos=("is_bust","sum"),
              fantasy_points=("fantasy_points_custom_week_with_bonus","sum"),
          )
    )

    season["boom_rate_pos"] = season["boom_weeks_pos"] / season["weeks"]
    season["bust_rate_pos"] = season["bust_weeks_pos"] / season["weeks"]
    season["fantasy_points_pg"] = season["fantasy_points"] / season["games_played"]

    # ⭐ Consistency score
    season["consistency_score"] = (
        season["boom_rate_pos"] - season["bust_rate_pos"]
    )

    # Attach identity columns
    id_block = (
        df.groupby(group_keys, as_index=False)[id_cols]
          .first()
    )
    season = id_block.merge(season, on=group_keys, how="left")

    # ===== CAREER AGG =====
    career = (
        season.groupby(["gsis_id"], as_index=False)
              .agg(
                  seasons=("season","nunique"),
                  games_played=("games_played","sum"),
                  fantasy_points=("fantasy_points","sum"),
                  boom_weeks_pos=("boom_weeks_pos","sum"),
                  bust_weeks_pos=("bust_weeks_pos","sum"),
                  weeks=("weeks","sum"),
              )
    )

    career["fantasy_points_pg"] = career["fantasy_points"] / career["games_played"]
    career["boom_rate_pos"] = career["boom_weeks_pos"] / career["weeks"]
    career["bust_rate_pos"] = career["bust_weeks_pos"] / career["weeks"]
    career["consistency_score"] = career["boom_rate_pos"] - career["bust_rate_pos"]

    # Attach identity
    id_block_career = (
        df.groupby("gsis_id", as_index=False)[id_cols]
          .first()
    )
    career = id_block_career.merge(career, on="gsis_id", how="right")

    # Write outputs
    season.to_parquet(SEASON_OUT, index=False)
    career.to_parquet(CAREER_OUT, index=False)

    print("=== CONSISTENCY METRICS BUILT ===")
    print("Season rows:", len(season))
    print("Career rows:", len(career))
    print("Wrote:", SEASON_OUT)
    print("Wrote:", CAREER_OUT)

if __name__ == "__main__":
    main()
