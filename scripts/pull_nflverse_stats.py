import argparse
from pathlib import Path

import pandas as pd
import nflreadpy as nfl  # polars outputs

OUT = Path("data_raw/nflverse_stats")
OUT.mkdir(parents=True, exist_ok=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="+", type=int, default=[2025])
    ap.add_argument("--with-pbp", action="store_true")
    args = ap.parse_args()

    seasons = args.seasons

    # Player *game-level* stats (great first “stats table”)
    # nflreadpy example: load_player_stats([2022, 2023])   [oai_citation:1‡NFL ReadPy](https://nflreadpy.nflverse.com/)
    ps = nfl.load_player_stats(seasons)
    ps_pd = ps.to_pandas()

    ps_parq = OUT / f"player_stats_{min(seasons)}_{max(seasons)}.parquet"
    ps_csv  = OUT / f"player_stats_{min(seasons)}_{max(seasons)}.csv"
    ps_pd.to_parquet(ps_parq, index=False)
    ps_pd.to_csv(ps_csv, index=False)

    print("Wrote:", ps_parq)
    print("Wrote:", ps_csv)
    print("player_stats rows:", len(ps_pd), "cols:", len(ps_pd.columns))

    if args.with_pbp:
        # Play-by-play is huge; only do when you’re ready.
        pbp = nfl.load_pbp(seasons)
        pbp_pd = pbp.to_pandas()

        pbp_parq = OUT / f"pbp_{min(seasons)}_{max(seasons)}.parquet"
        pbp_pd.to_parquet(pbp_parq, index=False)
        print("Wrote:", pbp_parq)
        print("pbp rows:", len(pbp_pd), "cols:", len(pbp_pd.columns))

if __name__ == "__main__":
    main()
