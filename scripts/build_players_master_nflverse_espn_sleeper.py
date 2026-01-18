from pathlib import Path
import json
import pandas as pd

NFL = Path("data_raw/nflverse_players.parquet")
ESPN_INDEX = Path("data_raw/espn_core/index/athletes_index_flat.parquet")
ESPN_SLP = Path("data_raw/verify/espn_active_x_sleeper_xwalk.csv")
SLEEPER = Path("data_raw/sleeper/players_flat.parquet")  # change if yours is CSV

OUT_DIR = Path("data_raw/master")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def prefix_cols(df, prefix, keep=()):
    out = df.copy()
    for c in list(out.columns):
        if c in keep:
            continue
        out.rename(columns={c: f"{prefix}{c}"}, inplace=True)
    return out

def json_stringify_cell(x):
    """Make any non-scalar (list/dict) safe for Parquet by JSON-stringifying."""
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return pd.NA
    if isinstance(x, (list, dict)):
        try:
            return json.dumps(x, ensure_ascii=False)
        except Exception:
            return str(x)
    return x

def sanitize_for_parquet(df, prefix="sleeper_"):
    """
    - For all prefix columns:
      * JSON-stringify list/dict cells
      * Convert empty-string scalars to NA
    - Also coerce known numeric columns to numeric
    """
    cols = [c for c in df.columns if c.startswith(prefix)]
    for c in cols:
        # If the column has objects, it may contain lists/dicts/strings mixed
        if df[c].dtype == "object" or str(df[c].dtype).startswith("string"):
            s = df[c].map(json_stringify_cell)

            # Only treat *scalar* empty strings as NA
            # (after stringify, lists/dicts are strings but not empty)
            s = s.map(lambda v: pd.NA if isinstance(v, str) and v.strip() == "" else v)
            df[c] = s

    # Coerce common numeric-ish sleeper columns (extend this list as needed)
    numeric_candidates = [
        "sleeper_news_updated",
        "sleeper_age",
        "sleeper_height",
        "sleeper_weight",
        "sleeper_years_exp",
    ]
    for c in numeric_candidates:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    return df

def main():
    nfl = pd.read_parquet(NFL)
    espn = pd.read_parquet(ESPN_INDEX)
    xw = pd.read_csv(ESPN_SLP, dtype=str).fillna("")

    if SLEEPER.suffix.lower() == ".parquet":
        slp = pd.read_parquet(SLEEPER)
    else:
        slp = pd.read_csv(SLEEPER, dtype=str)
    slp = slp.fillna("")

    # normalize join keys
    nfl["espn_id_str"] = nfl["espn_id"].astype("string")
    espn["espn_id_str"] = espn["id"].astype("string")

    # 1) nflverse ↔ espn index by espn_id
    espn_pref = prefix_cols(espn, "espn_", keep=("espn_id_str",))
    j = nfl.merge(espn_pref, on="espn_id_str", how="left")

    # 2) attach sleeper_id via crosswalk (espn_id -> sleeper_id)
    xw2 = xw[["espn_id","sleeper_id"]].copy()
    xw2["espn_id_str"] = xw2["espn_id"].astype("string")
    j = j.merge(xw2[["espn_id_str","sleeper_id"]], on="espn_id_str", how="left")

    # 3) sleeper details (prefixed)
    slp["sleeper_id"] = slp.get("sleeper_id", "").astype("string")
    slp_pref = prefix_cols(slp, "sleeper_", keep=("sleeper_id",))
    j = j.merge(slp_pref, on="sleeper_id", how="left")

    # ---- CLEAN: make parquet-safe ----
    j = sanitize_for_parquet(j, prefix="sleeper_")

    out_parq = OUT_DIR / "players_master_nflverse_espn_sleeper.parquet"
    out_csv  = OUT_DIR / "players_master_nflverse_espn_sleeper.csv"

    j.to_parquet(out_parq, index=False)
    j.to_csv(out_csv, index=False)

    total = len(j)
    with_espn = j["espn_id_str"].notna().sum()
    with_sleeper = j["sleeper_id"].astype("string").fillna("").ne("").sum()

    print("=== PLAYERS MASTER BUILT ===")
    print("Rows:", total)
    print("NFL rows w/ espn_id:", int(with_espn))
    print("Rows w/ sleeper_id (via ESPN active crosswalk):", int(with_sleeper))
    print("Wrote:", out_parq)
    print("Wrote:", out_csv)

if __name__ == "__main__":
    main()
