import json, re
from pathlib import Path
import pandas as pd
from rapidfuzz import fuzz, process

ROOT = Path(".")
SLEEPER_JSON = ROOT / "data_raw/sleeper/players_raw.json"
ESPN_ALL_CSV = ROOT / "data_raw/verify/espn_all.csv"
OUT_DIR = ROOT / "data_raw/verify"
OUT_DIR.mkdir(parents=True, exist_ok=True)

def norm_name(s: str) -> str:
    if s is None: return ""
    s = str(s).strip().lower()
    # normalize punctuation/spacing
    s = s.replace("&", "and")
    s = re.sub(r"[\.\,\(\)\"\']", "", s)
    s = s.replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()

    # strip common suffixes
    suffixes = {"jr","sr","ii","iii","iv","v"}
    parts = s.split()
    if parts and parts[-1] in suffixes:
        parts = parts[:-1]
    return " ".join(parts)

def norm_dob(s: str) -> str:
    # ESPN uses "YYYY-MM-DDTHH:MMZ" sometimes; Sleeper commonly "YYYY-MM-DD"
    if s is None or str(s).strip()=="":
        return ""
    s = str(s).strip()
    return s[:10]  # YYYY-MM-DD

def safe(x): 
    return "" if pd.isna(x) else str(x)

def build_sleeper_df():
    d = json.loads(SLEEPER_JSON.read_text(encoding="utf-8"))
    rows = []
    for sleeper_id, p in d.items():
        if not isinstance(p, dict): 
            continue
        full = p.get("full_name") or (f"{p.get('first_name','')} {p.get('last_name','')}".strip())
        dob = p.get("birth_date") or p.get("birthdate") or ""
        rows.append({
            "sleeper_id": str(sleeper_id),
            "sleeper_full_name": full or "",
            "sleeper_first_name": p.get("first_name") or "",
            "sleeper_last_name": p.get("last_name") or "",
            "sleeper_dob": norm_dob(dob),
            "sleeper_pos": p.get("position") or "",
            "sleeper_team": p.get("team") or "",
            "sleeper_status": p.get("status") or "",
            "sleeper_active": p.get("active"),
        })
    df = pd.DataFrame(rows)
    df["sleeper_name_norm"] = df["sleeper_full_name"].map(norm_name)
    df["key_full_dob"] = df["sleeper_dob"].fillna("") + "|" + df["sleeper_name_norm"].fillna("")
    df["key_last_fi_dob"] = df["sleeper_dob"].fillna("") + "|" + df["sleeper_last_name"].map(norm_name).fillna("") + "|" + df["sleeper_first_name"].map(lambda x: norm_name(x)[:1] if x else "")
    return df

def build_espn_df():
    df = pd.read_csv(ESPN_ALL_CSV)
    # expected cols: espn_id, fullName, dateOfBirth, position, team ...
    df["espn_id"] = df["espn_id"].astype(str)
    df["espn_dob"] = df["dateOfBirth"].map(norm_dob)
    df["espn_name_norm"] = df["fullName"].map(norm_name)
    df["espn_last_norm"] = df["lastName"].map(norm_name)
    df["espn_fi"] = df["firstName"].map(lambda x: norm_name(x)[:1] if isinstance(x,str) else "")
    df["key_full_dob"] = df["espn_dob"].fillna("") + "|" + df["espn_name_norm"].fillna("")
    df["key_last_fi_dob"] = df["espn_dob"].fillna("") + "|" + df["espn_last_norm"].fillna("") + "|" + df["espn_fi"].fillna("")
    return df

def main():
    if not SLEEPER_JSON.exists():
        raise SystemExit(f"Missing {SLEEPER_JSON}. Run the curl pull first.")
    if not ESPN_ALL_CSV.exists():
        raise SystemExit(f"Missing {ESPN_ALL_CSV}. Generate it first.")

    sleeper = build_sleeper_df()
    espn = build_espn_df()

    # 1) Exact join: dob + normalized full name
    exact = espn.merge(
        sleeper[["sleeper_id","sleeper_full_name","sleeper_dob","sleeper_pos","sleeper_team","key_full_dob"]],
        on="key_full_dob",
        how="left",
        suffixes=("","_s")
    )
    exact["match_method"] = exact["sleeper_id"].notna().map(lambda x: "exact_fullname_dob" if x else "")

    # 2) Fallback join: dob + last + first initial (only for unmatched)
    need = exact[exact["sleeper_id"].isna()].copy()
    if len(need) > 0:
        fb = need.drop(columns=[c for c in ["sleeper_id","sleeper_full_name","sleeper_dob","sleeper_pos","sleeper_team"] if c in need.columns])
        fb = fb.merge(
            sleeper[["sleeper_id","sleeper_full_name","sleeper_dob","sleeper_pos","sleeper_team","key_last_fi_dob"]],
            left_on="key_last_fi_dob",
            right_on="key_last_fi_dob",
            how="left"
        )
        fb["match_method"] = fb["sleeper_id"].notna().map(lambda x: "fallback_last_fi_dob" if x else "")
        # put back into exact
        exact.loc[exact["sleeper_id"].isna(), ["sleeper_id","sleeper_full_name","sleeper_dob","sleeper_pos","sleeper_team","match_method"]] = \
            fb[["sleeper_id","sleeper_full_name","sleeper_dob","sleeper_pos","sleeper_team","match_method"]].values

    # 3) Controlled fuzzy: only same DOB, pick best name similarity
    still = exact[exact["sleeper_id"].isna() & exact["espn_dob"].notna() & (exact["espn_dob"]!="")].copy()
    fuzzy_rows = []
    if len(still) > 0:
        # index sleeper names by dob
        sleeper_by_dob = {}
        for dob, grp in sleeper[sleeper["sleeper_dob"]!=""].groupby("sleeper_dob"):
            sleeper_by_dob[dob] = grp

        for _, r in still.iterrows():
            dob = r["espn_dob"]
            target = r["espn_name_norm"]
            grp = sleeper_by_dob.get(dob)
            if grp is None or target=="":
                continue

            choices = grp["sleeper_name_norm"].tolist()
            best = process.extractOne(target, choices, scorer=fuzz.token_sort_ratio)
            if not best:
                continue

            best_name, score, idx = best
            if score < 92:  # threshold: conservative
                continue

            hit = grp.iloc[idx]
            fuzzy_rows.append((r["espn_id"], hit["sleeper_id"], hit["sleeper_full_name"], score, "fuzzy_same_dob"))

        if fuzzy_rows:
            fuzzy_df = pd.DataFrame(fuzzy_rows, columns=["espn_id","sleeper_id","sleeper_full_name","fuzzy_score","match_method"])
            exact = exact.merge(fuzzy_df, on="espn_id", how="left", suffixes=("","_fz"))
            # fill from fuzzy where still empty
            mask = exact["sleeper_id"].isna() & exact["sleeper_id_fz"].notna()
            exact.loc[mask, "sleeper_id"] = exact.loc[mask, "sleeper_id_fz"]
            exact.loc[mask, "sleeper_full_name"] = exact.loc[mask, "sleeper_full_name_fz"]
            exact.loc[mask, "match_method"] = exact.loc[mask, "match_method_fz"]
            exact.loc[mask, "fuzzy_score"] = exact.loc[mask, "fuzzy_score"]
            exact = exact.drop(columns=[c for c in exact.columns if c.endswith("_fz")])

    # Outputs
    out_all = OUT_DIR / "espn_active_x_sleeper_xwalk.csv"
    out_unmatched = OUT_DIR / "espn_active_x_sleeper_unmatched.csv"

    exact["matched"] = exact["sleeper_id"].notna()
    exact.to_csv(out_all, index=False)
    exact[~exact["matched"]].to_csv(out_unmatched, index=False)

    print("=== ESPN (active) ↔ Sleeper join summary ===")
    print("espn active rows:", len(exact))
    print("matched:", int(exact["matched"].sum()), f"({exact['matched'].mean()*100:.1f}%)")
    print("by method:")
    print(exact["match_method"].value_counts(dropna=False).head(10))
    print("Wrote:", out_all)
    print("Wrote:", out_unmatched)

if __name__ == "__main__":
    main()
