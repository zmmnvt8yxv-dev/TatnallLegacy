from pathlib import Path
import pandas as pd

XLSX = Path("data_raw/verify/suspicious_match_review.xlsx")
ESPN_INDEX = Path("data_raw/espn_core/index/athletes_index_flat.parquet")
COL = "confirmed_espn_id"

def load_sheet_with_col(xlsx: Path, col: str):
    xl = pd.ExcelFile(xlsx)
    for sh in xl.sheet_names:
        df = pd.read_excel(xlsx, sheet_name=sh, dtype=str).fillna("")
        if col in df.columns:
            return sh, df
    raise SystemExit(f"Couldn't find column '{col}' in any sheet. Sheets: {xl.sheet_names}")

def main():
    if not XLSX.exists():
        raise SystemExit(f"Missing {XLSX}")
    if not ESPN_INDEX.exists():
        raise SystemExit(f"Missing {ESPN_INDEX}")

    sheet, df = load_sheet_with_col(XLSX, COL)

    confirmed = (
        df[COL].astype(str).str.strip()
        .replace({"nan": "", "None": "", "NULL": "", "null": ""})
    )
    confirmed = confirmed[confirmed != ""].drop_duplicates()

    idx = pd.read_parquet(ESPN_INDEX)
    if "id" not in idx.columns:
        raise SystemExit(f"ESPN index missing 'id' column. Columns: {idx.columns.tolist()}")

    idx_ids = set(idx["id"].astype(str).str.strip().tolist())

    in_index = confirmed[confirmed.isin(idx_ids)]
    not_in_index = confirmed[~confirmed.isin(idx_ids)]

    out_dir = Path("data_raw/verify")
    out_dir.mkdir(parents=True, exist_ok=True)

    in_path = out_dir / "confirmed_espn_ids_found_in_index.csv"
    out_path = out_dir / "confirmed_espn_ids_missing_from_index.csv"

    in_index.to_frame("confirmed_espn_id").to_csv(in_path, index=False)
    not_in_index.to_frame("confirmed_espn_id").to_csv(out_path, index=False)

    print("=== CONFIRMED ESPN ID CHECK ===")
    print("Excel:", XLSX)
    print("Sheet used:", sheet)
    print("Confirmed IDs (nonblank):", len(confirmed))
    print("Found in ESPN index:", len(in_index))
    print("Missing from ESPN index:", len(not_in_index))
    print("Wrote:", in_path)
    print("Wrote:", out_path)

if __name__ == "__main__":
    main()
