#!/usr/bin/env python3
import json
import pandas as pd
from pathlib import Path
import logging

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

ROOT = Path(__file__).resolve().parents[1]
DATA_RAW = ROOT / "data_raw"
PUBLIC_DATA = ROOT / "public" / "data"

REGISTRY_PATH = PUBLIC_DATA / "player_registry.json"
NFLVERSE_PLAYERS_PATH = DATA_RAW / "nflverse_players.parquet"
STADIA_STATS_PATH = DATA_RAW / "nflverse_stats" / "player_stats_2015_2025.parquet"

SPORT_RADAR_DIR = DATA_RAW / "sportradar"
SPORT_RADAR_TEAMS = SPORT_RADAR_DIR / "teams"
SPORT_RADAR_ODDS = SPORT_RADAR_DIR / "odds"
SPORT_RADAR_HIERARCHY = SPORT_RADAR_DIR / "hierarchy.json"

OUTPUT_PATH = PUBLIC_DATA / "nfl_mega_profiles.json"
OUTPUT_PROFILES_DIR = PUBLIC_DATA / "nfl_profiles"
OUTPUT_STANDINGS_PATH = PUBLIC_DATA / "nfl_standings.json"

def normalize_name(name):
    if not name: return ""
    return str(name).lower().replace(".", "").replace(" ", "").replace("'","").replace("-","").strip()

def load_sportradar_data():
    if not SPORT_RADAR_TEAMS.exists():
        logging.warning(f"Sportradar teams dir not found at {SPORT_RADAR_TEAMS}")
        return {}, {}
    
    sr_map = {} # sr_id -> profile
    sr_lookup = {} # norm_name_pos -> sr_id (Fuzzy)
    
    files = list(SPORT_RADAR_TEAMS.glob("*_roster.json"))
    logging.info(f"Loading {len(files)} Sportradar roster files...")
    
    for p in files:
        with open(p, "r") as f:
            data = json.load(f)
            players = data.get("players", [])
            for player in players:
                sr_id = player.get("id")
                if not sr_id: continue
                player["_team_id"] = data.get("id")
                player["_team_alias"] = data.get("alias")
                sr_map[sr_id] = player
                name = player.get("name")
                pos = player.get("position")
                if name and pos:
                    key = f"{normalize_name(name)}_{pos}"
                    sr_lookup[key] = sr_id
                    
    return sr_map, sr_lookup

def load_sportradar_odds():
    odds_map = {} # game_id -> odds_data
    if not SPORT_RADAR_ODDS.exists():
        return odds_map
    files = list(SPORT_RADAR_ODDS.glob("*_odds.json"))
    for p in files:
        with open(p, "r") as f:
            data = json.load(f)
            gid = p.name.split("_")[0]
            odds_map[gid] = data
    return odds_map

def load_registry():
    if not REGISTRY_PATH.exists():
        logging.error(f"Registry not found at {REGISTRY_PATH}")
        return {}
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data.get("registry", {})

def load_nflverse_players():
    if not NFLVERSE_PLAYERS_PATH.exists():
        logging.error(f"NFLVerse players not found at {NFLVERSE_PLAYERS_PATH}")
        return pd.DataFrame()
    return pd.read_parquet(NFLVERSE_PLAYERS_PATH)

def load_nflverse_stats():
    if not STADIA_STATS_PATH.exists():
        logging.error(f"NFLVerse stats not found at {STADIA_STATS_PATH}")
        return pd.DataFrame()
    logging.info(f"Loading stats from {STADIA_STATS_PATH}...")
    return pd.read_parquet(STADIA_STATS_PATH)

def main():
    logging.info("Building NFL Silo (Mega Profiles + Odds + Standings)...")
    
    registry = load_registry()
    nfl_players = load_nflverse_players()
    nfl_stats = load_nflverse_stats()
    sr_map, sr_lookup = load_sportradar_data()
    sr_odds = load_sportradar_odds()
    
    # 1. Build NFLVerse Bio Lookups
    nfl_lookup_gsis = {}
    nfl_lookup_sleeper = {}
    nfl_lookup_espn = {}
    
    records = nfl_players.to_dict(orient="records")
    for row in records:
        gsis, sleeper, espn = row.get("gsis_id"), row.get("sleeper_id"), row.get("espn_id")
        clean_row = {k: (v if pd.notna(v) else None) for k, v in row.items()}
        if gsis: nfl_lookup_gsis[str(gsis)] = clean_row
        if sleeper: nfl_lookup_sleeper[str(sleeper)] = clean_row
        if espn: nfl_lookup_espn[str(int(float(espn)))] = clean_row

    # 2. Build Stats Lookup
    stats_map = {}
    if not nfl_stats.empty:
        logging.info("Processing Game Stats...")
        nfl_stats = nfl_stats.where(pd.notnull(nfl_stats), None)
        for pid, group in nfl_stats.groupby("player_id"):
            stats_map[str(pid)] = group.to_dict(orient="records")

    # 3. Build Mega Profiles
    mega_profiles = {}
    match_count_nfl, match_count_sr = 0, 0
    total_registry = len(registry)
    
    for canonical_id, reg_entry in registry.items():
        identifiers = reg_entry.get("identifiers", {})
        gsis_id, sleeper_id, espn_id = identifiers.get("gsis_id"), identifiers.get("sleeper_id"), identifiers.get("espn_id")
        
        nfl_data, sr_data, player_games = None, None, []
        matched_gsis = None
        
        if gsis_id and str(gsis_id) in nfl_lookup_gsis:
            matched_gsis = str(gsis_id)
            nfl_data = nfl_lookup_gsis[matched_gsis]
        elif sleeper_id and str(sleeper_id) in nfl_lookup_sleeper:
            nfl_data = nfl_lookup_sleeper[str(sleeper_id)]
            matched_gsis = nfl_data.get("gsis_id")
        elif espn_id and str(espn_id) in nfl_lookup_espn:
            nfl_data = nfl_lookup_espn[str(espn_id)]
            matched_gsis = nfl_data.get("gsis_id")
            
        if matched_gsis and matched_gsis in stats_map:
            player_games = stats_map[matched_gsis]
            
        name, pos = reg_entry.get("name"), reg_entry.get("position")
        if name and pos:
            key = f"{normalize_name(name)}_{pos}"
            if key in sr_lookup:
                sr_id = sr_lookup[key]
                sr_data = sr_map.get(sr_id)
        
        profile = {
            "id": canonical_id,
            "fantasy": reg_entry, 
            "nfl": {
                "bio": nfl_data if nfl_data else {},
                "stats": player_games,
                "sportradar": sr_data if sr_data else {}
            }
        }
        if nfl_data: match_count_nfl += 1
        if sr_data: match_count_sr += 1
        mega_profiles[canonical_id] = profile

    # Write Profiles
    logging.info(f"Writing mega profiles to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(mega_profiles, f, indent=2)

    # Shard Profiles
    logging.info(f"Sharding mega profiles to {OUTPUT_PROFILES_DIR}...")
    OUTPUT_PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    
    # Clean old shards to prevent clutter if IDs change
    # (Optional: might be slow, let's just overwrite for now)
    
    for pid, profile in mega_profiles.items():
        profile_path = OUTPUT_PROFILES_DIR / f"{pid}.json"
        with open(profile_path, "w", encoding="utf-8") as f:
            json.dump(profile, f, indent=2)

    # 4. Standalone NFL Silo Data (Odds + Hierarchy)
    silo_agg = {
        "odds": sr_odds,
        "league": {}
    }
    if SPORT_RADAR_HIERARCHY.exists():
        with open(SPORT_RADAR_HIERARCHY, "r") as f:
            silo_agg["league"] = json.load(f)
            
    with open(PUBLIC_DATA / "nfl_silo_meta.json", "w") as f:
        json.dump(silo_agg, f, indent=2)

    logging.info(f"Done. Mega profiles and NFL Silo meta updated.")

if __name__ == "__main__":
    main()
