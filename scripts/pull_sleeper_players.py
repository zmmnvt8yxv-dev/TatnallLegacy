import json
import re
from pathlib import Path
import pandas as pd
import requests

OUT_DIR = Path("data_raw/sleeper")
OUT_DIR.mkdir(parents=True, exist_ok=True)

URL = "https://api.sleeper.app/v1/players/nfl"

def to_ymd(x):
    if x is None: return ""
    s = str(x).strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else ""

def norm_name(x: str) -> str:
    x = (x or "").lower().strip()
    x = re.sub(r"[^a-z0-9\s]", "", x)
    x = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", x).strip()
    x = re.sub(r"\s+", " ", x).strip()
    return x

def main():
    raw_path = OUT_DIR / "players_raw.json"
    flat_csv  = OUT_DIR / "players_flat.csv"
    flat_parq = OUT_DIR / "players_flat.parquet"
    cols_csv  = OUT_DIR / "players_columns.csv"

    print("Fetching Sleeper players:", URL)
    r = requests.get(URL, timeout=120)
    r.raise_for_status()
    data = r.json()

    # Save raw
    raw_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print("Saved raw:", raw_path)

    # data is dict keyed by sleeper_id
    rows = []
    for sleeper_id, p in data.items():
        if not isinstance(p, dict):
            continue
        row = dict(p)
        row["sleeper_id"] = str(sleeper_id)

        # common display fields
        full = row.get("full_name") or row.get("first_name","") + " " + row.get("last_name","")
        row["full_name"] = (full or "").strip()

        row["dob_ymd"] = to_ymd(row.get("birth_date") or row.get("dob"))
        row["name_norm"] = norm_name(row["full_name"])
        row["last_norm"] = norm_name(row.get("last_name") or "").split(" ")[-1] if row.get("last_name") else ""

        rows.append(row)

    df = pd.DataFrame(rows)
    df.to_csv(flat_csv, index=False)
    df.to_parquet(flat_parq, index=False)

    pd.DataFrame({"column": df.columns}).to_csv(cols_csv, index=False)

    print("Rows:", len(df), "Cols:", df.shape[1])
    print("Wrote:", flat_csv)
    print("Wrote:", flat_parq)
    print("Wrote:", cols_csv)

if __name__ == "__main__":
    main()
