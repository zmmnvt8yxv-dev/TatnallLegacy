from __future__ import annotations

from pathlib import Path
import pandas as pd
import numpy as np

OUTDIR = Path("data_raw/master")
OUTDIR.mkdir(parents=True, exist_ok=True)

OUT_PARQ = OUTDIR / "player_week_td_bonus.parquet"
OUT_CSV  = OUTDIR / "player_week_td_bonus.csv"

# Set years you want
YEARS = list(range(2015, 2026))  # 2015-2025 inclusive

def load_pbp(years: list[int]) -> pd.DataFrame:
    """
    Uses nfl_data_py to load play-by-play (nflverse).
    """
    import nfl_data_py as nfl
    # nfl_data_py.import_pbp_data returns a DataFrame
    pbp = nfl.import_pbp_data(years, downcast=True, cache=False)
    return pbp

def main():
    pbp = load_pbp(YEARS)

    # Keep regular season if present (your data has season_type)
    if "season_type" in pbp.columns:
        pbp = pbp[pbp["season_type"].astype(str).str.lower().isin(["reg", "regular"])].copy()

    # We need season/week
    for c in ["season", "week"]:
        if c not in pbp.columns:
            raise SystemExit(f"Missing required pbp column: {c}")

    # TD indicators differ by dataset version; handle both common patterns
    # nflverse pbp typically has: pass_touchdown, rush_touchdown, touchdown (overall)
    pass_td = pbp["pass_touchdown"] if "pass_touchdown" in pbp.columns else 0
    rush_td = pbp["rush_touchdown"] if "rush_touchdown" in pbp.columns else 0

    # We'll compute TD length using yards_gained when available
    if "yards_gained" not in pbp.columns:
        raise SystemExit("Missing pbp column 'yards_gained' (needed for TD length bonuses).")

    pbp["td_len"] = pd.to_numeric(pbp["yards_gained"], errors="coerce").fillna(0)

    # Only keep pass/rush TD plays
    pbp_td = pbp[(pd.to_numeric(pass_td, errors="coerce").fillna(0) == 1) |
                 (pd.to_numeric(rush_td, errors="coerce").fillna(0) == 1)].copy()

    # Player IDs in nflverse pbp are usually GSIS-style strings
    passer_col = "passer_player_id" if "passer_player_id" in pbp_td.columns else None
    receiver_col = "receiver_player_id" if "receiver_player_id" in pbp_td.columns else None
    rusher_col = "rusher_player_id" if "rusher_player_id" in pbp_td.columns else None

    # Build per-play bonuses
    def bonus_40(x): return (x >= 40).astype("int64")
    def bonus_50(x): return (x >= 50).astype("int64")

    pbp_td["b40"] = bonus_40(pbp_td["td_len"])
    pbp_td["b50"] = bonus_50(pbp_td["td_len"])

    out_rows = []

    # PASS TD: passer gets pass bonuses; receiver gets rec bonuses
    if passer_col:
        p = pbp_td[pd.to_numeric(pbp_td.get("pass_touchdown", 0), errors="coerce").fillna(0) == 1].copy()
        if len(p):
            tmp = p[["season","week",passer_col,"b40","b50"]].rename(columns={passer_col:"gsis_id"})
            tmp["pass_td_40_bonus"] = tmp["b40"]
            tmp["pass_td_50_bonus"] = tmp["b50"]
            tmp = tmp.drop(columns=["b40","b50"])
            out_rows.append(tmp)

    if receiver_col:
        r = pbp_td[pd.to_numeric(pbp_td.get("pass_touchdown", 0), errors="coerce").fillna(0) == 1].copy()
        if len(r):
            tmp = r[["season","week",receiver_col,"b40","b50"]].rename(columns={receiver_col:"gsis_id"})
            tmp["rec_td_40_bonus"] = tmp["b40"]
            tmp["rec_td_50_bonus"] = tmp["b50"]
            tmp = tmp.drop(columns=["b40","b50"])
            out_rows.append(tmp)

    # RUSH TD: rusher gets rush bonuses
    if rusher_col:
        ru = pbp_td[pd.to_numeric(pbp_td.get("rush_touchdown", 0), errors="coerce").fillna(0) == 1].copy()
        if len(ru):
            tmp = ru[["season","week",rusher_col,"b40","b50"]].rename(columns={rusher_col:"gsis_id"})
            tmp["rush_td_40_bonus"] = tmp["b40"]
            tmp["rush_td_50_bonus"] = tmp["b50"]
            tmp = tmp.drop(columns=["b40","b50"])
            out_rows.append(tmp)

    if not out_rows:
        raise SystemExit("No TD bonus rows produced (check pbp columns / seasons).")

    long = pd.concat(out_rows, ignore_index=True)

    # Aggregate to weekly per-player bonuses
    # (fill missing bonus columns)
    for c in ["pass_td_40_bonus","pass_td_50_bonus","rec_td_40_bonus","rec_td_50_bonus","rush_td_40_bonus","rush_td_50_bonus"]:
        if c not in long.columns:
            long[c] = 0

    agg = (long.groupby(["season","week","gsis_id"], as_index=False)
              .agg(
                  pass_td_40_bonus=("pass_td_40_bonus","sum"),
                  pass_td_50_bonus=("pass_td_50_bonus","sum"),
                  rec_td_40_bonus=("rec_td_40_bonus","sum"),
                  rec_td_50_bonus=("rec_td_50_bonus","sum"),
                  rush_td_40_bonus=("rush_td_40_bonus","sum"),
                  rush_td_50_bonus=("rush_td_50_bonus","sum"),
              ))

    agg["td_bonus_total"] = (
        agg["pass_td_40_bonus"] + agg["pass_td_50_bonus"] +
        agg["rec_td_40_bonus"]  + agg["rec_td_50_bonus"]  +
        agg["rush_td_40_bonus"] + agg["rush_td_50_bonus"]
    ).astype("int64")

    agg.to_parquet(OUT_PARQ, index=False)
    agg.to_csv(OUT_CSV, index=False)

    print("=== TD BONUS BUILT ===")
    print(f"Rows: {len(agg)} cols: {len(agg.columns)}")
    print("Wrote:", OUT_PARQ)
    print("Wrote:", OUT_CSV)
    print()
    print("Columns:", ", ".join(agg.columns))

if __name__ == "__main__":
    main()
