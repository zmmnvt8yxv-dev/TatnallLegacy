from pathlib import Path
import pandas as pd
import re

IN_PARQUET = Path("data_raw/master/players_master_nflverse_x_espn_index_OVERRIDES.parquet")
OUT_DIR = Path("data_raw/verify")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def norm_name(x: str) -> str:
    x = (x or "")
    x = x.lower().strip()
    x = re.sub(r"[^a-z0-9\s]", "", x)
    x = re.sub(r"\s+", " ", x).strip()
    # remove common suffix tokens for matching
    x = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", x).strip()
    x = re.sub(r"\s+", " ", x).strip()
    return x

def ymd(x) -> str:
    if pd.isna(x): return ""
    s = str(x).strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else ""

def main():
    if not IN_PARQUET.exists():
        raise SystemExit(f"Missing {IN_PARQUET}")

    df = pd.read_parquet(IN_PARQUET)

    # ESPN side columns (from index)
    # commonly: fullName, displayName, dateOfBirth, active, position, team, guid, id
    # NFLverse side: display_name, birth_date, position, gsis_id, espn_id_str
    df["nfl_name_norm"] = df.get("display_name", "").astype(str).map(norm_name)
    df["espn_name_norm"] = df.get("fullName", "").astype(str).map(norm_name)

    df["birth_date_ymd"] = df.get("birth_date", "").map(ymd)
    df["dateOfBirth_ymd"] = df.get("dateOfBirth", "").map(ymd)

    df["name_match"] = (df["nfl_name_norm"] != "") & (df["nfl_name_norm"] == df["espn_name_norm"])
    df["dob_match"] = (df["birth_date_ymd"] != "") & (df["birth_date_ymd"] == df["dateOfBirth_ymd"])

    # suspicious = both present but name or dob mismatch
    suspicious = df[
        df.get("id").notna() &
        (~df["name_match"] | ~df["dob_match"])
    ].copy()

    keep = []
    for c in [
        "espn_id", "espn_id_str", "gsis_id", "display_name", "first_name", "last_name", "birth_date", "position",
        "id", "guid", "fullName", "displayName", "dateOfBirth", "active", "team", "name_match", "dob_match"
    ]:
        if c in suspicious.columns:
            keep.append(c)

    out_csv = OUT_DIR / "join_suspicious_rows_after_overrides.csv"
    suspicious[keep].to_csv(out_csv, index=False)

    print("=== SUSPICIOUS AFTER OVERRIDES ===")
    print("Rows suspicious:", len(suspicious))
    print("Wrote:", out_csv)

if __name__ == "__main__":
    main()
