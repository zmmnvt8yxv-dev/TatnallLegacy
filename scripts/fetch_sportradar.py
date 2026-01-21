#!/usr/bin/env python3
import json
import time
import logging
from pathlib import Path
import requests

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

ROOT = Path(__file__).resolve().parents[1]
SECRETS_PATH = ROOT / "sportradar_secrets.json"
DATA_RAW_SR = ROOT / "data_raw" / "sportradar"
DATA_RAW_SR_TEAMS = DATA_RAW_SR / "teams"
DATA_RAW_SR_ODDS = DATA_RAW_SR / "odds"
DATA_RAW_SR_TEAMS.mkdir(parents=True, exist_ok=True)
DATA_RAW_SR_ODDS.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://api.sportradar.us/nfl/official/trial/v7/en"
# Market Odds API might have a different base URL usually
ODDS_BASE_URL = "https://api.sportradar.us/oddscomparison-nfl/trial/v2/en"

def load_keys():
    if not SECRETS_PATH.exists():
        logging.error(f"Secrets file not found at {SECRETS_PATH}")
        return None
    try:
        with open(SECRETS_PATH, "r") as f:
            data = json.load(f)
            return data
    except Exception as e:
        logging.error(f"Error loading secrets: {e}")
        return None

def fetch_json(url, api_key):
    try:
        final_url = f"{url}?api_key={api_key}"
        # logging.info(f"Fetching {url}...") 
        response = requests.get(final_url)
        response.raise_for_status()
        time.sleep(1.2) # Rate limit (1 request per second for trial)
        return response.json()
    except Exception as e:
        logging.error(f"Request failed: {e}")
        return None

def main():
    keys = load_keys()
    if not keys:
        return

    nfl_key = keys.get("nfl_api_key")
    if not nfl_key or "YOUR_" in nfl_key:
        logging.error("Invalid or missing 'nfl_api_key' in secrets file.")
        return

    # 1. Fetch League Hierarchy to get Team IDs
    logging.info("Fetching League Hierarchy...")
    hierarchy_url = f"{BASE_URL}/league/hierarchy.json"
    hierarchy = fetch_json(hierarchy_url, nfl_key)
    
    if not hierarchy:
        logging.error("Failed to fetch hierarchy. Aborting.")
        return
    
    # Save Hierarchy
    with open(DATA_RAW_SR / "hierarchy.json", "w") as f:
        json.dump(hierarchy, f, indent=2)

    # Extract Team IDs
    team_ids = []
    for conf in hierarchy.get("conferences", []):
        for div in conf.get("divisions", []):
            for team in div.get("teams", []):
                team_ids.append({
                    "id": team["id"],
                    "name": team["name"],
                    "alias": team.get("alias")
                })
    
    logging.info(f"Found {len(team_ids)} teams. Fetching rosters...")
    
    # 2. Fetch Roster for each Team
    for i, team in enumerate(team_ids):
        tid = team["id"]
        tname = team["name"]
        outfile = DATA_RAW_SR_TEAMS / f"{tid}_roster.json"
        
        if outfile.exists():
            # Optional: Skip if exists? For now, let's overwrite to be fresh.
            pass
            
        logging.info(f"[{i+1}/{len(team_ids)}] Fetching roster for {tname}...")
        roster_url = f"{BASE_URL}/teams/{tid}/full_roster.json"
        roster_data = fetch_json(roster_url, nfl_key)
        
        if roster_data:
            with open(outfile, "w") as f:
                json.dump(roster_data, f, indent=2)
        else:
            logging.warning(f"Failed to fetch roster for {tname}")

    logging.info("Sportradar roster fetch complete.")

    # 3. Fetch Odds (Optional but requested)
    odds_key = keys.get("odds_api_key")
    if odds_key and "YOUR_" not in odds_key:
        logging.info("Starting Sportradar Odds Fetch...")
        # Get Schedule for 2025 to find game IDs
        schedule_url = f"{BASE_URL}/games/2025/REG/schedule.json"
        schedule = fetch_json(schedule_url, nfl_key)
        
        if schedule:
            game_ids = []
            for week in schedule.get("weeks", []):
                for game in week.get("games", []):
                    game_ids.append(game.get("id"))
            
            logging.info(f"Found {len(game_ids)} games. Fetching odds for first 10 (Trial limit)...")
            # For trial, we might be limited. Let's just do a few or active games.
            for i, gid in enumerate(game_ids[:10]):
                logging.info(f"[{i+1}/10] Fetching odds for game {gid}...")
                odds_url = f"{ODDS_BASE_URL}/games/{gid}/odds.json"
                # Note: Odds comparison API might have different endpoint.
                # Trial docs often use /games/{id}/odds.json
                odds_data = fetch_json(odds_url, odds_key)
                if odds_data:
                    with open(DATA_RAW_SR_ODDS / f"{gid}_odds.json", "w") as f:
                        json.dump(odds_data, f, indent=2)
                else:
                    logging.warning(f"Failed to fetch odds for game {gid}")
        else:
            logging.error("Failed to fetch schedule for odds.")

    logging.info("Sportradar full fetch complete.")
