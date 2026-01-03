import re
import math
from pathlib import Path
import pandas as pd
from difflib import SequenceMatcher

SUSPICIOUS_CSV = Path("data_raw/master/join_suspicious_rows.csv")
ESPN_INDEX_PARQUET = Path("data_raw/espn_core/index/athletes_index_flat.parquet")
OUT_XLSX = Path("data_raw/verify/suspicious_match_review.xlsx")

TOP_N = 5  # candidates per row

def norm_name(s: str) -> str:
    if s is None or (isinstance(s, float) and math.isnan(s)):
        return ""
    s = str(s).lower().strip()
    # remove common suffixes
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", s)
    # normalize punctuation
    s = s.replace("’", "'")
    s = re.sub(r"[^a-z0-9\s']", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def dob_ymd(x) -> str:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    s = str(x)
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else ""

def sim(a: str, b: str) -> float:
    # 0..1
    return SequenceMatcher(None, a, b).ratio()

def pick_best_candidates(row, espn_df):
    """
    Return list of candidate dicts: score, id, guid, fullName, displayName, dob, team, pos, active
    """
    nfl_name = norm_name(row.get("display_name") or "")
    espn_name = norm_name(row.get("fullName") or row.get("displayName") or "")
    # prefer NFL-side name if present
    target_name = nfl_name or espn_name

    nfl_dob = dob_ymd(row.get("birth_date") or row.get("birth_date_ymd") or "")
    espn_dob = dob_ymd(row.get("dateOfBirth") or row.get("dateOfBirth_ymd") or "")
    target_dob = nfl_dob or espn_dob

    target_pos = (row.get("position") or "").strip()

    # --- candidate pool ---
    cand = espn_df

    # 1) gate by DOB when we have it
    if target_dob:
        cand = cand[cand["dateOfBirth_ymd"] == target_dob]
    # 2) otherwise gate by position if we have it
    elif target_pos:
        cand = cand[cand["position"].fillna("") == target_pos]

    # If we over-gated to nothing, fall back to full set
    if len(cand) == 0:
        cand = espn_df

    scored = []
    for _, r in cand.iterrows():
        c_name = r["__name_norm"]
        score = sim(target_name, c_name)

        # small bonuses for matching signals
        bonus = 0.0
        if target_dob and r.get("dateOfBirth_ymd") == target_dob:
            bonus += 0.10
        if target_pos and str(r.get("position") or "") == target_pos:
            bonus += 0.05
        score = min(1.0, score + bonus)

        scored.append({
            "score": round(score, 4),
            "cand_id": r.get("id",""),
            "cand_guid": r.get("guid",""),
            "cand_fullName": r.get("fullName",""),
            "cand_displayName": r.get("displayName",""),
            "cand_dob": r.get("dateOfBirth_ymd",""),
            "cand_position": r.get("position",""),
            "cand_team": r.get("team",""),
            "cand_active": r.get("active", ""),
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:TOP_N]

def main():
    if not SUSPICIOUS_CSV.exists():
        raise SystemExit(f"Missing {SUSPICIOUS_CSV}")

    if not ESPN_INDEX_PARQUET.exists():
        raise SystemExit(f"Missing {ESPN_INDEX_PARQUET}")

    OUT_XLSX.parent.mkdir(parents=True, exist_ok=True)

    sus = pd.read_csv(SUSPICIOUS_CSV, dtype=str).fillna("")
    espn = pd.read_parquet(ESPN_INDEX_PARQUET)

    # normalize columns we need
    # ensure id/guid/fullName/displayName/dateOfBirth/team/position/active exist
    for c in ["id","guid","fullName","displayName","dateOfBirth","position","team","active"]:
        if c not in espn.columns:
            espn[c] = ""

    espn["dateOfBirth_ymd"] = espn["dateOfBirth"].map(dob_ymd)
    espn["__name_norm"] = espn["fullName"].fillna(espn["displayName"]).astype(str).map(norm_name)

    # Build workbook rows
    out_rows = []
    for _, row in sus.iterrows():
        base = {
            "espn_id": row.get("espn_id", row.get("id","")),
            "gsis_id": row.get("gsis_id",""),
            "nfl_display_name": row.get("display_name",""),
            "nfl_birth_date": row.get("birth_date", row.get("birth_date_ymd","")),
            "nfl_position": row.get("position",""),
            "espn_fullName_current_join": row.get("fullName",""),
            "espn_displayName_current_join": row.get("displayName",""),
            "espn_dateOfBirth_current_join": row.get("dateOfBirth",""),
            "active_current_join": row.get("active",""),
            "name_match": row.get("name_match",""),
            "dob_match": row.get("dob_match",""),
            # YOU will fill these:
            "confirmed_guid": "",
            "confirmed_notes": "",
            "confirmed_ok": "",
        }

        cands = pick_best_candidates(row, espn)
        for i in range(TOP_N):
            if i < len(cands):
                c = cands[i]
            else:
                c = {"score":"","cand_id":"","cand_guid":"","cand_fullName":"","cand_displayName":"","cand_dob":"","cand_position":"","cand_team":"","cand_active":""}

            base[f"cand{i+1}_score"] = c["score"]
            base[f"cand{i+1}_guid"] = c["cand_guid"]
            base[f"cand{i+1}_id"] = c["cand_id"]
            base[f"cand{i+1}_fullName"] = c["cand_fullName"]
            base[f"cand{i+1}_dob"] = c["cand_dob"]
            base[f"cand{i+1}_pos"] = c["cand_position"]
            base[f"cand{i+1}_team"] = c["cand_team"]
            base[f"cand{i+1}_active"] = c["cand_active"]

        out_rows.append(base)

    df = pd.DataFrame(out_rows)

    # Write xlsx with basic formatting
    with pd.ExcelWriter(OUT_XLSX, engine="openpyxl") as xw:
        df.to_excel(xw, index=False, sheet_name="review")
        # add a small helper tab with instructions
        instr = pd.DataFrame([
            {"How to use": "Pick the correct candidate GUID (cand*_guid) and paste into confirmed_guid."},
            {"How to use": "Optionally mark confirmed_ok = Y, and add notes."},
            {"How to use": "If none match, leave blank and add why in confirmed_notes."},
        ])
        instr.to_excel(xw, index=False, sheet_name="instructions")

    print("Wrote:", OUT_XLSX)
    print("Rows:", len(df), "Candidates per row:", TOP_N)

if __name__ == "__main__":
    main()
