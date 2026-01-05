from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data_raw" / "master"
OUTPUT_DIR = ROOT / "public" / "data" / "player_stats"
PLAYER_IDS_PATH = ROOT / "public" / "data" / "player_ids.json"
PLAYERS_PATH = ROOT / "public" / "data" / "players.json"
SLEEPER_PLAYERS_PATH = ROOT / "data_raw" / "sleeper" / "players_flat.csv"


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def find_source(basenames: list[str], search_dirs: list[Path] | None = None) -> Path | None:
    dirs = search_dirs or [DATA_DIR]
    for base in basenames:
        for ext in (".csv", ".parquet"):
            for directory in dirs:
                path = directory / f"{base}{ext}"
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


def filter_regular_season_rows(df: pd.DataFrame) -> pd.DataFrame:
    if "season_type" not in df.columns:
        return df
    season_type = df["season_type"].astype(str).str.upper()
    return df[season_type.isin({"REG", "REGULAR", "REGULAR_SEASON"}) | season_type.str.contains("REG")]


def build_id_maps():
    if not PLAYER_IDS_PATH.exists():
        return {}
    payload = read_json(PLAYER_IDS_PATH)
    by_uid: dict[str, dict[str, str]] = {}
    for entry in payload:
        uid = entry.get("player_uid")
        id_type = entry.get("id_type")
        id_value = entry.get("id_value")
        if not uid or not id_type or not id_value:
            continue
        by_uid.setdefault(uid, {})[id_type] = str(id_value)
    gsis_to_sleeper = {}
    for uid, ids in by_uid.items():
        gsis = ids.get("gsis")
        sleeper = ids.get("sleeper")
        if gsis and sleeper:
            gsis_to_sleeper[gsis] = sleeper
    name_to_sleeper = {}
    if PLAYERS_PATH.exists():
        players = read_json(PLAYERS_PATH)
        for player in players:
            uid = player.get("player_uid")
            name = player.get("full_name")
            if not uid or not name:
                continue
            sleeper = by_uid.get(uid, {}).get("sleeper")
            if not sleeper:
                continue
            key = normalize_name(name)
            if key and key not in name_to_sleeper:
                name_to_sleeper[key] = sleeper
    if SLEEPER_PLAYERS_PATH.exists():
        sleeper_df = pd.read_csv(SLEEPER_PLAYERS_PATH)
        for _, row in sleeper_df.iterrows():
            sleeper_id = row.get("player_id")
            if pd.isna(sleeper_id):
                continue
            name = row.get("full_name")
            if not name or pd.isna(name):
                first = row.get("first_name")
                last = row.get("last_name")
                if isinstance(first, str) and isinstance(last, str):
                    name = f"{first} {last}".strip()
            key = normalize_name(name)
            if key and key not in name_to_sleeper:
                name_to_sleeper[key] = str(sleeper_id)
    return {
        "gsis_to_sleeper": gsis_to_sleeper,
        "name_to_sleeper": name_to_sleeper,
    }


def attach_ids(df: pd.DataFrame, id_maps: dict) -> pd.DataFrame:
    df = df.copy()
    if "gsis_id" not in df.columns and "player_id" in df.columns:
        df["gsis_id"] = df["player_id"]
    if "gsis_id" not in df.columns:
        df["gsis_id"] = None
    gsis_to_sleeper = id_maps.get("gsis_to_sleeper", {})
    if "sleeper_id" in df.columns:
        df["sleeper_id"] = df["sleeper_id"].where(df["sleeper_id"].notna(), df["gsis_id"].map(gsis_to_sleeper))
    else:
        df["sleeper_id"] = df["gsis_id"].map(gsis_to_sleeper)
    name_to_sleeper = id_maps.get("name_to_sleeper", {})
    name_col = pick_first_column(df, ["display_name", "player_display_name", "player_name"])
    if name_col:
        resolved = df[name_col].apply(lambda value: name_to_sleeper.get(normalize_name(value)))
        df["sleeper_id"] = df["sleeper_id"].where(df["sleeper_id"].notna(), resolved)
    df["player_id"] = df["sleeper_id"].where(df["sleeper_id"].notna(), df["gsis_id"])
    for col in ("sleeper_id", "gsis_id", "player_id"):
        if col in df.columns:
            df[col] = df[col].apply(normalize_id_value)
    return df


def normalize_id_value(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def normalize_name(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value).strip().lower()
    if not text:
        return ""
    cleaned = []
    for ch in text:
        if ch.isalnum() or ch.isspace():
            cleaned.append(ch)
    return " ".join("".join(cleaned).split())


def build_weekly(weekly: pd.DataFrame):
    weekly = filter_regular_season(weekly)
    name_col = pick_first_column(weekly, ["display_name", "player_display_name", "player_name"])
    position_col = pick_first_column(weekly, ["position", "position_group"])
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
    war_col = pick_first_column(weekly, ["war_rep_week_all", "war_rep_week_starters", "war_rep"]) or "war_rep"
    delta_col = pick_first_column(
        weekly, ["delta_to_next_week_all", "delta_to_next_week_starters", "delta_to_next"]
    ) or "delta_to_next"

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
    if position_col:
        weekly["position"] = weekly[position_col].astype(str).str.upper()
    else:
        weekly["position"] = "—"
    if team_col and team_col in weekly.columns:
        weekly["team"] = weekly[team_col].fillna("—")
    else:
        weekly["team"] = "—"
    weekly["points"] = pd.to_numeric(weekly[points_col], errors="coerce").fillna(0.0) if points_col else 0.0
    weekly["war_rep"] = pd.to_numeric(weekly.get(war_col), errors="coerce")
    weekly["delta_to_next"] = pd.to_numeric(weekly.get(delta_col), errors="coerce")

    fields = [
        "season",
        "week",
        "display_name",
        "position",
        "team",
        "points",
        "war_rep",
        "delta_to_next",
        "pos_week_z",
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
    return seasons


def build_full_stats(weekly: pd.DataFrame):
    weekly = filter_regular_season(weekly)
    name_col = pick_first_column(weekly, ["display_name", "player_display_name", "player_name"])
    position_col = pick_first_column(weekly, ["position", "position_group"])
    team_col = pick_first_column(weekly, ["team", "recent_team", "nfl_team"]) or "team"
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
    if position_col:
        weekly["position"] = weekly[position_col].astype(str).str.upper()
    else:
        weekly["position"] = "—"
    if team_col and team_col in weekly.columns:
        weekly["team"] = weekly[team_col].fillna("—")
    else:
        weekly["team"] = "—"
    if "attempts" not in weekly.columns and "passing_attempts" in weekly.columns:
        weekly["attempts"] = weekly["passing_attempts"]
    if "completions" not in weekly.columns and "passing_completions" in weekly.columns:
        weekly["completions"] = weekly["passing_completions"]
    if "carries" not in weekly.columns and "rushing_attempts" in weekly.columns:
        weekly["carries"] = weekly["rushing_attempts"]
    if "targets" not in weekly.columns and "receiving_targets" in weekly.columns:
        weekly["targets"] = weekly["receiving_targets"]
    if "opponent_team" not in weekly.columns:
        for alt in ("opponent", "opponent_team", "opp_team"):
            if alt in weekly.columns:
                weekly["opponent_team"] = weekly[alt]
                break
    if "rushing_fumbles_lost" not in weekly.columns and "fumbles_lost" in weekly.columns:
        weekly["rushing_fumbles_lost"] = weekly["fumbles_lost"]
    if "receiving_fumbles_lost" not in weekly.columns and "fumbles_lost" in weekly.columns:
        weekly["receiving_fumbles_lost"] = weekly["fumbles_lost"]
    if "fantasy_points_ppr" not in weekly.columns and "fantasy_points" in weekly.columns:
        weekly["fantasy_points_ppr"] = weekly["fantasy_points"]
    fields = [
        "season",
        "week",
        "display_name",
        "position",
        "team",
        "opponent_team",
        "attempts",
        "completions",
        "passing_yards",
        "passing_tds",
        "passing_interceptions",
        "passing_rating",
        "passing_qbr",
        "passing_2pt_conversions",
        "carries",
        "rushing_yards",
        "rushing_tds",
        "rushing_2pt_conversions",
        "receptions",
        "targets",
        "receiving_yards",
        "receiving_tds",
        "receiving_2pt_conversions",
        "rushing_fumbles_lost",
        "receiving_fumbles_lost",
        "sack_fumbles_lost",
        "extra_points_attempted",
        "extra_points_made",
        "field_goals_attempted",
        "field_goals_made",
        "field_goals_attempted_0_19",
        "field_goals_attempted_20_29",
        "field_goals_attempted_30_39",
        "field_goals_attempted_40_49",
        "field_goals_attempted_50_plus",
        "field_goals_made_0_19",
        "field_goals_made_20_29",
        "field_goals_made_30_39",
        "field_goals_made_40_49",
        "field_goals_made_50_plus",
        "fantasy_points",
        "fantasy_points_ppr",
        "fantasy_points_custom_week",
        "fantasy_points_custom_week_with_bonus",
        "pos_week_z",
        "war_rep",
        "delta_to_next",
        "sleeper_id",
        "gsis_id",
        "player_id",
    ]
    fields = [field for field in fields if field in weekly.columns]
    seasons = sorted(weekly["season"].dropna().unique().astype(int).tolist())
    for season in seasons:
        season_rows = weekly[weekly["season"] == season].copy()
        season_rows = season_rows.sort_values(["week"], ascending=[True])
        write_json(
            OUTPUT_DIR / "full" / f"{season}.json",
            {"season": int(season), "rows": season_rows[fields].to_dict(orient="records")},
        )


def build_season(season_df: pd.DataFrame, expected_games: dict[int, int] | None = None):
    season_df = season_df.copy()
    season_df["season"] = pd.to_numeric(season_df.get("season"), errors="coerce")
    season_df = season_df.dropna(subset=["season"])
    season_df = filter_regular_season_rows(season_df)

    expected_games = expected_games or {}
    if "games" in season_df.columns:
        season_df["games_possible"] = season_df["season"].apply(
            lambda season: int(expected_games.get(int(season), 17))
        )
        season_df["games_missed"] = (season_df["games_possible"] - season_df["games"]).clip(lower=0)
        season_df["availability_ratio"] = (
            season_df["games"] / season_df["games_possible"].where(season_df["games_possible"] > 0, 1)
        )
        season_df["availability_flag"] = season_df["availability_ratio"].apply(
            lambda value: "limited" if value < 0.7 else "full"
        )

    fields = [
        "season",
        "display_name",
        "position",
        "team",
        "games",
        "games_possible",
        "games_missed",
        "availability_ratio",
        "availability_flag",
        "fantasy_points_custom",
        "fantasy_points_custom_pg",
        "war_rep",
        "war_rep_pg",
        "delta_to_next",
        "delta_to_next_pg",
        "sleeper_id",
        "gsis_id",
        "player_id",
    ]
    fields = [field for field in fields if field in season_df.columns]
    seasons = sorted(season_df["season"].dropna().unique().astype(int).tolist())
    for season in seasons:
        rows = season_df[season_df["season"] == season].copy()
        write_json(
            OUTPUT_DIR / "season" / f"{season}.json",
            {"season": int(season), "rows": rows[fields].to_dict(orient="records")},
        )


def build_career(career_df: pd.DataFrame):
    fields = [
        "display_name",
        "position",
        "games",
        "seasons",
        "fantasy_points_custom",
        "fantasy_points_custom_pg",
        "war_rep",
        "war_rep_pg",
        "delta_to_next",
        "delta_to_next_pg",
        "sleeper_id",
        "gsis_id",
        "player_id",
    ]
    fields = [field for field in fields if field in career_df.columns]
    write_json(OUTPUT_DIR / "career.json", {"rows": career_df[fields].to_dict(orient="records")})


def main() -> None:
    weekly_source = find_source(["player_week_fantasy_2015_2025_with_war"])
    season_source = find_source(["player_season_fantasy_2015_2025_with_war"])
    career_source = find_source(["player_career_fantasy_2015_2025_with_war"])
    full_stats_source = find_source(
        [
            "player_stats_2015_2025_players_only",
            "player_stats_2015_2025_with_master",
        ],
        search_dirs=[DATA_DIR, ROOT / "data_raw" / "nflverse_stats"],
    )

    if not weekly_source:
        if full_stats_source:
            print("No weekly fantasy WAR source found in data_raw/master. Building full stats only.")
            id_maps = build_id_maps()
            full_stats = read_table(full_stats_source)
            full_stats = attach_ids(full_stats, id_maps)
            build_full_stats(full_stats)
        else:
            print("No weekly fantasy WAR source found in data_raw/master. Skipping player stats export.")
        return

    weekly = read_table(weekly_source)
    id_maps = build_id_maps()
    weekly = attach_ids(weekly, id_maps)
    seasons = build_weekly(weekly)
    expected_games = (
        weekly.groupby("season")["week"].max().dropna().astype(int).to_dict()
        if "season" in weekly.columns and "week" in weekly.columns
        else {}
    )
    if full_stats_source:
        full_stats = read_table(full_stats_source)
        full_stats = attach_ids(full_stats, id_maps)
        build_full_stats(full_stats)
    else:
        build_full_stats(weekly)

    if season_source:
        season_df = read_table(season_source)
    else:
        season_df = weekly.groupby(["player_id", "season"], as_index=False).agg(
            display_name=("display_name", "first"),
            position=("position", "first"),
            team=("team", "first"),
            games=("week", "nunique"),
            fantasy_points_custom=("points", "sum"),
            fantasy_points_custom_pg=("points", "mean"),
            war_rep=("war_rep", "sum"),
            war_rep_pg=("war_rep", "mean"),
            delta_to_next=("delta_to_next", "sum"),
            delta_to_next_pg=("delta_to_next", "mean"),
            sleeper_id=("sleeper_id", "first"),
            gsis_id=("gsis_id", "first"),
        )
    season_df = attach_ids(season_df, id_maps)
    build_season(season_df, expected_games)

    if career_source:
        career_df = read_table(career_source)
    else:
        career_df = season_df.groupby("player_id", as_index=False).agg(
            display_name=("display_name", "first"),
            position=("position", "first"),
            games=("games", "sum"),
            seasons=("season", "nunique"),
            fantasy_points_custom=("fantasy_points_custom", "sum"),
            fantasy_points_custom_pg=("fantasy_points_custom", "mean"),
            war_rep=("war_rep", "sum"),
            war_rep_pg=("war_rep", "mean"),
            delta_to_next=("delta_to_next", "sum"),
            delta_to_next_pg=("delta_to_next", "mean"),
            sleeper_id=("sleeper_id", "first"),
            gsis_id=("gsis_id", "first"),
        )
    career_df = attach_ids(career_df, id_maps)
    build_career(career_df)

    summary = {"generatedAt": datetime.now(timezone.utc).isoformat(), "seasons": seasons}
    write_json(OUTPUT_DIR / "summary.json", summary)

    print("=== PLAYER STATS EXPORTED ===")
    print("Weekly source:", weekly_source)
    if season_source:
        print("Season source:", season_source)
    if career_source:
        print("Career source:", career_source)


if __name__ == "__main__":
    main()
