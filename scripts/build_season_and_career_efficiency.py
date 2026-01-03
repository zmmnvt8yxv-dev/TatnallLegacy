from pathlib import Path
import numpy as np
import pandas as pd

INP = Path("data_raw/master/player_stats_2015_2025_with_master.parquet")

OUT_DIR = Path("data_raw/master")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def nz(x):
    # numeric with NaNs -> 0
    return pd.to_numeric(x, errors="coerce").fillna(0)

def safe_div(num, den):
    num = nz(num)
    den = nz(den)
    return np.where(den != 0, num / den, np.nan)

def add_efficiency(df):
    # --- passing ---
    df["pass_cmp_pct"]      = safe_div(df["completions"], df["attempts"])
    df["pass_yds_pa"]       = safe_div(df["passing_yards"], df["attempts"])
    df["pass_td_rate"]      = safe_div(df["passing_tds"], df["attempts"])
    df["pass_int_rate"]     = safe_div(df["passing_interceptions"], df["attempts"])
    df["pass_sack_rate"]    = safe_div(df["sacks_suffered"], (df["attempts"] + df["sacks_suffered"]))
    df["pass_epa_pa"]       = safe_div(df["passing_epa"], df["attempts"])
    # CPOE is already “rate-like”; keep as-is but don’t aggregate as sum later

    # --- rushing ---
    df["rush_yds_pc"]       = safe_div(df["rushing_yards"], df["carries"])
    df["rush_td_rate"]      = safe_div(df["rushing_tds"], df["carries"])
    df["rush_fum_rate"]     = safe_div(df["rushing_fumbles"], df["carries"])
    df["rush_epa_pc"]       = safe_div(df["rushing_epa"], df["carries"])

    # --- receiving ---
    df["rec_catch_rate"]    = safe_div(df["receptions"], df["targets"])
    df["rec_yds_pr"]        = safe_div(df["receiving_yards"], df["receptions"])
    df["rec_yds_ptgt"]      = safe_div(df["receiving_yards"], df["targets"])
    df["rec_td_rate_ptgt"]  = safe_div(df["receiving_tds"], df["targets"])
    df["rec_fum_rate"]      = safe_div(df["receiving_fumbles"], df["receptions"])
    df["rec_epa_ptgt"]      = safe_div(df["receiving_epa"], df["targets"])

    # --- kicking ---
    df["fg_pct_calc"]       = safe_div(df["fg_made"], df["fg_att"])
    df["pat_pct_calc"]      = safe_div(df["pat_made"], df["pat_att"])

    # --- defense (per game is most useful) ---
    # rates added later using games_played

    return df

def add_per_game(df):
    gp = nz(df["games_played"])
    # avoid divide by zero
    def pg(col):
        return np.where(gp != 0, nz(df[col]) / gp, np.nan)

    # offense per-game
    df["pass_yds_pg"] = pg("passing_yards")
    df["pass_td_pg"]  = pg("passing_tds")
    df["int_pg"]      = pg("passing_interceptions")
    df["rush_yds_pg"] = pg("rushing_yards")
    df["rush_td_pg"]  = pg("rushing_tds")
    df["rec_yds_pg"]  = pg("receiving_yards")
    df["rec_td_pg"]   = pg("receiving_tds")
    df["tgt_pg"]      = pg("targets")
    df["rec_pg"]      = pg("receptions")

    # defense per-game
    for c in [
        "def_sacks","def_interceptions","def_tackles_solo","def_tackles_with_assist",
        "def_qb_hits","def_pass_defended","def_tds","def_fumbles_forced"
    ]:
        if c in df.columns:
            df[c + "_pg"] = pg(c)

    # kicking per-game
    df["fgm_pg"]      = pg("fg_made")
    df["fga_pg"]      = pg("fg_att")
    df["patm_pg"]     = pg("pat_made")
    df["pata_pg"]     = pg("pat_att")

    return df

def season_aggregate(raw: pd.DataFrame) -> pd.DataFrame:
    # Define “id columns” to carry through (first non-null in season)
    id_cols = [
        "player_id","gsis_id","player_name","player_display_name","position","position_group",
        "team","season","season_type",
        "display_name","first_name","last_name","birth_date",
        "espn_id_str","espn_id_x","espn_id_y","espn_guid",
        "sleeper_id","sleeper_player_id","sleeper_gsis_id"
    ]
    id_cols = [c for c in id_cols if c in raw.columns]

    # Numeric columns: everything else we’ll sum (except “rate-like” fields handled later)
    non_sum = set(id_cols + ["week"])
    numeric = []
    for c in raw.columns:
        if c in non_sum:
            continue
        if c in ["passing_cpoe","pacr","racr","target_share","air_yards_share","wopr","fg_pct","pat_pct"]:
            # these are “rate-like” but raw is weekly; we’ll rebuild derived season rates later
            continue
        # try numeric
        if pd.api.types.is_numeric_dtype(raw[c]) or c in [
            "completions","attempts","passing_yards","passing_tds","passing_interceptions",
            "carries","rushing_yards","rushing_tds","targets","receptions","receiving_yards","receiving_tds",
            "fg_made","fg_att","pat_made","pat_att"
        ]:
            numeric.append(c)

    group_keys = ["gsis_id","season"]
    if "season_type" in raw.columns:
        group_keys.append("season_type")

    agg = {c: "sum" for c in numeric}

    # also count games_played = number of weeks where player had any appearance
    # (this assumes your weekly table has one row per player/week already aggregated)
    raw["_appeared"] = 1

    # Build a single agg dict (pandas doesn't allow mixing **kwargs style with dict style)
    agg_dict = {c: "sum" for c in numeric}
    agg_dict["_appeared"] = "sum"

    season = (
        raw.groupby(group_keys, as_index=False)
           .agg(agg_dict)
           .rename(columns={"_appeared": "games_played"})
    )

    # attach a representative identity row (first non-null) per group
    rep = (
        raw.sort_values(["season","week"])
           .groupby(group_keys, as_index=False)[id_cols]
           .first()
    )
    season = season.merge(rep, on=group_keys, how="left")

    # derived efficiencies
    season = add_efficiency(season)
    season = add_per_game(season)

    return season

def career_aggregate(season_df: pd.DataFrame) -> pd.DataFrame:
    # career across seasons (keep season_type separate if present)
    keys = ["gsis_id"]
    if "season_type" in season_df.columns:
        keys.append("season_type")

    # choose numeric columns to sum for career
    sum_cols = []
    for c in season_df.columns:
        if c in keys or c == "season":
            continue
        if c in ["pass_cmp_pct","pass_yds_pa","pass_td_rate","pass_int_rate","pass_sack_rate","pass_epa_pa",
                 "rush_yds_pc","rush_td_rate","rush_fum_rate","rush_epa_pc",
                 "rec_catch_rate","rec_yds_pr","rec_yds_ptgt","rec_td_rate_ptgt","rec_fum_rate","rec_epa_ptgt",
                 "fg_pct_calc","pat_pct_calc"]:
            continue
        if c.endswith("_pg"):
            continue
        if season_df[c].dtype.kind in "biufc":
            sum_cols.append(c)

    career = (
        season_df.groupby(keys, as_index=False)
                 .agg({c:"sum" for c in sum_cols})
    )

    # carry identity fields from season_df (first non-null)
    id_cols = [c for c in ["player_display_name","player_name","display_name","position","position_group","birth_date",
                           "espn_id_str","espn_guid","sleeper_id","latest_team","team"] if c in season_df.columns]
    rep = season_df.groupby(keys, as_index=False)[id_cols].first()
    career = career.merge(rep, on=keys, how="left")

    # recompute efficiency on career totals
    career = add_efficiency(career)
    # games_played already summed; use it for per-game
    if "games_played" in career.columns:
        career = add_per_game(career)

    return career

def main():
    raw = pd.read_parquet(INP)
    # ensure core numeric fields exist as numeric
    for c in ["completions","attempts","passing_yards","passing_tds","passing_interceptions",
              "carries","rushing_yards","rushing_tds",
              "targets","receptions","receiving_yards","receiving_tds",
              "fg_made","fg_att","pat_made","pat_att"]:
        if c in raw.columns:
            raw[c] = nz(raw[c])

    season = season_aggregate(raw)
    career = career_aggregate(season)

    out_season_p = OUT_DIR / "player_season_efficiency_2015_2025.parquet"
    out_season_c = OUT_DIR / "player_season_efficiency_2015_2025.csv"
    out_career_p = OUT_DIR / "player_career_efficiency_2015_2025.parquet"
    out_career_c = OUT_DIR / "player_career_efficiency_2015_2025.csv"

    season.to_parquet(out_season_p, index=False)
    season.to_csv(out_season_c, index=False)

    career.to_parquet(out_career_p, index=False)
    career.to_csv(out_career_c, index=False)

    print("=== SEASON + CAREER EFFICIENCY BUILT ===")
    print("Season rows:", len(season), "cols:", len(season.columns))
    print("Career rows:", len(career), "cols:", len(career.columns))
    print("Wrote:", out_season_p)
    print("Wrote:", out_season_c)
    print("Wrote:", out_career_p)
    print("Wrote:", out_career_c)

if __name__ == "__main__":
    main()
