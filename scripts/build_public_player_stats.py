from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data_raw" / "master"
OUTPUT_DIR = ROOT / "public" / "data" / "player_stats"
SEARCH_PATH = ROOT / "public" / "data" / "player_search.json"
REGISTRY_PATH = ROOT / "public" / "data" / "player_registry.json"


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


# --- REGISTRY HELPERS --- #

def normalize_string(value):
    if not value or pd.isna(value):
        return ""
    text = str(value).lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    return " ".join(text.split())

def load_registry():
    if not REGISTRY_PATH.exists():
        raise FileNotFoundError(f"Registry not found at {REGISTRY_PATH}. Run build_player_registry.py first.")
    
    data = read_json(REGISTRY_PATH)
    registry = data.get("registry", {})
    indices = data.get("indices", {})
    
    # Ensure indices exist
    for key in ["sleeper", "espn", "gsis"]:
        if key not in indices:
            indices[key] = {}
            
    # Rebuild name index
    name_index = {} 
    for cid, entry in registry.items():
        name = entry.get("name")
        if name:
            norm = normalize_string(name)
            if norm:
                name_index[norm] = cid
    indices["name"] = name_index
            
    return registry, indices

def resolve_player(registry, indices, source_id, source_name=None):
    canonical_id = None
    source_id_str = str(source_id).strip() if source_id and not pd.isna(source_id) else ""
    
    if source_id_str:
        if source_id_str in indices["sleeper"]:
            canonical_id = indices["sleeper"][source_id_str]
        elif source_id_str in indices["espn"]:
            canonical_id = indices["espn"][source_id_str]
        elif source_id_str in indices["gsis"]:
            canonical_id = indices["gsis"][source_id_str]
            
    if not canonical_id and source_name and not pd.isna(source_name):
        norm = normalize_string(source_name)
        if norm and norm in indices["name"]:
            canonical_id = indices["name"][norm]
            
    if canonical_id and canonical_id in registry:
        return canonical_id, registry[canonical_id]
        
    return None, None

# ------------------------ #

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


def attach_ids(df: pd.DataFrame, registry_data) -> pd.DataFrame:
    """
    Enriches DataFrame with canonical IDs from registry.
    """
    df = df.copy()
    registry, indices = registry_data

    # Helper for apply
    def row_mapper(row):
        # Specific coercion for common ID keys
        def clean_id(val):
            if val is None or pd.isna(val) or str(val).lower() in ("nan", "none", ""):
                return None
            return str(val).strip()

        # Candidates for lookup
        candidates = []
        for col in ["sleeper_id", "gsis_id", "espn_id", "player_id"]:
            if col in row:
                c = clean_id(row[col])
                if c: candidates.append(c)
        
        name_col = pick_first_column(pd.DataFrame([row]), ["display_name", "player_display_name", "player_name", "name"])
        name = row[name_col] if name_col and not pd.isna(row[name_col]) else None
        
        cid = None
        entry = None
        
        # Try IDs first
        for cand in candidates:
            cid, entry = resolve_player(registry, indices, cand)
            if cid: break
            
        # Try name
        if not cid:
            cid, entry = resolve_player(registry, indices, None, name)
            
        if cid and entry:
            return pd.Series({
                "player_id": cid,
                "sleeper_id": clean_id(entry["identifiers"]["sleeper_id"]),
                "gsis_id": clean_id(entry["identifiers"]["gsis_id"]),
                "display_name": entry["name"]
            })
        
        # Return originals if no match (but cleaned!)
        return pd.Series({
            "player_id": clean_id(row.get("player_id")),
            "sleeper_id": clean_id(row.get("sleeper_id")),
            "gsis_id": clean_id(row.get("gsis_id")),
            "display_name": name or "Unknown"
        })

    # This might be slow for massive DF, but robust
    print(f"Resolving IDs for {len(df)} rows...")
    resolved = df.apply(row_mapper, axis=1)
    
    # Update columns
    df["player_id"] = resolved["player_id"]
    df["sleeper_id"] = resolved["sleeper_id"]
    df["gsis_id"] = resolved["gsis_id"]
    # We update display_name effectively via registry
    name_col = pick_first_column(df, ["display_name", "player_display_name", "player_name"])
    if name_col:
        df[name_col] = resolved["display_name"]
    else:
        df["display_name"] = resolved["display_name"]

    return df


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
        
    # Field standardization
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


def build_player_search(full_stats: pd.DataFrame):
    name_col = pick_first_column(full_stats, ["display_name", "player_display_name", "player_name"])
    position_col = pick_first_column(full_stats, ["position", "position_group"])
    team_col = pick_first_column(full_stats, ["team", "recent_team", "nfl_team"])
    if name_col:
        full_stats["display_name"] = full_stats[name_col].fillna("Unknown")
    else:
        full_stats["display_name"] = "Unknown"

    if position_col:
        full_stats["position"] = full_stats[position_col].astype(str).str.upper()
    else:
        full_stats["position"] = "—"
    if team_col and team_col in full_stats.columns:
        full_stats["team"] = full_stats[team_col].fillna("—")
    else:
        full_stats["team"] = "—"

    records = {}
    for row in full_stats.itertuples(index=False):
        name = getattr(row, "display_name", None)
        if not name or name == "Unknown":
            continue
        sleeper_id = getattr(row, "sleeper_id", None)
        gsis_id = getattr(row, "gsis_id", None)
        player_id = getattr(row, "player_id", None)
        
        # Determine ID
        pid = None
        itype = None
        if sleeper_id and not pd.isna(sleeper_id):
            pid = str(sleeper_id)
            itype = "sleeper"
        elif gsis_id and not pd.isna(gsis_id):
            pid = str(gsis_id)
            itype = "gsis"
        elif player_id and not pd.isna(player_id):
            pid = str(player_id)
            itype = "player_id"
            
        if not pid: continue
        
        if pid not in records:
            records[pid] = {
                "id": pid,
                "id_type": itype,
                "name": name,
                "position": getattr(row, "position", "—"),
                "team": getattr(row, "team", "—")
            }
        else:
             # update pos/team if we have better data
             curr = records[pid]
             if curr["position"] == "—": curr["position"] = getattr(row, "position", "—")
             if curr["team"] == "—": curr["team"] = getattr(row, "team", "—")

    rows = sorted(records.values(), key=lambda item: item["name"])
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "rows": rows,
    }
    write_json(SEARCH_PATH, payload)


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
    print("Loading registry...")
    registry_data = load_registry()
    print("Registry loaded.")

    weekly_source = find_source(["player_week_fantasy_2015_2025_with_war"])
    season_source = find_source(["player_season_fantasy_2015_2025_with_war"])
    career_source = find_source(["player_career_fantasy_2015_2025_with_war"])
    full_stats_source = find_source(
        [
            "player_stats_2015_2025_players_only",
            "player_stats_2015_2025_with_master",
            "player_stats_2015_2025",
        ],
        search_dirs=[DATA_DIR, ROOT / "data_raw" / "nflverse_stats"],
    )

    if not weekly_source:
        if full_stats_source:
            print("No weekly fantasy WAR source found in data_raw/master. Building full stats only.")
            full_stats = read_table(full_stats_source)
            full_stats = attach_ids(full_stats, registry_data)
            build_full_stats(full_stats)
            build_player_search(full_stats)
        else:
            print("No weekly fantasy WAR source found in data_raw/master. Skipping player stats export.")
        return

    print("Processing Weekly Stats...")
    weekly = read_table(weekly_source)
    weekly = attach_ids(weekly, registry_data)
    seasons = build_weekly(weekly)
    
    expected_games = (
        weekly.groupby("season")["week"].max().dropna().astype(int).to_dict()
        if "season" in weekly.columns and "week" in weekly.columns
        else {}
    )
    
    if full_stats_source:
        print("Processing Full Stats...")
        full_stats = read_table(full_stats_source)
        full_stats = attach_ids(full_stats, registry_data)
        build_full_stats(full_stats)
        build_player_search(full_stats)
    else:
        build_full_stats(weekly)
        build_player_search(weekly)

    if season_source:
        print("Processing Season Stats...")
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
    season_df = attach_ids(season_df, registry_data)
    build_season(season_df, expected_games)

    if career_source:
        print("Processing Career Stats...")
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
    career_df = attach_ids(career_df, registry_data)
    build_career(career_df)

    summary = {"generatedAt": datetime.now(timezone.utc).isoformat(), "seasons": seasons}
    write_json(OUTPUT_DIR / "summary.json", summary)

    print("=== PLAYER STATS EXPORTED ===")


if __name__ == "__main__":
    main()
