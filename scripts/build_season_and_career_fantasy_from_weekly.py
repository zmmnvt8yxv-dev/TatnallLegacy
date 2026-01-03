from pathlib import Path
import pandas as pd
import numpy as np

WEEKLY_IN = Path("data_raw/master/player_week_fantasy_2015_2025_with_td_bonus.parquet")

OUTDIR = Path("data_raw/master")
OUTDIR.mkdir(parents=True, exist_ok=True)

SEASON_OUT_PARQ = OUTDIR / "player_season_fantasy_2015_2025_with_td_bonus.parquet"
SEASON_OUT_CSV  = OUTDIR / "player_season_fantasy_2015_2025_with_td_bonus.csv"
CAREER_OUT_PARQ = OUTDIR / "player_career_fantasy_2015_2025_with_td_bonus.parquet"
CAREER_OUT_CSV  = OUTDIR / "player_career_fantasy_2015_2025_with_td_bonus.csv"

# Tune these whenever you want
BOOM_X = 25.0   # "boom week" threshold
BUST_Y = 8.0    # "bust week" threshold

def main():
    df = pd.read_parquet(WEEKLY_IN)

    # Pick which weekly fantasy column to aggregate
    if "fantasy_points_custom_week_with_bonus" in df.columns:
        fpw = "fantasy_points_custom_week_with_bonus"
    elif "fantasy_points_custom_week" in df.columns:
        fpw = "fantasy_points_custom_week"
    else:
        raise SystemExit("No weekly fantasy points column found.")

    # Ensure numeric
    df[fpw] = pd.to_numeric(df[fpw], errors="coerce").fillna(0.0)

    # Optional: keep only regular season if you want
    # df = df[df.get("season_type", "REG").eq("REG")].copy()

    # Useful identity columns (keep what exists)
    id_cols = [
        "gsis_id","player_id","sleeper_id","espn_id_x",
        "display_name","player_display_name","player_name",
        "position","position_group","team"
    ]
    id_cols = [c for c in id_cols if c in df.columns]

    group_keys = ["gsis_id","season"]
    if "season_type" in df.columns:
        group_keys.append("season_type")  # keeps REG/POST separate if present

    def agg_season(g: pd.DataFrame) -> pd.Series:
        pts = g[fpw]
        games = int((pts > 0).sum())  # counts "appeared" weeks; change to len(g) if you want all weeks
        total = float(pts.sum())
        mean  = float(pts.mean()) if len(pts) else 0.0
        std   = float(pts.std(ddof=0)) if len(pts) else 0.0  # population stddev
        maxw  = float(pts.max()) if len(pts) else 0.0
        p90   = float(np.quantile(pts, 0.90)) if len(pts) else 0.0

        boom_n = int((pts >= BOOM_X).sum())
        bust_n = int((pts <= BUST_Y).sum())

        # “Consistency-ish” metrics
        # pct_above_avg: how often player beats their own season average
        pct_above_avg = float((pts > mean).mean()) if len(pts) else 0.0

        return pd.Series({
            "games_played": games,
            "weeks_counted": int(len(pts)),
            "fantasy_points_custom": total,
            "fantasy_points_custom_pg": (total / games) if games else 0.0,
            "week_points_mean": mean,
            "week_points_std": std,
            "week_points_max": maxw,
            "week_points_p90": p90,
            "boom_weeks": boom_n,
            "bust_weeks": bust_n,
            "boom_rate": (boom_n / len(pts)) if len(pts) else 0.0,
            "bust_rate": (bust_n / len(pts)) if len(pts) else 0.0,
            "pct_weeks_above_own_avg": pct_above_avg,
            "boom_threshold": float(BOOM_X),
            "bust_threshold": float(BUST_Y),
            "weekly_points_source_col": fpw,
        })

    season = (
        df.groupby(group_keys, as_index=False)
          .apply(lambda g: agg_season(g))
          .reset_index(drop=True)
    )

    # Attach stable identity columns (take first non-null per group)
    if id_cols:
        id_block = (
            df.groupby(group_keys, as_index=False)[id_cols]
              .first()
        )
        season = id_block.merge(season, on=group_keys, how="left")

    # Career: sum season totals (keeps season_type split if present)
    career_keys = ["gsis_id"]
    if "season_type" in season.columns:
        career_keys.append("season_type")

    career = (
        season.groupby(career_keys, as_index=False)
              .agg(
                  seasons=("season","nunique"),
                  games_played=("games_played","sum"),
                  fantasy_points_custom=("fantasy_points_custom","sum"),
                  boom_weeks=("boom_weeks","sum"),
                  bust_weeks=("bust_weeks","sum"),
                  # Weighted-ish aggregations (by weeks_counted)
                  weeks_counted=("weeks_counted","sum"),
              )
    )

    career["fantasy_points_custom_pg"] = career.apply(
        lambda r: (r["fantasy_points_custom"] / r["games_played"]) if r["games_played"] else 0.0,
        axis=1
    )
    career["boom_rate"] = career.apply(
        lambda r: (r["boom_weeks"] / r["weeks_counted"]) if r["weeks_counted"] else 0.0,
        axis=1
    )
    career["bust_rate"] = career.apply(
        lambda r: (r["bust_weeks"] / r["weeks_counted"]) if r["weeks_counted"] else 0.0,
        axis=1
    )
    career["boom_threshold"] = float(BOOM_X)
    career["bust_threshold"] = float(BUST_Y)
    career["weekly_points_source_col"] = fpw

    # Attach identity columns at career level
    if id_cols:
        id_block_career = (
            df.groupby(["gsis_id"], as_index=False)[id_cols]
              .first()
        )
        # if season_type exists, just merge on gsis_id (identity doesn't vary by season_type)
        career = id_block_career.merge(career, on="gsis_id", how="right")

    # Write outputs
    season.to_parquet(SEASON_OUT_PARQ, index=False)
    season.to_csv(SEASON_OUT_CSV, index=False)
    career.to_parquet(CAREER_OUT_PARQ, index=False)
    career.to_csv(CAREER_OUT_CSV, index=False)

    print("=== SEASON + CAREER FANTASY (FROM WEEKLY) BUILT ===")
    print("Weekly source:", WEEKLY_IN)
    print("Using weekly points column:", fpw)
    print("Season rows:", len(season), "cols:", len(season.columns))
    print("Career rows:", len(career), "cols:", len(career.columns))
    print("Wrote:", SEASON_OUT_PARQ)
    print("Wrote:", CAREER_OUT_PARQ)

if __name__ == "__main__":
    main()
