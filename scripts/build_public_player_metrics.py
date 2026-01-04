from __future__ import annotations

import json
from datetime import datetime, timezone
import argparse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data_raw" / "master"
OUTPUT_DIR = ROOT / "public" / "data" / "player_metrics"

STARTER_CUTOFF = {
    "QB": 16,   # 8 teams * 2 QB
    "RB": 24,   # 8 teams * 3 RB
    "WR": 24,   # 8 teams * 3 WR
    "TE": 16,   # 8 teams * 2 TE
    "K": 8,
    "DEF": 8,
}


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def find_source(basenames: list[str]) -> Path | None:
    for base in basenames:
        for ext in (".parquet", ".csv"):
            path = DATA_DIR / f"{base}{ext}"
            if path.exists():
                return path
    return None


def read_table(path: Path) -> pd.DataFrame:
    if path.suffix == ".parquet":
        try:
            return pd.read_parquet(path)
        except Exception:
            csv_path = path.with_suffix(".csv")
            if csv_path.exists():
                return pd.read_csv(csv_path)
            raise
    return pd.read_csv(path)


def pick_first_column(df: pd.DataFrame, options: list[str]) -> str | None:
    for name in options:
        if name in df.columns:
            return name
    return None


def filter_regular_season(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "week" not in df.columns or "season" not in df.columns:
        return df.iloc[0:0]
    df["week"] = pd.to_numeric(df["week"], errors="coerce")
    df["season"] = pd.to_numeric(df["season"], errors="coerce")
    df = df[df["week"].between(1, 18)]
    if "season_type" in df.columns:
        season_type = df["season_type"].astype(str).str.upper()
        df = df[season_type.isin({"REG", "REGULAR", "REGULAR_SEASON"}) | season_type.str.contains("REG")]
    return df.dropna(subset=["season", "week"])


def add_war_and_delta(df: pd.DataFrame, points_col: str) -> pd.DataFrame:
    rows = []
    grouped = df.groupby(["season", "week", "position"], dropna=False)
    for (_, _, position), group in grouped:
        group = group.sort_values(points_col, ascending=False).copy()
        group["pos_rank"] = range(1, len(group) + 1)
        group["next_points"] = group[points_col].shift(-1)
        group["delta_to_next"] = (group[points_col] - group["next_points"]).fillna(0.0)

        cutoff = STARTER_CUTOFF.get(str(position).upper())
        if cutoff:
            idx = min(cutoff - 1, len(group) - 1)
            baseline = float(group.iloc[idx][points_col])
            group["replacement_baseline"] = baseline
            group["war_rep"] = group[points_col] - baseline
        else:
            group["replacement_baseline"] = None
            group["war_rep"] = 0.0
        rows.append(group)
    return pd.concat(rows, ignore_index=True)


def add_consistency_labels(df: pd.DataFrame, std_col: str = "fp_std") -> pd.DataFrame:
    if std_col not in df.columns:
        df["consistency_label"] = None
        df["consistency_score"] = None
        return df
    df = df.copy()
    df[std_col] = pd.to_numeric(df[std_col], errors="coerce")
    df["consistency_score"] = None
    df["consistency_label"] = None
    grouped = df.groupby("position", dropna=False) if "position" in df.columns else [(None, df)]
    for _, group in grouped:
        values = group[std_col].dropna()
        if values.empty:
            continue
        q33 = values.quantile(0.33)
        q66 = values.quantile(0.66)
        ranks = group[std_col].rank(pct=True, ascending=True)
        df.loc[group.index, "consistency_score"] = (1 - ranks).round(3)
        df.loc[group.index, "consistency_label"] = group[std_col].apply(
            lambda val: "High" if val <= q33 else "Medium" if val <= q66 else "Low"
        )
    return df


def normalize_weekly(weekly: pd.DataFrame):
    if "season" not in weekly.columns or "week" not in weekly.columns:
        missing = [name for name in ("season", "week") if name not in weekly.columns]
        return None, missing, {}
    weekly = filter_regular_season(weekly)
    if weekly.empty:
        return weekly, [], {}

    name_col = pick_first_column(weekly, ["display_name", "player_display_name", "player_name"])
    position_col = pick_first_column(weekly, ["position", "position_group"])
    team_col = pick_first_column(weekly, ["team", "recent_team", "nfl_team"])
    points_col = pick_first_column(
        weekly,
        [
            "fantasy_points_custom_week_with_bonus",
            "fantasy_points_custom_week",
            "fantasy_points_custom",
            "fantasy_points",
            "points",
            "fantasy_points_ppr",
        ],
    )
    if not points_col:
        return None, ["points"], {
            "name_col": name_col,
            "position_col": position_col,
            "team_col": team_col,
        }

    weekly["points"] = pd.to_numeric(weekly[points_col], errors="coerce").fillna(0.0)
    if position_col:
        weekly["position"] = weekly[position_col].astype(str).str.upper()
    else:
        weekly["position"] = "—"
    if name_col:
        weekly["display_name"] = weekly[name_col].fillna("Unknown")
    elif "first_name" in weekly.columns or "last_name" in weekly.columns:
        weekly["display_name"] = (
            weekly.get("first_name", "").fillna("").astype(str).str.strip()
            + " "
            + weekly.get("last_name", "").fillna("").astype(str).str.strip()
        ).str.strip()
        weekly.loc[weekly["display_name"] == "", "display_name"] = "Unknown"
    else:
        weekly["display_name"] = "Unknown"
    if team_col and team_col in weekly.columns:
        weekly["team"] = weekly[team_col].fillna("—")
    else:
        weekly["team"] = "—"

    weekly = add_war_and_delta(weekly, "points")
    id_key = pick_first_column(weekly, ["sleeper_id", "gsis_id", "player_id"]) or "display_name"
    return weekly, [], {
        "id_key": id_key,
        "name_col": name_col,
        "position_col": position_col,
        "team_col": team_col,
        "points_col": points_col,
    }


def log_skipped(label: str, reason: str):
    print(f"SKIPPED: {label} ({reason})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="Fail if any expected output is skipped.")
    args = parser.parse_args()

    missing_required_outputs = []

    weekly_source = find_source(
        [
            "player_week_fantasy_2015_2025_with_war",
            "player_week_fantasy_2015_2025_with_z",
            "player_week_fantasy_2015_2025_with_td_bonus",
            "player_week_fantasy_2015_2025",
        ]
    )

    weekly = None
    season_agg = None
    fields = None
    seasons = []

    if not weekly_source:
        log_skipped("player_metrics/weekly.json", "missing weekly source")
        log_skipped("player_metrics/season.json", "missing weekly source")
        log_skipped("player_metrics/career.json", "missing weekly source")
        log_skipped("player_metrics/summary.json", "missing weekly source")
        missing_required_outputs.extend(
            [
                "player_metrics/weekly.json",
                "player_metrics/season.json",
                "player_metrics/career.json",
                "player_metrics/summary.json",
            ]
        )
        boom_bust_source = find_source(["player_season_boom_bust_2015_2025"])
        if not boom_bust_source:
            log_skipped("player_metrics/boom_bust.json", "missing boom/bust source")
        if args.strict and missing_required_outputs:
            raise SystemExit(1)
        return

    weekly = read_table(weekly_source)
    weekly, missing_weekly, weekly_meta = normalize_weekly(weekly)
    if missing_weekly:
        reason = f"missing columns {missing_weekly}"
        log_skipped("player_metrics/weekly.json", reason)
        log_skipped("player_metrics/season.json", reason)
        log_skipped("player_metrics/career.json", reason)
        log_skipped("player_metrics/summary.json", reason)
        missing_required_outputs.extend(
            [
                "player_metrics/weekly.json",
                "player_metrics/season.json",
                "player_metrics/career.json",
                "player_metrics/summary.json",
            ]
        )
        if args.strict and missing_required_outputs:
            raise SystemExit(1)
        weekly = None
    if weekly is not None and weekly.empty:
        reason = "no regular-season rows after filtering"
        log_skipped("player_metrics/weekly.json", reason)
        log_skipped("player_metrics/season.json", reason)
        log_skipped("player_metrics/career.json", reason)
        log_skipped("player_metrics/summary.json", reason)
        missing_required_outputs.extend(
            [
                "player_metrics/weekly.json",
                "player_metrics/season.json",
                "player_metrics/career.json",
                "player_metrics/summary.json",
            ]
        )
        if args.strict and missing_required_outputs:
            raise SystemExit(1)
        weekly = None

    fields = [
        "season",
        "week",
        "display_name",
        "position",
        "team",
        "points",
        "war_rep",
        "delta_to_next",
        "replacement_baseline",
        "pos_week_z",
        "pos_week_percentile",
        "sleeper_id",
        "gsis_id",
        "player_id",
    ]

    if weekly is not None:
        fields = [field for field in fields if field in weekly.columns]
        seasons = sorted(weekly["season"].dropna().unique().astype(int).tolist())
        for season in seasons:
            season_rows = weekly[weekly["season"] == season].copy()
            season_rows = season_rows.sort_values(["week", "points"], ascending=[True, False])
            write_json(
                OUTPUT_DIR / "weekly" / f"{season}.json",
                {"season": int(season), "rows": season_rows[fields].to_dict(orient="records")},
            )

        id_key = weekly_meta.get("id_key", "display_name")
        season_agg = (
            weekly.groupby([id_key, "season"], as_index=False)
            .agg(
                display_name=("display_name", "first"),
                position=("position", "first"),
                team=("team", "first"),
                games=("week", "nunique"),
                points=("points", "sum"),
                points_pg=("points", "mean"),
                war_rep=("war_rep", "sum"),
                war_rep_pg=("war_rep", "mean"),
                delta_to_next=("delta_to_next", "sum"),
                delta_to_next_pg=("delta_to_next", "mean"),
            )
        )
        for season in seasons:
            season_rows = season_agg[season_agg["season"] == season].copy()
            write_json(
                OUTPUT_DIR / "season" / f"{season}.json",
                {"season": int(season), "rows": season_rows.to_dict(orient="records")},
            )

        career = (
            season_agg.groupby(id_key, as_index=False)
            .agg(
                display_name=("display_name", "first"),
                position=("position", "first"),
                team=("team", "first"),
                seasons=("season", "nunique"),
                games=("games", "sum"),
                points=("points", "sum"),
                points_pg=("points", "mean"),
                war_rep=("war_rep", "sum"),
                war_rep_pg=("war_rep", "mean"),
                delta_to_next=("delta_to_next", "sum"),
                delta_to_next_pg=("delta_to_next", "mean"),
            )
        )
        write_json(OUTPUT_DIR / "career.json", {"rows": career.to_dict(orient="records")})

    boom_bust_source = find_source(["player_season_boom_bust_2015_2025"])
    if boom_bust_source:
        boom_bust = read_table(boom_bust_source)
        boom_bust = boom_bust.rename(columns={"fp_total": "points"})
        name_col = pick_first_column(boom_bust, ["display_name", "player_display_name", "player_name"])
        if name_col:
            boom_bust["display_name"] = boom_bust[name_col].fillna("Unknown")
        elif "first_name" in boom_bust.columns or "last_name" in boom_bust.columns:
            boom_bust["display_name"] = (
                boom_bust.get("first_name", "").fillna("").astype(str).str.strip()
                + " "
                + boom_bust.get("last_name", "").fillna("").astype(str).str.strip()
            ).str.strip()
            boom_bust.loc[boom_bust["display_name"] == "", "display_name"] = "Unknown"
        else:
            boom_bust["display_name"] = "Unknown"

        if "points" not in boom_bust.columns:
            log_skipped("player_metrics/boom_bust.json", "missing points")
        elif "season" not in boom_bust.columns:
            log_skipped("player_metrics/boom_bust.json", "missing season")
        else:
            boom_bust = add_consistency_labels(boom_bust, "fp_std")
            boom_fields = [
                "season",
                "display_name",
                "position",
                "team",
                "points",
                "games",
                "fp_std",
                "consistency_score",
                "consistency_label",
                "boom_weeks",
                "bust_weeks",
                "boom_pct",
                "bust_pct",
                "sleeper_id",
                "gsis_id",
                "player_id",
            ]
            boom_fields = [field for field in boom_fields if field in boom_bust.columns]
            write_json(OUTPUT_DIR / "boom_bust.json", {"rows": boom_bust[boom_fields].to_dict(orient="records")})
    else:
        log_skipped("player_metrics/boom_bust.json", "missing boom/bust source")

    if weekly is not None and season_agg is not None:
        summary = {"generatedAt": datetime.now(timezone.utc).isoformat()}
        summary["topWeeklyWar"] = (
            weekly.sort_values("war_rep", ascending=False)
            .head(10)[fields]
            .to_dict(orient="records")
        )
        if "pos_week_z" in weekly.columns:
            summary["topWeeklyZ"] = (
                weekly.sort_values("pos_week_z", ascending=False)
                .head(10)[fields]
                .to_dict(orient="records")
            )
        else:
            summary["topWeeklyZ"] = []
        summary["topSeasonWar"] = (
            season_agg.sort_values("war_rep", ascending=False)
            .head(10)
            .to_dict(orient="records")
        )
        write_json(OUTPUT_DIR / "summary.json", summary)
    else:
        log_skipped("player_metrics/summary.json", "missing weekly or season aggregates")
        missing_required_outputs.append("player_metrics/summary.json")

    if args.strict and missing_required_outputs:
        raise SystemExit(1)

    if weekly is not None:
        print("=== PLAYER METRICS EXPORTED ===")
        print("Weekly source:", weekly_source)
        print("Seasons:", seasons)


if __name__ == "__main__":
    main()
