#!/usr/bin/env python3
import argparse, json, re
from pathlib import Path

import pandas as pd

def read_any_players_spine(path: Path) -> pd.DataFrame:
    # supports parquet/csv
    if path.suffix.lower() == ".parquet":
        return pd.read_parquet(path)
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path)
    raise ValueError(f"Unsupported: {path}")

def pick(d, *keys):
    for k in keys:
        if isinstance(d, dict) and k in d and d[k] not in (None, ""):
            return d[k]
    return None

def norm_date(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return ""
    s = str(x).strip()
    # nflverse birth_date is like 1993-03-25 ; espn is 1993-03-25T08:00Z
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else s

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nflverse", default="data_raw/nflverse_players.parquet",
                    help="nflverse players spine (parquet or csv)")
    ap.add_argument("--espn-dir", default="data_raw/espn_core/athletes",
                    help="directory of ESPN athlete JSONs named <espn_id>.json")
    ap.add_argument("--out-dir", default="data_raw/verify")
    ap.add_argument("--sample", type=int, default=200, help="rows to print to terminal")
    args = ap.parse_args()

    nfl_path = Path(args.nflverse)
    espn_dir = Path(args.espn_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = read_any_players_spine(nfl_path)

    if "espn_id" not in df.columns:
        raise SystemExit("nflverse file has no espn_id column")

    # keep only rows with espn_id
    df = df[df["espn_id"].notna()].copy()
    df["espn_id"] = df["espn_id"].astype(str).str.replace(r"\.0$", "", regex=True).str.strip()
    df = df[df["espn_id"].str.fullmatch(r"\d+")].copy()

    # minimal nflverse columns (only keep if exists)
    keep = [c for c in [
        "gsis_id","display_name","first_name","last_name","birth_date","position","team",
        "position_group","ngs_position_group","pfr_id","pff_id","smart_id"
    ] if c in df.columns]
    base = df[["espn_id"] + keep].copy()
    base["birth_date"] = base.get("birth_date", "").map(norm_date)

    # load ESPN JSON for each id (fast enough for audit; 19k)
    rows = []
    missing = 0
    bad = 0

    for espn_id in base["espn_id"].tolist():
        p = espn_dir / f"{espn_id}.json"
        if not p.exists():
            missing += 1
            rows.append({"espn_id": espn_id, "espn_json_exists": False})
            continue
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            bad += 1
            rows.append({"espn_id": espn_id, "espn_json_exists": True, "espn_json_parse_ok": False})
            continue

        # ESPN fields commonly present
        espn_first = pick(d, "firstName")
        espn_last  = pick(d, "lastName")
        espn_full  = pick(d, "fullName", "displayName")
        espn_dob   = norm_date(pick(d, "dateOfBirth"))
        espn_active = pick(d, "active")
        espn_pos   = None
        if isinstance(d.get("position"), dict):
            espn_pos = pick(d["position"], "abbreviation", "name", "displayName")
        espn_team  = None
        # team sometimes nested as "team": {"abbreviation": "..."} or "teams": [...]
        if isinstance(d.get("team"), dict):
            espn_team = pick(d["team"], "abbreviation", "shortDisplayName", "displayName")
        rows.append({
            "espn_id": espn_id,
            "espn_json_exists": True,
            "espn_json_parse_ok": True,
            "espn_fullName": espn_full or "",
            "espn_firstName": espn_first or "",
            "espn_lastName": espn_last or "",
            "espn_dob": espn_dob or "",
            "espn_position": espn_pos or "",
            "espn_team": espn_team or "",
            "espn_active": espn_active if espn_active is not None else "",
            "espn_json_path": str(p),
        })

    espn_df = pd.DataFrame(rows)

    merged = base.merge(espn_df, on="espn_id", how="left")

    # matching signals
    merged["name_match"] = (
        merged.get("display_name","").fillna("").str.strip().str.lower()
        == merged["espn_fullName"].fillna("").str.strip().str.lower()
    )
    merged["dob_match"] = (
        merged.get("birth_date","").fillna("").map(norm_date)
        == merged["espn_dob"].fillna("").map(norm_date)
    )

    # save full audit
    out_all = out_dir / "nflverse_x_espn_core_audit.csv"
    merged.to_csv(out_all, index=False)

    # suspicious rows: missing json, parse fail, or name/dob mismatch
    suspicious = merged[
        (merged["espn_json_exists"] != True) |
        (merged.get("espn_json_parse_ok", True) != True) |
        (~merged["name_match"] & ~merged["dob_match"])
    ].copy()
    out_susp = out_dir / "nflverse_x_espn_core_suspicious.csv"
    suspicious.to_csv(out_susp, index=False)

    # summary
    total = len(merged)
    exist_ok = int((merged["espn_json_exists"] == True).sum())
    parse_ok = int((merged.get("espn_json_parse_ok", True) == True).sum())
    name_ok = int((merged["name_match"] == True).sum())
    dob_ok = int((merged["dob_match"] == True).sum())

    print("=== JOIN AUDIT SUMMARY ===")
    print("nflverse rows w/ espn_id:", total)
    print("espn json exists:", exist_ok, f"({exist_ok/total:.1%})")
    print("espn json parse ok:", parse_ok, f"({parse_ok/total:.1%})")
    print("exact name match:", name_ok, f"({name_ok/total:.1%})")
    print("dob match:", dob_ok, f"({dob_ok/total:.1%})")
    print("missing json files:", missing)
    print("bad json files:", bad)
    print("Wrote:", out_all)
    print("Wrote:", out_susp)

    # show a small sample of suspicious rows for quick eyeballing
    if len(suspicious):
        cols = [c for c in [
            "espn_id","display_name","birth_date","position","team",
            "espn_fullName","espn_dob","espn_position","espn_team",
            "espn_json_exists","espn_json_parse_ok","name_match","dob_match"
        ] if c in suspicious.columns]
        print("\n--- SAMPLE suspicious rows ---")
        print(suspicious[cols].head(args.sample).to_string(index=False))
    else:
        print("\nNo suspicious rows found 🎯")

if __name__ == "__main__":
    main()
