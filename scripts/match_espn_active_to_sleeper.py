import re
from pathlib import Path
import pandas as pd
from difflib import SequenceMatcher

ESPN_ACTIVE = Path("data_raw/espn_core/index/athletes_active_only.csv")
SLEEPER_FLAT = Path("data_raw/sleeper/players_flat.parquet")

OUT_DIR = Path("data_raw/verify")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def norm_name(x: str) -> str:
    x = (x or "").lower().strip()
    x = re.sub(r"[^a-z0-9\s]", "", x)
    x = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", x).strip()
    x = re.sub(r"\s+", " ", x).strip()
    return x

def ymd(x) -> str:
    if pd.isna(x): return ""
    s = str(x).strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else ""

def ratio(a,b):
    return SequenceMatcher(None, a, b).ratio()

def main():
    if not ESPN_ACTIVE.exists():
        raise SystemExit(f"Missing {ESPN_ACTIVE} (generate ESPN active-only first)")
    if not SLEEPER_FLAT.exists():
        raise SystemExit(f"Missing {SLEEPER_FLAT} (run pull_sleeper_players.py first)")

    e = pd.read_csv(ESPN_ACTIVE, dtype=str).fillna("")
    s = pd.read_parquet(SLEEPER_FLAT).fillna("")

    # expected ESPN columns: id (espn id), fullName, dateOfBirth, active, position, team, guid...
    e["espn_id"] = e.get("id","").astype(str)
    e["espn_name"] = e.get("fullName","").astype(str)
    e["espn_dob_ymd"] = e.get("dateOfBirth","").map(ymd)
    e["espn_name_norm"] = e["espn_name"].map(norm_name)

    s["sleeper_name"] = s.get("full_name","").astype(str)
    s["sleeper_dob_ymd"] = s.get("dob_ymd","").map(ymd)
    s["sleeper_name_norm"] = s.get("name_norm","").map(norm_name)

    # build fast lookup: (dob, name_norm) -> sleeper rows
    s_key = s[["sleeper_id","sleeper_name","sleeper_dob_ymd","sleeper_name_norm","position","team","active","status"]].copy()
    s_key["k_full_dob"] = s_key["sleeper_name_norm"] + "|" + s_key["sleeper_dob_ymd"]

    e_key = e.copy()
    e_key["k_full_dob"] = e_key["espn_name_norm"] + "|" + e_key["espn_dob_ymd"]

    # 1) exact key join
    exact = e_key.merge(
        s_key,
        on="k_full_dob",
        how="left",
        suffixes=("","_s")
    )

    exact["match_method"] = exact["sleeper_id"].apply(lambda x: "exact_fullname_dob" if str(x) != "" else "")
    exact["matched"] = exact["sleeper_id"].astype(str).ne("")

    # 2) for unmatched, do DOB-gated fuzzy on name
    unmatched = exact[~exact["matched"]].copy()

    # Pre-group sleeper by DOB for speed
    dob_groups = {dob: grp for dob, grp in s_key.groupby("sleeper_dob_ymd") if dob}

    best_rows = []
    for _, r in unmatched.iterrows():
        dob = r["espn_dob_ymd"]
        name = r["espn_name_norm"]
        cand = dob_groups.get(dob)
        if cand is None or cand.empty or not dob:
            # if no DOB, skip fuzzy (too risky)
            best_rows.append((r["espn_id"], "", "", 0.0, ""))
            continue

        # score candidates
        best = ("", "", 0.0)
        second = ("", "", 0.0)
        for __, sr in cand.iterrows():
            sc = ratio(name, sr["sleeper_name_norm"])
            if sc > best[2]:
                second = best
                best = (sr["sleeper_id"], sr["sleeper_name"], sc)
            elif sc > second[2]:
                second = (sr["sleeper_id"], sr["sleeper_name"], sc)

        # accept only if strong + clearly better than runner-up
        if best[2] >= 0.92 and (best[2] - second[2] >= 0.04):
            best_rows.append((r["espn_id"], best[0], best[1], best[2], "fuzzy_name_dob"))
        else:
            best_rows.append((r["espn_id"], best[0], best[1], best[2], "needs_review"))

    best_df = pd.DataFrame(best_rows, columns=["espn_id","sleeper_id_fuzzy","sleeper_name_fuzzy","fuzzy_score","fuzzy_method"])

    out = exact.merge(best_df, on="espn_id", how="left")

    # fill in fuzzy matches where exact missing
    use_fuzzy = (out["matched"] == False) & (out["fuzzy_method"] == "fuzzy_name_dob")
    out.loc[use_fuzzy, "sleeper_id"] = out.loc[use_fuzzy, "sleeper_id_fuzzy"]
    out.loc[use_fuzzy, "sleeper_name"] = out.loc[use_fuzzy, "sleeper_name_fuzzy"]
    out.loc[use_fuzzy, "match_method"] = "fuzzy_name_dob"
    out.loc[use_fuzzy, "matched"] = True

    # outputs
    all_out = OUT_DIR / "espn_active_x_sleeper_all.csv"
    matched_out = OUT_DIR / "espn_active_x_sleeper_matched.csv"
    review_out = OUT_DIR / "espn_active_x_sleeper_needs_review.csv"
    missing_out = OUT_DIR / "espn_active_x_sleeper_unmatched.csv"

    out.to_csv(all_out, index=False)

    matched = out[out["matched"]].copy()
    matched.to_csv(matched_out, index=False)

    needs_review = out[(out["matched"] == False) & (out["fuzzy_method"] == "needs_review")].copy()
    needs_review.to_csv(review_out, index=False)

    truly_missing = out[(out["matched"] == False) & ((out["fuzzy_method"] == "") | out["espn_dob_ymd"].eq(""))].copy()
    truly_missing.to_csv(missing_out, index=False)

    print("=== ESPN ACTIVE ↔ SLEEPER MATCH ===")
    print("ESPN active rows:", len(e))
    print("Matched:", len(matched))
    print("Needs review:", len(needs_review))
    print("Unmatched (no safe fuzzy):", len(truly_missing))
    print("Wrote:", all_out)
    print("Wrote:", matched_out)
    print("Wrote:", review_out)
    print("Wrote:", missing_out)

if __name__ == "__main__":
    main()
