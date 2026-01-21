#!/usr/bin/env python3
"""
Build a single bundled player profiles file from the player registry,
enhanced with NFLverse data (draft info, headshots, etc.).

The bundled file is loaded once by the frontend and profiles are
looked up by player ID from memory.
"""
import csv
import io
import json
import re
import urllib.request
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "public" / "data"

REGISTRY_PATH = PUBLIC_DATA / "player_registry.json"
OUTPUT_PATH = PUBLIC_DATA / "player_profiles_bundle.json"

# NFLverse public data URL
NFLVERSE_PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"


def load_registry():
    """Load the player registry."""
    if not REGISTRY_PATH.exists():
        logging.error(f"Registry not found at {REGISTRY_PATH}")
        return {}
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data.get("registry", {})


def fetch_nflverse_players():
    """Fetch NFLverse player data with draft info and headshots."""
    logging.info(f"Fetching NFLverse player data from {NFLVERSE_PLAYERS_URL}...")
    try:
        req = urllib.request.Request(
            NFLVERSE_PLAYERS_URL,
            headers={"User-Agent": "TatnallLegacy/1.0"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            content = resp.read().decode("utf-8")
            reader = csv.DictReader(io.StringIO(content))
            players = list(reader)
            logging.info(f"Loaded {len(players)} players from NFLverse")
            return players
    except Exception as e:
        logging.warning(f"Failed to fetch NFLverse data: {e}")
        return []


def build_nflverse_lookups(nflverse_players):
    """Build lookup tables by various IDs."""
    by_gsis = {}
    by_sleeper = {}
    by_espn = {}

    for player in nflverse_players:
        gsis_id = player.get("gsis_id")
        sleeper_id = player.get("sleeper_id")
        espn_id = player.get("espn_id")

        if gsis_id:
            by_gsis[str(gsis_id)] = player
        if sleeper_id:
            by_sleeper[str(sleeper_id)] = player
        if espn_id:
            try:
                by_espn[str(int(float(espn_id)))] = player
            except (ValueError, TypeError):
                pass

    return by_gsis, by_sleeper, by_espn


def parse_height(height_val):
    """Parse height from various formats to inches."""
    if not height_val:
        return None, None

    height_str = str(height_val).strip()

    # Already in inches (numeric)
    try:
        h = int(float(height_str))
        if h > 0:
            return h, f"{h // 12}'{h % 12}\""
    except (ValueError, TypeError):
        pass

    # Format like 5'10" or 5'10
    match = re.match(r"(\d+)'(\d+)\"?", height_str)
    if match:
        feet, inches = int(match.group(1)), int(match.group(2))
        total_inches = feet * 12 + inches
        return total_inches, f"{feet}'{inches}\""

    return None, None


def safe_int(val):
    """Safely convert to int."""
    if not val or val == "NA" or val == "":
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def safe_str(val):
    """Return string or None if empty/NA."""
    if not val or val == "NA" or val == "":
        return None
    return str(val)


def build_profile(canonical_id, reg_entry, nfl_data):
    """Build a profile from registry data, enhanced with NFLverse data."""
    height_inches, height_display = parse_height(reg_entry.get("height"))

    # Build bio from registry data
    bio = {
        "display_name": reg_entry.get("name"),
        "position": reg_entry.get("position"),
        "latest_team": reg_entry.get("team") or None,
        "height": height_inches,
        "height_display": height_display,
        "weight": safe_int(reg_entry.get("weight")),
        "college_name": reg_entry.get("college"),
        "years_of_experience": safe_int(reg_entry.get("years_exp")),
        "birth_date": reg_entry.get("birth_date") or None,
        "gsis_id": reg_entry.get("identifiers", {}).get("gsis_id"),
        "status": "Active" if reg_entry.get("team") else None,
    }

    # Enhance with NFLverse data if available
    if nfl_data:
        # Draft info
        draft_year = safe_int(nfl_data.get("draft_year"))
        draft_round = safe_int(nfl_data.get("draft_round"))
        draft_pick = safe_int(nfl_data.get("draft_pick"))
        draft_team = safe_str(nfl_data.get("draft_club"))

        if draft_year:
            bio["draft_year"] = draft_year
        if draft_round:
            bio["draft_round"] = draft_round
        if draft_pick:
            bio["draft_pick"] = draft_pick
        if draft_team:
            bio["draft_team"] = draft_team

        # Headshot URL
        headshot = safe_str(nfl_data.get("headshot"))
        if headshot:
            bio["headshot"] = headshot

        # Additional info from NFLverse
        if not bio.get("display_name"):
            bio["display_name"] = safe_str(nfl_data.get("display_name"))
        if not bio.get("position"):
            bio["position"] = safe_str(nfl_data.get("position"))
        if not bio.get("latest_team"):
            bio["latest_team"] = safe_str(nfl_data.get("team_abbr"))
        if not bio.get("college_name"):
            bio["college_name"] = safe_str(nfl_data.get("college"))
        if not bio.get("height"):
            bio["height"] = safe_int(nfl_data.get("height"))
        if not bio.get("weight"):
            bio["weight"] = safe_int(nfl_data.get("weight"))
        if not bio.get("birth_date"):
            bio["birth_date"] = safe_str(nfl_data.get("birth_date"))
        if not bio.get("gsis_id"):
            bio["gsis_id"] = safe_str(nfl_data.get("gsis_id"))

        # Status from NFLverse
        nfl_status = safe_str(nfl_data.get("status"))
        if nfl_status:
            bio["status"] = nfl_status

        # Jersey number
        jersey = safe_int(nfl_data.get("jersey_number"))
        if jersey:
            bio["jersey_number"] = jersey

        # Entry year (rookie year)
        entry_year = safe_int(nfl_data.get("entry_year"))
        if entry_year:
            bio["entry_year"] = entry_year

        # Rookie year
        rookie_year = safe_int(nfl_data.get("rookie_year"))
        if rookie_year:
            bio["rookie_year"] = rookie_year

    # Clean up None values in bio
    bio = {k: v for k, v in bio.items() if v is not None}

    return {
        "id": canonical_id,
        "fantasy": reg_entry,
        "nfl": {
            "bio": bio,
            "stats": [],
            "sportradar": {}
        }
    }


def main():
    logging.info("Building bundled player profiles...")

    registry = load_registry()
    if not registry:
        logging.error("No registry data found. Exiting.")
        return

    logging.info(f"Processing {len(registry)} players from registry...")

    # Fetch NFLverse data
    nflverse_players = fetch_nflverse_players()
    by_gsis, by_sleeper, by_espn = build_nflverse_lookups(nflverse_players)

    # Build profiles
    profiles = {}
    matched_count = 0

    for canonical_id, reg_entry in registry.items():
        identifiers = reg_entry.get("identifiers", {})
        gsis_id = identifiers.get("gsis_id")
        sleeper_id = identifiers.get("sleeper_id")
        espn_id = identifiers.get("espn_id")

        # Try to find NFLverse data by various IDs
        nfl_data = None
        if gsis_id and str(gsis_id) in by_gsis:
            nfl_data = by_gsis[str(gsis_id)]
        elif sleeper_id and str(sleeper_id) in by_sleeper:
            nfl_data = by_sleeper[str(sleeper_id)]
        elif espn_id:
            try:
                espn_key = str(int(float(espn_id)))
                if espn_key in by_espn:
                    nfl_data = by_espn[espn_key]
            except (ValueError, TypeError):
                pass

        if nfl_data:
            matched_count += 1

        profiles[canonical_id] = build_profile(canonical_id, reg_entry, nfl_data)

    logging.info(f"Matched {matched_count}/{len(registry)} players with NFLverse data")

    # Write bundled file (minified for smaller size)
    logging.info(f"Writing bundled profiles to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "version": "1.1.0",
            "count": len(profiles),
            "profiles": profiles
        }, f, separators=(',', ':'))

    # Report file size
    size_mb = OUTPUT_PATH.stat().st_size / (1024 * 1024)
    logging.info(f"Done. Bundled {len(profiles)} profiles into {size_mb:.2f} MB file.")


if __name__ == "__main__":
    main()
