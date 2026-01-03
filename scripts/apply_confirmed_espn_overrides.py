from pathlib import Path
import pandas as pd

XLSX = Path("data_raw/verify/suspicious_match_review.xlsx")
SHEET = "review"
OUT_DIR = Path("data_raw/master")
OUT_DIR.mkdir(parents=True, exist_ok=True)

NFL_PATH = Path("data_raw/nflverse_players.parquet")
ESPN_INDEX_PATH = Path("data_raw/espn_core/index/athletes_index_flat.parquet")

COL_CONF = "confirmed_espn_id"

def main():
    if not XLSX.exists(): raise SystemExit(f"Missing {XLSX}")
    if not NFL_PATH.exists(): raise SystemExit(f"Missing {NFL_PATH}")
    if not ESPN_INDEX_PATH.exists(): raise SystemExit(f"Missing {ESPN_INDEX_PATH}")

    nfl = pd.read_parquet(NFL_PATH)
    espn = pd.read_parquet(ESPN_INDEX_PATH)

    # normalize ids as strings
    nfl["espn_id_str"] = nfl.get("espn_id").astype("Int64").astype(str).replace({"<NA>": ""})
    espn["id_str"] = espn["id"].astype(str)

    # load review + build override map (orig espn_id -> confirmed_espn_id)
    rev = pd.read_excel(XLSX, sheet_name=SHEET, dtype=str).fillna("")
    if COL_CONF not in rev.columns:
        raise SystemExit(f"Sheet '{SHEET}' missing column '{COL_CONF}'")

    # find the original espn id column (common names)
    orig_col = None
    for c in ["espn_id", "espn_id_str", "id", "id_str"]:
        if c in rev.columns:
            orig_col = c
            break
    if orig_col is None:
        raise SystemExit(f"Couldn't find an original espn id column in review sheet. Columns: {rev.columns.tolist()}")

    rev[orig_col] = rev[orig_col].astype(str).str.strip()
    rev[COL_CONF] = rev[COL_CONF].astype(str).str.strip()

    overrides = rev[(rev[orig_col] != "") & (rev[COL_CONF] != "")].copy()
    # keep only numeric-ish
    overrides = overrides[overrides[COL_CONF].str.match(r"^\d+$", na=False)]
    overrides = overrides.drop_duplicates(subset=[orig_col])

    override_map = dict(zip(overrides[orig_col], overrides[COL_CONF]))

    # apply overrides to nflverse espn_id_str
    before = nfl["espn_id_str"].copy()
    nfl["espn_id_str"] = nfl["espn_id_str"].map(lambda x: override_map.get(x, x))
    changed = (before != nfl["espn_id_str"]) & (before != "")

    # join with espn index on overridden espn_id_str
    joined = nfl.merge(
        espn,
        how="left",
        left_on="espn_id_str",
        right_on="id_str",
        suffixes=("_nflverse", "_espn")
    )

    # write outputs
    out_parquet = OUT_DIR / "players_master_nflverse_x_espn_index_OVERRIDES.parquet"
    out_csv = OUT_DIR / "players_master_nflverse_x_espn_index_OVERRIDES.csv"
    audit_csv = OUT_DIR / "confirmed_override_audit.csv"

    joined.to_parquet(out_parquet, index=False)
    joined.to_csv(out_csv, index=False)

    # quick audit
    total_with_espn = (before != "").sum()
    matched_after = joined["id"].notna().sum()

    pd.DataFrame([{
        "excel": str(XLSX),
        "sheet": SHEET,
        "override_rows_used": int(len(overrides)),
        "nflverse_rows": int(len(nfl)),
        "nflverse_rows_with_espn_id_before": int(total_with_espn),
        "nflverse_rows_changed_by_override": int(changed.sum()),
        "matched_rows_after_override": int(matched_after),
    }]).to_csv(audit_csv, index=False)

    print("=== OVERRIDES APPLIED ===")
    print("Override rows used:", len(overrides))
    print("NFL rows changed:", int(changed.sum()))
    print("Matched rows after override:", int(matched_after))
    print("Wrote:", out_parquet)
    print("Wrote:", out_csv)
    print("Wrote:", audit_csv)

if __name__ == "__main__":
    main()
