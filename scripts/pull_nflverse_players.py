import nflreadpy as nfl
import pandas as pd
from pathlib import Path

OUT_DIR = Path("data_raw")
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_PATH = OUT_DIR / "nflverse_players.parquet"

def main():
    print("Fetching nflverse players...")
    # load_players() returns a Polars DataFrame in recent versions or Pandas in older? 
    # nflreadpy usually returns polars if available or pandas.
    # The other script converted to pandas so let's check.
    
    df = nfl.load_players()
    
    # Check if it's polars or pandas
    if not isinstance(df, pd.DataFrame):
        try:
           df = df.to_pandas()
        except:
           pass

    print(f"Loaded {len(df)} players.")
    
    df.to_parquet(OUT_PATH, index=False)
    print(f"Wrote {OUT_PATH}")

if __name__ == "__main__":
    main()
