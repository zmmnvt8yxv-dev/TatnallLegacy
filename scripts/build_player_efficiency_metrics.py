from pathlib import Path
import pandas as pd
import numpy as np

INP_SEASON = Path("data_raw/master/player_season_stats_2015_2025.parquet")
INP_CAREER = Path("data_raw/master/player_career_aggregates_2015_2025.parquet")
OUTDIR = Path("data_raw/master")
OUTDIR.mkdir(parents=True, exist_ok=True)

def safe_div(n, d):
    n = pd.to_numeric(n, errors="coerce")
    d = pd.to_numeric(d, errors="coerce")
    out = n / d.replace({0: np.nan})
    return out

def add_eff_cols(df, prefix=""):
    # helpers to find columns if names differ
    cols = set(df.columns)

    def pick(*cands):
        for c in cands:
            if c in cols:
                return c
        return None

    # ---- canonical columns in your data (based on your earlier output) ----
    g   = pick("games_played", "games", "g")

    pass_att = pick("passing_attempts", "pass_attempts", "pass_att")
    pass_cmp = pick("passing_completions", "pass_completions", "pass_cmp")
    pass_yds = pick("passing_yards", "pass_yards", "pass_yds")
    pass_td  = pick("passing_tds", "pass_tds", "pass_td")
    pass_int = pick("passing_interceptions", "pass_int", "passing_int")

    rush_att = pick("rushing_attempts", "rush_attempts", "rush_att", "carries")
    rush_yds = pick("rushing_yards", "rush_yards", "rush_yds")
    rush_td  = pick("rushing_tds", "rush_tds", "rush_td")

    rec_tgt  = pick("receiving_targets", "targets", "rec_tgt")
    rec_rec  = pick("receptions", "receiving_receptions", "rec")
    rec_yds  = pick("receiving_yards", "rec_yards", "rec_yds")
    rec_td   = pick("receiving_tds", "rec_tds", "rec_td")

    # ---- per-game ----
    if g:
        if pass_yds: df[f"{prefix}pass_yds_pg"] = safe_div(df[pass_yds], df[g])
        if pass_td:  df[f"{prefix}pass_td_pg"]  = safe_div(df[pass_td],  df[g])
        if pass_int: df[f"{prefix}pass_int_pg"] = safe_div(df[pass_int], df[g])

        if rush_yds: df[f"{prefix}rush_yds_pg"] = safe_div(df[rush_yds], df[g])
        if rush_td:  df[f"{prefix}rush_td_pg"]  = safe_div(df[rush_td],  df[g])

        if rec_yds:  df[f"{prefix}rec_yds_pg"]  = safe_div(df[rec_yds],  df[g])
        if rec_td:   df[f"{prefix}rec_td_pg"]   = safe_div(df[rec_td],   df[g])
        if rec_rec:  df[f"{prefix}rec_pg"]      = safe_div(df[rec_rec],  df[g])
        if rec_tgt:  df[f"{prefix}tgt_pg"]      = safe_div(df[rec_tgt],  df[g])

    # ---- per-attempt / rate ----
    if pass_att:
        if pass_yds: df[f"{prefix}pass_yds_pa"] = safe_div(df[pass_yds], df[pass_att])  # yards per attempt
        if pass_td:  df[f"{prefix}pass_td_rate"] = safe_div(df[pass_td], df[pass_att])  # TD per attempt
        if pass_int: df[f"{prefix}pass_int_rate"] = safe_div(df[pass_int], df[pass_att])
        if pass_cmp: df[f"{prefix}pass_cmp_pct"] = safe_div(df[pass_cmp], df[pass_att])

    if rush_att and rush_yds:
        df[f"{prefix}rush_yds_pc"] = safe_div(df[rush_yds], df[rush_att])  # yards per carry

    if rec_tgt:
        if rec_rec: df[f"{prefix}catch_rate"] = safe_div(df[rec_rec], df[rec_tgt])
        if rec_yds: df[f"{prefix}yds_per_tgt"] = safe_div(df[rec_yds], df[rec_tgt])
        if rec_td:  df[f"{prefix}td_per_tgt"]  = safe_div(df[rec_td],  df[rec_tgt])

    if rec_rec and rec_yds:
        df[f"{prefix}yds_per_rec"] = safe_div(df[rec_yds], df[rec_rec])

    return df

# ---- season efficiency ----
season = pd.read_parquet(INP_SEASON)
season_eff = add_eff_cols(season.copy(), prefix="")

out_season_parq = OUTDIR / "player_season_efficiency_2015_2025.parquet"
out_season_csv  = OUTDIR / "player_season_efficiency_2015_2025.csv"
season_eff.to_parquet(out_season_parq, index=False)
season_eff.to_csv(out_season_csv, index=False)

# ---- career efficiency ----
career = pd.read_parquet(INP_CAREER)
career_eff = add_eff_cols(career.copy(), prefix="career_")

out_career_parq = OUTDIR / "player_career_efficiency_2015_2025.parquet"
out_career_csv  = OUTDIR / "player_career_efficiency_2015_2025.csv"
career_eff.to_parquet(out_career_parq, index=False)
career_eff.to_csv(out_career_csv, index=False)

print("=== EFFICIENCY BUILT ===")
print("Season rows:", len(season_eff), "cols:", len(season_eff.columns))
print("Career rows:", len(career_eff), "cols:", len(career_eff.columns))
print("Wrote:", out_season_parq)
print("Wrote:", out_season_csv)
print("Wrote:", out_career_parq)
print("Wrote:", out_career_csv)
