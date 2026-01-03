from __future__ import annotations

from pathlib import Path
import numpy as np
import pandas as pd

INP = Path("data_raw/master/player_stats_2015_2025_with_master.parquet")
OUTDIR = Path("data_raw/master")
OUTDIR.mkdir(parents=True, exist_ok=True)

OUT_WEEK_PARQ = OUTDIR / "player_week_fantasy_2015_2025.parquet"
OUT_WEEK_CSV  = OUTDIR / "player_week_fantasy_2015_2025.csv"

OUT_SEASON_PARQ = OUTDIR / "player_season_fantasy_2015_2025.parquet"
OUT_SEASON_CSV  = OUTDIR / "player_season_fantasy_2015_2025.csv"

OUT_CAREER_PARQ = OUTDIR / "player_career_fantasy_2015_2025.parquet"
OUT_CAREER_CSV  = OUTDIR / "player_career_fantasy_2015_2025.csv"

OUT_BOOM_BUST_PARQ = OUTDIR / "player_season_boom_bust_2015_2025.parquet"
OUT_BOOM_BUST_CSV  = OUTDIR / "player_season_boom_bust_2015_2025.csv"


# =========================
# Custom scoring (Layer A)
# =========================
# Your league scoring:
# Passing: 0.04/yd, +4 TD, +2 2pt, -1 INT
# Rushing: 0.1/yd, +6 TD, +2 2pt
# Receiving: +0.5 rec, 0.1/yd, +6 TD, +2 2pt
# Misc: -2 fumble lost
#
# NOTE:
# - Long TD bonuses (40+/50+) require play-by-play TD length. Not included here.
# - Team defense and kicking are present in your rules; this script focuses on player rows
#   in the weekly player stats table you built (QB/RB/WR/TE etc.). If your weekly table
#   includes kickers/defense columns, we can extend.
#
# Fumbles lost:
# We have rushing_fumbles_lost + receiving_fumbles_lost; also sack_fumbles_lost exists
# in your columns list, but not always present per row. We’ll include all that exist.

def col(df: pd.DataFrame, name: str) -> pd.Series:
    """Return numeric series; if missing, return 0s."""
    if name not in df.columns:
        return pd.Series(0, index=df.index, dtype="float64")
    s = df[name]
    # coerce to numeric safely
    return pd.to_numeric(s, errors="coerce").fillna(0)

def fantasy_points_layer_a_week(df: pd.DataFrame) -> pd.Series:
    pts = (
        # Passing
        col(df, "passing_yards") * 0.04 +
        col(df, "passing_tds") * 4 +
        col(df, "passing_interceptions") * -1 +
        col(df, "passing_2pt_conversions") * 2 +

        # Rushing
        col(df, "rushing_yards") * 0.1 +
        col(df, "rushing_tds") * 6 +
        col(df, "rushing_2pt_conversions") * 2 +

        # Receiving
        col(df, "receptions") * 0.5 +
        col(df, "receiving_yards") * 0.1 +
        col(df, "receiving_tds") * 6 +
        col(df, "receiving_2pt_conversions") * 2
    )

    # Fumbles lost (include any that exist)
    f_lost = (
        col(df, "rushing_fumbles_lost") +
        col(df, "receiving_fumbles_lost") +
        col(df, "sack_fumbles_lost")
    )
    pts += f_lost * -2

    return pts


def main() -> None:
    df = pd.read_parquet(INP)

    # Basic required keys
    required = ["season", "week"]
    for r in required:
        if r not in df.columns:
            raise SystemExit(f"Missing required column: {r}")

    # Prefer these identifiers if present
    id_cols_priority = [
        "gsis_id",
        "player_id",   # nflverse id (weekly stats table)
        "sleeper_id",
        "espn_id_x",
    ]
    id_cols = [c for c in id_cols_priority if c in df.columns]
    if not id_cols:
        raise SystemExit("No usable player id columns found (expected gsis_id / player_id / sleeper_id / espn_id_x).")

    # Add weekly fantasy points
    df["fantasy_points_custom_week"] = fantasy_points_layer_a_week(df).astype("float64")

    # Keep a compact weekly table (plus anything you want to analyze)
    keep = []
    for c in [
        # identifiers
        *id_cols,
        "display_name", "player_display_name", "player_name",
        "position", "position_group",
        "team", "opponent_team",
        "season", "week", "season_type",
        # core stats used in scoring (helpful for debugging)
        "attempts", "completions",
        "passing_yards", "passing_tds", "passing_interceptions", "passing_2pt_conversions",
        "carries", "rushing_yards", "rushing_tds", "rushing_2pt_conversions",
        "receptions", "targets", "receiving_yards", "receiving_tds", "receiving_2pt_conversions",
        "rushing_fumbles_lost", "receiving_fumbles_lost", "sack_fumbles_lost",
        # output
        "fantasy_points_custom_week",
    ]:
        if c in df.columns and c not in keep:
            keep.append(c)

    wk = df[keep].copy()

    # Clean types
    wk["season"] = pd.to_numeric(wk["season"], errors="coerce").astype("Int64")
    wk["week"]   = pd.to_numeric(wk["week"], errors="coerce").astype("Int64")

    # Write weekly table
    wk.to_parquet(OUT_WEEK_PARQ, index=False)
    wk.to_csv(OUT_WEEK_CSV, index=False)

    # =========================
    # Season rollup from weekly
    # =========================
    # Use gsis_id if present, else player_id as rollup key
    roll_key = "gsis_id" if "gsis_id" in wk.columns else ("player_id" if "player_id" in wk.columns else id_cols[0])

    # Determine a name column
    name_col = "display_name" if "display_name" in wk.columns else ("player_display_name" if "player_display_name" in wk.columns else "player_name")

    grp_keys = [roll_key, "season"]

    # games_played: count weeks where player scored any stats row; better is appearance flag, but this is fine for fantasy use
    season = (
        wk.groupby(grp_keys, as_index=False)
          .agg(
              display_name=(name_col, "first"),
              position=("position", "first") if "position" in wk.columns else (name_col, "first"),
              team=("team", "first") if "team" in wk.columns else (name_col, "first"),
              games_played=("week", "nunique"),
              fantasy_points_custom=("fantasy_points_custom_week", "sum"),
              fantasy_points_custom_pg=("fantasy_points_custom_week", "mean"),
          )
    )

    season.to_parquet(OUT_SEASON_PARQ, index=False)
    season.to_csv(OUT_SEASON_CSV, index=False)

    # =========================
    # Career rollup from season
    # =========================
    career = (
        season.groupby([roll_key], as_index=False)
              .agg(
                  display_name=("display_name", "first"),
                  position=("position", "first"),
                  teams=("team", lambda s: ",".join(pd.Series(s).dropna().astype(str).unique()[:10])),
                  seasons_played=("season", "nunique"),
                  games_played=("games_played", "sum"),
                  fantasy_points_custom=("fantasy_points_custom", "sum"),
                  fantasy_points_custom_pg=("fantasy_points_custom", lambda s: float(np.mean(s)) if len(s) else np.nan),
              )
    )

    career.to_parquet(OUT_CAREER_PARQ, index=False)
    career.to_csv(OUT_CAREER_CSV, index=False)

    # =========================
    # Boom/Bust metrics (season)
    # =========================
    # You can tune thresholds later. These defaults are sane:
    # - boom: >= 20 points in a week
    # - bust: < 5 points in a week
    # - volatility: std dev of weekly points
    boom_thresh = 20.0
    bust_thresh = 5.0

    tmp = wk.dropna(subset=["season", "week"]).copy()
    tmp["is_boom"] = (tmp["fantasy_points_custom_week"] >= boom_thresh).astype("int64")
    tmp["is_bust"] = (tmp["fantasy_points_custom_week"] < bust_thresh).astype("int64")

    boom_bust = (
        tmp.groupby([roll_key, "season"], as_index=False)
           .agg(
                display_name=(name_col, "first"),
                position=("position", "first") if "position" in tmp.columns else (name_col, "first"),
                team=("team", "first") if "team" in tmp.columns else (name_col, "first"),
                games=("week", "nunique"),
                fp_total=("fantasy_points_custom_week", "sum"),
                fp_pg=("fantasy_points_custom_week", "mean"),
                fp_std=("fantasy_points_custom_week", "std"),
                fp_p25=("fantasy_points_custom_week", lambda s: float(pd.Series(s).quantile(0.25))),
                fp_p50=("fantasy_points_custom_week", lambda s: float(pd.Series(s).quantile(0.50))),
                fp_p75=("fantasy_points_custom_week", lambda s: float(pd.Series(s).quantile(0.75))),
                boom_weeks=("is_boom", "sum"),
                bust_weeks=("is_bust", "sum"),
           )
    )

    boom_bust["boom_pct"] = (boom_bust["boom_weeks"] / boom_bust["games"]).replace([np.inf, -np.inf], np.nan)
    boom_bust["bust_pct"] = (boom_bust["bust_weeks"] / boom_bust["games"]).replace([np.inf, -np.inf], np.nan)

    boom_bust.to_parquet(OUT_BOOM_BUST_PARQ, index=False)
    boom_bust.to_csv(OUT_BOOM_BUST_CSV, index=False)

    print("=== WEEKLY + SEASON + CAREER FANTASY BUILT ===")
    print(f"Weekly rows: {len(wk)} cols: {len(wk.columns)}")
    print(f"Season rows: {len(season)} cols: {len(season.columns)}")
    print(f"Career rows: {len(career)} cols: {len(career.columns)}")
    print("Wrote:", OUT_WEEK_PARQ)
    print("Wrote:", OUT_WEEK_CSV)
    print("Wrote:", OUT_SEASON_PARQ)
    print("Wrote:", OUT_SEASON_CSV)
    print("Wrote:", OUT_CAREER_PARQ)
    print("Wrote:", OUT_CAREER_CSV)
    print("Wrote:", OUT_BOOM_BUST_PARQ)
    print("Wrote:", OUT_BOOM_BUST_CSV)
    print()
    print("NOTE: Long TD bonuses (40+/50+) not included yet (needs play-by-play).")


if __name__ == "__main__":
    main()
