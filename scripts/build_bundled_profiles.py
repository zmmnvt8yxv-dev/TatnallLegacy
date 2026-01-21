#!/usr/bin/env python3
"""
Build a single bundled player profiles file from the player registry.
This approach avoids the issues with individual files and Git LFS.

The bundled file is loaded once by the frontend and profiles are
looked up by player ID from memory.
"""
import json
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "public" / "data"

REGISTRY_PATH = PUBLIC_DATA / "player_registry.json"
OUTPUT_PATH = PUBLIC_DATA / "player_profiles_bundle.json"


def load_registry():
    """Load the player registry."""
    if not REGISTRY_PATH.exists():
        logging.error(f"Registry not found at {REGISTRY_PATH}")
        return {}
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data.get("registry", {})


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
    import re
    match = re.match(r"(\d+)'(\d+)\"?", height_str)
    if match:
        feet, inches = int(match.group(1)), int(match.group(2))
        total_inches = feet * 12 + inches
        return total_inches, f"{feet}'{inches}\""

    return None, None


def safe_int(val):
    """Safely convert to int."""
    if not val:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def build_profile(canonical_id, reg_entry):
    """Build a profile from registry data."""
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

    # Clean up None values in bio
    bio = {k: v for k, v in bio.items() if v is not None}

    return {
        "id": canonical_id,
        "fantasy": reg_entry,
        "nfl": {
            "bio": bio,
            "stats": [],  # Would need nflverse data
            "sportradar": {}  # Would need Sportradar API
        }
    }


def main():
    logging.info("Building bundled player profiles...")

    registry = load_registry()
    if not registry:
        logging.error("No registry data found. Exiting.")
        return

    logging.info(f"Processing {len(registry)} players from registry...")

    # Build profiles
    profiles = {}
    for canonical_id, reg_entry in registry.items():
        profiles[canonical_id] = build_profile(canonical_id, reg_entry)

    # Write bundled file (minified for smaller size)
    logging.info(f"Writing bundled profiles to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "version": "1.0.0",
            "count": len(profiles),
            "profiles": profiles
        }, f, separators=(',', ':'))

    # Report file size
    size_mb = OUTPUT_PATH.stat().st_size / (1024 * 1024)
    logging.info(f"Done. Bundled {len(profiles)} profiles into {size_mb:.2f} MB file.")


if __name__ == "__main__":
    main()
