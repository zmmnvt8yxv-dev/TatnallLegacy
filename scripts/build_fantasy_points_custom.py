from __future__ import annotations

from pathlib import Path
import pandas as pd
import numpy as np

IN_SEASON = Path("data_raw/master/player_season_efficiency_2015_2025.parquet")
OUT_DIR  = Path("data_raw/master")
OUT_DIR.mkdir(parents=True, exist_ok=True)

OUT_SEASON_PARQ  = OUT_DIR / "player_season_fantasy_2015_2025.parquet"
OUT_SEASON_CSV   = OUT_DIR / "player_season_fantasy_2015_2025.csv"
OUT_CAREER_PARQ  = OUT_DIR / "player_career_fantasy_2015_2025.parquet"
OUT_CAREER_CSV   = OUT_DIR / "player_career_fantasy_2015_2025.csv"


# ---------------------------
# Helpers
# ---------------------------

def _col(df: pd.DataFrame, name: str) -> pd.Series:
    """Return numeric series for column; missing -> zeros."""
    if name not in df.columns:
        return pd.Series(0, index=df.index, dtype="float64")
    s = df[name]
    # convert booleans/objects safely
    return pd.to_numeric(s, errors="coerce").fillna(0.0)

def _first_nonnull(series: pd.Series):
    s = series.dropna()
    return s.iloc[0] if len(s) else np.nan

def _last_nonnull(series: pd.Series):
    s = series.dropna()
    return s.iloc[-1] if len(s) else np.nan

def _compute_kicker_points(df: pd.DataFrame) -> pd.Series:
    """
    Kicking rules (your settings):
      - FG made: 0-19 +3, 20-29 +3, 30-39 +3, 40-49 +4, 50+ +5
      - PAT made +1
      - FG missed: range-specific penalties; plus a generic -1 for misses not covered by buckets
        (Because you listed both "FG Missed -1" and range-specific misses; this avoids double-counting.)
      - PAT missed -2
    """
    # Prefer bucket columns if present (best fidelity)
    fg_made_0_19 = _col(df, "fg_made_0_19")
    fg_made_20_29 = _col(df, "fg_made_20_29")
    fg_made_30_39 = _col(df, "fg_made_30_39")
    fg_made_40_49 = _col(df, "fg_made_40_49")

    # Some datasets call these "fg_made_50_59" and "fg_made_60_" etc.
    fg_made_50_59 = _col(df, "fg_made_50_59")
    fg_made_60 = _col(df, "fg_made_60_")  # yes your column list shows fg_made_60_

    made_points = (
        3.0 * (fg_made_0_19 + fg_made_20_29 + fg_made_30_39)
        + 4.0 * fg_made_40_49
        + 5.0 * (fg_made_50_59 + fg_made_60)
    )

    # Fallback if bucket columns aren't present but fg_made is:
    # Treat all makes as +3 (conservative) — but in your data, buckets exist, so this is rarely used.
    if ("fg_made_0_19" not in df.columns) and ("fg_made" in df.columns):
        made_points = 3.0 * _col(df, "fg_made")

    pat_points = 1.0 * _col(df, "pat_made")

    # Miss buckets (your penalties)
    fg_missed = _col(df, "fg_missed")
    m0_19 = _col(df, "fg_missed_0_19")
    m20_29 = _col(df, "fg_missed_20_29")
    m30_39 = _col(df, "fg_missed_30_39")
    m40_49 = _col(df, "fg_missed_40_49")
    m50_59 = _col(df, "fg_missed_50_59")
    m60 = _col(df, "fg_missed_60_")

    # Range-specific penalties
    miss_points = (
        -2.0 * (m0_19 + m20_29 + m30_39)
        -1.0 * m40_49
        -2.0 * (m50_59 + m60)
    )

    # Generic "FG Missed -1" for any remainder misses not represented by buckets
    bucket_misses = (m0_19 + m20_29 + m30_39 + m40_49 + m50_59 + m60)
    remainder = (fg_missed - bucket_misses).clip(lower=0.0)
    miss_points = miss_points + (-1.0 * remainder)

    pat_missed_points = -2.0 * _col(df, "pat_missed")

    return made_points + pat_points + miss_points + pat_missed_points


def score_row_layer_a(df: pd.DataFrame) -> pd.Series:
    """
    Vectorized fantasy scoring for season rows (Layer A only).
    Uses the season efficiency table columns you listed (attempts, passing_yards, etc).
    """

    # Passing
    pass_yards = _col(df, "passing_yards")
    pass_tds   = _col(df, "passing_tds")
    pass_ints  = _col(df, "passing_interceptions")
    pass_2pt   = _col(df, "passing_2pt_conversions")

    pass_points = (
        0.04 * pass_yards
        + 4.0 * pass_tds
        + 2.0 * pass_2pt
        - 1.0 * pass_ints
    )

    # Passing yardage bonuses (season totals)
    pass_bonus = (
        np.where((pass_yards >= 300) & (pass_yards <= 399), 2.0, 0.0)
        + np.where(pass_yards >= 400, 4.0, 0.0)
    )

    # Rushing
    rush_yards = _col(df, "rushing_yards")
    rush_tds   = _col(df, "rushing_tds")
    rush_2pt   = _col(df, "rushing_2pt_conversions")

    rush_points = (
        0.10 * rush_yards
        + 6.0 * rush_tds
        + 2.0 * rush_2pt
    )

    rush_bonus = (
        np.where((rush_yards >= 100) & (rush_yards <= 199), 2.0, 0.0)
        + np.where(rush_yards >= 200, 4.0, 0.0)
    )

    # Receiving
    rec = _col(df, "receptions")
    rec_yards = _col(df, "receiving_yards")
    rec_tds   = _col(df, "receiving_tds")
    rec_2pt   = _col(df, "receiving_2pt_conversions")

    rec_points = (
        0.50 * rec
        + 0.10 * rec_yards
        + 6.0 * rec_tds
        + 2.0 * rec_2pt
    )

    rec_bonus = (
        np.where((rec_yards >= 100) & (rec_yards <= 199), 2.0, 0.0)
        + np.where(rec_yards >= 200, 4.0, 0.0)
    )

    # Misc: fumble lost -2
    # Use the *_fumbles_lost columns you have; include sack fumbles lost too.
    fum_lost = (
        _col(df, "rushing_fumbles_lost")
        + _col(df, "receiving_fumbles_lost")
        + _col(df, "sack_fumbles_lost")
    )
    fum_points = -2.0 * fum_lost

    # Special teams TDs +6
    st_tds = _col(df, "special_teams_tds")
    st_points = 6.0 * st_tds

    # Kicking
    k_points = _compute_kicker_points(df)

    # Layer B long-TD bonuses are NOT computable from season totals without PBP
    long_td_bonus = pd.Series(0.0, index=df.index, dtype="float64")

    total = (
        pass_points + pass_bonus
        + rush_points + rush_bonus
        + rec_points + rec_bonus
        + fum_points
        + st_points
        + k_points
        + long_td_bonus
    )

    return total.astype("float64")


def main():
    if not IN_SEASON.exists():
        raise SystemExit(f"Missing input file: {IN_SEASON}")

    df = pd.read_parquet(IN_SEASON)

    # Ensure essentials exist
    if "gsis_id" not in df.columns or "season" not in df.columns:
        raise SystemExit("Input missing gsis_id/season (unexpected).")

    games = _col(df, "games_played")
    games_safe = games.replace(0, np.nan)

    # Fantasy points (Layer A)
    df["fantasy_points_custom"] = score_row_layer_a(df)

    # Per-game
    df["fantasy_points_custom_pg"] = (df["fantasy_points_custom"] / games_safe).fillna(0.0)

    # Placeholders for Layer B (play-level TD length bonuses)
    # These are here so we can add them later without changing downstream schemas.
    df["bonus_pass_td_40plus"] = 0.0
    df["bonus_pass_td_50plus"] = 0.0
    df["bonus_rush_td_40plus"] = 0.0
    df["bonus_rush_td_50plus"] = 0.0
    df["bonus_rec_td_40plus"] = 0.0
    df["bonus_rec_td_50plus"] = 0.0

    # Write season
    df.to_parquet(OUT_SEASON_PARQ, index=False)
    df.to_csv(OUT_SEASON_CSV, index=False)

    # Build career aggregates (sum across seasons/teams)
    group_key = "gsis_id"

    # Choose some descriptor columns if present
    name_col = "display_name" if "display_name" in df.columns else ("player_name" if "player_name" in df.columns else None)
    team_col = "team" if "team" in df.columns else None
    pos_col  = "position" if "position" in df.columns else None

    agg = {
        "fantasy_points_custom": ("fantasy_points_custom", "sum"),
        "games_played": ("games_played", "sum"),
        "seasons_count": ("season", "nunique"),
    }
    if "attempts" in df.columns:
        agg["attempts"] = ("attempts", "sum")
    if "passing_yards" in df.columns:
        agg["passing_yards"] = ("passing_yards", "sum")
    if "rushing_yards" in df.columns:
        agg["rushing_yards"] = ("rushing_yards", "sum")
    if "receiving_yards" in df.columns:
        agg["receiving_yards"] = ("receiving_yards", "sum")
    if "receptions" in df.columns:
        agg["receptions"] = ("receptions", "sum")

    career = (
        df.groupby(group_key, as_index=False)
          .agg(**agg)
    )

    # attach descriptors
    if name_col:
        names = df.groupby(group_key)[name_col].apply(_last_nonnull).reset_index(name=name_col)
        career = career.merge(names, on=group_key, how="left")
    if pos_col:
        poss = df.groupby(group_key)[pos_col].apply(_last_nonnull).reset_index(name=pos_col)
        career = career.merge(poss, on=group_key, how="left")
    if team_col:
        teams = df.sort_values(["season"]).groupby(group_key)[team_col].apply(_last_nonnull).reset_index(name=team_col)
        career = career.merge(teams, on=group_key, how="left")

    # per-game
    gp = pd.to_numeric(career["games_played"], errors="coerce").replace(0, np.nan)
    career["fantasy_points_custom_pg"] = (career["fantasy_points_custom"] / gp).fillna(0.0)

    # Write career
    career.to_parquet(OUT_CAREER_PARQ, index=False)
    career.to_csv(OUT_CAREER_CSV, index=False)

    print("=== FANTASY POINTS (CUSTOM) BUILT ===")
    print("Input:", IN_SEASON)
    print("Season rows:", len(df), "cols:", len(df.columns))
    print("Career rows:", len(career), "cols:", len(career.columns))
    print("Wrote:", OUT_SEASON_PARQ)
    print("Wrote:", OUT_SEASON_CSV)
    print("Wrote:", OUT_CAREER_PARQ)
    print("Wrote:", OUT_CAREER_CSV)


if __name__ == "__main__":
    main()
