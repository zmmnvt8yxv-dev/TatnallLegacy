from pathlib import Path
import pandas as pd

WEEKLY_IN = Path("data_raw/master/player_week_fantasy_2015_2025.parquet")
BONUS_IN  = Path("data_raw/master/player_week_td_bonus.parquet")
OUTDIR    = Path("data_raw/master")
OUTDIR.mkdir(parents=True, exist_ok=True)

WEEKLY_OUT_PARQ = OUTDIR / "player_week_fantasy_2015_2025_with_td_bonus.parquet"
WEEKLY_OUT_CSV  = OUTDIR / "player_week_fantasy_2015_2025_with_td_bonus.csv"

def main():
    w = pd.read_parquet(WEEKLY_IN)
    b = pd.read_parquet(BONUS_IN)

    # Ensure join keys exist
    for c in ["season","week","gsis_id"]:
        if c not in w.columns:
            raise SystemExit(f"Weekly missing {c}")
        if c not in b.columns:
            raise SystemExit(f"Bonus missing {c}")

    # Defensive: ensure td_bonus_total exists
    if "td_bonus_total" not in b.columns:
        bonus_cols = [c for c in b.columns if c.endswith("_bonus")]
        b["td_bonus_total"] = b[bonus_cols].sum(axis=1)

    # Left join bonuses into weekly
    j = w.merge(b, on=["season","week","gsis_id"], how="left", suffixes=("","_bonus"))

    # Fill missing bonus values with 0
    bonus_fill = ["td_bonus_total",
                  "pass_td_40_bonus","pass_td_50_bonus",
                  "rush_td_40_bonus","rush_td_50_bonus",
                  "rec_td_40_bonus","rec_td_50_bonus"]
    for c in bonus_fill:
        if c in j.columns:
            j[c] = j[c].fillna(0).astype("int64")

    # Apply to weekly fantasy points
    if "fantasy_points_custom_week" not in j.columns:
        raise SystemExit("Weekly file does not have fantasy_points_custom_week (expected).")

    j["fantasy_points_custom_week_with_bonus"] = (
        j["fantasy_points_custom_week"] + j["td_bonus_total"]
    )

    # Optional: keep a simpler alias column name if you want to “replace” the original
    # j["fantasy_points_custom_week"] = j["fantasy_points_custom_week_with_bonus"]

    j.to_parquet(WEEKLY_OUT_PARQ, index=False)
    j.to_csv(WEEKLY_OUT_CSV, index=False)

    print("=== WEEKLY TD BONUS APPLIED ===")
    print("Rows:", len(j), "Cols:", len(j.columns))
    print("Wrote:", WEEKLY_OUT_PARQ)
    print("Wrote:", WEEKLY_OUT_CSV)
    print("Nonzero td_bonus_total rows:", int((j["td_bonus_total"] > 0).sum()))
    print("Max td_bonus_total in a week:", int(j["td_bonus_total"].max()))

if __name__ == "__main__":
    main()
