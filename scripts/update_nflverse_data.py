import argparse
from pathlib import Path

import pandas as pd
import nflreadpy as nfl

def to_pandas(df):
    # nflreadpy typically returns polars; convert to pandas
    return df.to_pandas() if hasattr(df, "to_pandas") else df

def write_outputs(df: pd.DataFrame, out_base: Path):
    out_base.parent.mkdir(parents=True, exist_ok=True)

    # Parquet (small + fast)
    df.to_parquet(out_base.with_suffix(".parquet"), index=False)

    # JSON for GitHub Pages fetch()
    df.to_json(out_base.with_suffix(".json"), orient="records")

    # Tiny metadata file (useful for “last updated” on site)
    meta = {
        "rows": int(len(df)),
        "columns": list(df.columns),
        "generated_utc": pd.Timestamp.utcnow().isoformat(),
    }
    (out_base.parent / f"{out_base.name}.meta.json").write_text(pd.Series(meta).to_json())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--outdir", default="data")
    args = ap.parse_args()

    outdir = Path(args.outdir)

    # schedules (season)
    schedules = to_pandas(nfl.load_schedules([args.season]))
    write_outputs(schedules, outdir / f"schedules_{args.season}")

    # rosters (season)
    rosters = to_pandas(nfl.load_rosters(args.season))
    write_outputs(rosters, outdir / f"rosters_{args.season}")

    # teams (small, stable)
    teams = to_pandas(nfl.load_teams())
    write_outputs(teams, outdir / "teams")

if __name__ == "__main__":
    main()
