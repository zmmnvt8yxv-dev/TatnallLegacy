from pathlib import Path
import pandas as pd

NFLVERSE_CANDIDATES = [
    Path("data_raw/nflverse_players.parquet"),
    Path("data_raw/nflverse_players.csv"),
    Path("data_raw/nflverse/players.parquet"),
    Path("data_raw/nflverse/players.csv"),
]

ESPN_INDEX_PARQUET = Path("data_raw/espn_core/index/athletes_index_flat.parquet")
OUT_DIR = Path("data_raw/master")

def find_nflverse_path():
    for p in NFLVERSE_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit(f"Could not find nflverse players file. Tried: {NFLVERSE_CANDIDATES}")

def read_any(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".parquet":
        return pd.read_parquet(path)
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path, dtype=str)
    raise SystemExit(f"Unsupported file type: {path}")

def norm_yyyy_mm_dd(x):
    if pd.isna(x):
        return ""
    s = str(x)
    # keep first YYYY-MM-DD if present
    return s[:10] if len(s) >= 10 and s[4] == "-" and s[7] == "-" else s

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    nfl_path = find_nflverse_path()
    nfl = read_any(nfl_path)

    if not ESPN_INDEX_PARQUET.exists():
        raise SystemExit(f"Missing ESPN index parquet: {ESPN_INDEX_PARQUET}")

    espn = pd.read_parquet(ESPN_INDEX_PARQUET)

    # ---- normalize join keys ----
    # nflverse espn_id often numeric or string; force string digits
    if "espn_id" not in nfl.columns:
        raise SystemExit(f"nflverse file missing espn_id column. Columns: {list(nfl.columns)}")
    nfl["espn_id_str"] = nfl["espn_id"].astype(str).str.strip()
    nfl["espn_id_str"] = nfl["espn_id_str"].replace({"nan": "", "None": ""})

    # ESPN index uses "id" as the athlete id
    if "id" not in espn.columns:
        raise SystemExit(f"ESPN index missing id column. Columns: {list(espn.columns)}")
    espn["espn_id_str"] = espn["id"].astype(str).str.strip()

    # optional DOB normalize for audits
    if "birth_date" in nfl.columns:
        nfl["birth_date_ymd"] = nfl["birth_date"].map(norm_yyyy_mm_dd)
    elif "birthDate" in nfl.columns:
        nfl["birth_date_ymd"] = nfl["birthDate"].map(norm_yyyy_mm_dd)
    else:
        nfl["birth_date_ymd"] = ""

    if "dateOfBirth" in espn.columns:
        espn["dateOfBirth_ymd"] = espn["dateOfBirth"].map(norm_yyyy_mm_dd)
    else:
        espn["dateOfBirth_ymd"] = ""

    # ---- join ----
    joined = nfl.merge(
        espn,
        how="left",
        on="espn_id_str",
        suffixes=("", "__espn"),
        indicator=True,
    )

    # ---- audit ----
    total_with_espn = (joined["espn_id_str"] != "").sum()
    matched = (joined["_merge"] == "both").sum()
    match_rate = (matched / total_with_espn * 100.0) if total_with_espn else 0.0

    # name + dob checks where possible
    nfl_name_col = "display_name" if "display_name" in joined.columns else ("full_name" if "full_name" in joined.columns else None)
    espn_name_col = "fullName" if "fullName" in joined.columns else ("displayName" if "displayName" in joined.columns else None)

    joined["name_match"] = False
    if nfl_name_col and espn_name_col:
        joined["name_match"] = (
            joined[nfl_name_col].astype(str).str.strip().str.lower()
            ==
            joined[espn_name_col].astype(str).str.strip().str.lower()
        )

    joined["dob_match"] = False
    if "birth_date_ymd" in joined.columns and "dateOfBirth_ymd" in joined.columns:
        joined["dob_match"] = (joined["birth_date_ymd"] != "") & (joined["birth_date_ymd"] == joined["dateOfBirth_ymd"])

    suspicious = joined[
        (joined["_merge"] == "both") &
        (
            (joined["dob_match"] == False) |
            (joined["name_match"] == False)
        )
    ].copy()

    # ---- write outputs ----
    out_parquet = OUT_DIR / "players_master_nflverse_x_espn_index.parquet"
    out_csv = OUT_DIR / "players_master_nflverse_x_espn_index.csv"
    audit_csv = OUT_DIR / "join_audit_summary.csv"
    suspicious_csv = OUT_DIR / "join_suspicious_rows.csv"

    joined.to_parquet(out_parquet, index=False)
    joined.to_csv(out_csv, index=False)

    pd.DataFrame([{
        "nflverse_source": str(nfl_path),
        "espn_index_source": str(ESPN_INDEX_PARQUET),
        "nflverse_rows_total": len(nfl),
        "nflverse_rows_with_espn_id": int(total_with_espn),
        "matched_rows": int(matched),
        "match_rate_pct": round(match_rate, 2),
        "suspicious_rows": int(len(suspicious)),
        "nfl_name_col": nfl_name_col or "",
        "espn_name_col": espn_name_col or "",
    }]).to_csv(audit_csv, index=False)

    # keep suspicious smaller + readable
    keep_cols = []
    for c in ["espn_id", "espn_id_str", "gsis_id", "display_name", "first_name", "last_name", "birth_date", "position",
              "id", "fullName", "displayName", "dateOfBirth", "active", "name_match", "dob_match", "_merge"]:
        if c in suspicious.columns:
            keep_cols.append(c)
    suspicious[keep_cols].to_csv(suspicious_csv, index=False)

    print("=== JOIN COMPLETE ===")
    print("NFL source:", nfl_path)
    print("ESPN index:", ESPN_INDEX_PARQUET)
    print("Rows nfl:", len(nfl))
    print("Rows w/ espn_id:", int(total_with_espn))
    print("Matched:", int(matched), f"({match_rate:.2f}%)")
    print("Suspicious:", len(suspicious))
    print("Wrote:", out_parquet)
    print("Wrote:", out_csv)
    print("Wrote:", audit_csv)
    print("Wrote:", suspicious_csv)

if __name__ == "__main__":
    main()
