from __future__ import annotations

import json
from datetime import datetime, timezone
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


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


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
        return pd.read_parquet(path)
    return pd.read_csv(path)


def pick_first_column(df: pd.DataFrame, options: list[str]) -> str | None:
    for name in options:
        if name in df.columns:
            return name
    return None


def filter_regular_season(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["week"] = pd.to_numeric(df.get("week"), errors="coerce")
    df["season"] = pd.to_numeric(df.get("season"), errors="coerce")
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


def main() -> None:
    weekly_source = find_source(
        [
            "player_week_fantasy_2015_2025_with_war",
            "player_week_fantasy_2015_2025_with_z",
            "player_week_fantasy_2015_2025_with_td_bonus",
            "player_week_fantasy_2015_2025",
        ]
    )

    if not weekly_source:
        print("No weekly fantasy source found in data_raw/master. Skipping player metrics export.")
        return

    weekly = read_table(weekly_source)
    weekly = filter_regular_season(weekly)

    name_col = pick_first_column(weekly, ["display_name", "player_display_name", "player_name"]) or "display_name"
    position_col = pick_first_column(weekly, ["position", "position_group"]) or "position"
    team_col = pick_first_column(weekly, ["team", "recent_team", "nfl_team"]) or "team"
    points_col = pick_first_column(
        weekly,
        [
            "fantasy_points_custom_week_with_bonus",
            "fantasy_points_custom_week",
            "fantasy_points_custom",
            "fantasy_points",
        ],
    )

    if not points_col:
        raise SystemExit("No weekly fantasy points column found for player metrics export.")

    weekly["points"] = pd.to_numeric(weekly[points_col], errors="coerce").fillna(0.0)
    weekly["position"] = weekly[position_col].astype(str).str.upper()
    weekly["display_name"] = weekly[name_col].fillna("Unknown")
    weekly["team"] = weekly.get(team_col).fillna("—")

    weekly = add_war_and_delta(weekly, "points")

    id_key = pick_first_column(weekly, ["sleeper_id", "gsis_id", "player_id"]) or "player_id"

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
    fields = [field for field in fields if field in weekly.columns]

    seasons = sorted(weekly["season"].dropna().unique().astype(int).tolist())
    for season in seasons:
        season_rows = weekly[weekly["season"] == season].copy()
        season_rows = season_rows.sort_values(["week", "points"], ascending=[True, False])
        write_json(
            OUTPUT_DIR / "weekly" / f"{season}.json",
            {"season": int(season), "rows": season_rows[fields].to_dict(orient="records")},
        )

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
        boom_fields = [
            "season",
            "display_name",
            "position",
            "team",
            "points",
            "games",
            "fp_std",
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

    print("=== PLAYER METRICS EXPORTED ===")
    print("Weekly source:", weekly_source)
    print("Seasons:", seasons)


if __name__ == "__main__":
    main()
