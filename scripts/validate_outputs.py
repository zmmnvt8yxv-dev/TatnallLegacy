#!/usr/bin/env python3
"""
TatnallLegacy Data Validation Suite
Ensures data integrity and prevents regressions in the "Golden Record"
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "public" / "data"
MANUAL_HISTORY = ROOT / "data" / "manual_league_history.json"

def read_json(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def check_value(val, path_str, context=""):
    """Recursively check for NaN/Infinity values"""
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            print(f"[FAIL] {path_str}: Invalid float {val} in {context}")
            return False
    if isinstance(val, dict):
        return all(check_value(v, path_str, f"{context}.{k}") for k, v in val.items())
    if isinstance(val, list):
        return all(check_value(v, path_str, f"{context}[{i}]") for i, v in enumerate(val))
    return True

def validate_season_file(season):
    """Validate season JSON structure"""
    path = PUBLIC_DATA / "season" / f"{season}.json"
    if not path.exists():
        print(f"[WARN] Missing season data: {season}")
        return True
    
    data = read_json(path)
    if not check_value(data, str(path)): return False
    
    if not data.get("teams"):
        print(f"[FAIL] {path}: No teams found")
        return False
    
    if not data.get("weeks"):
        print(f"[FAIL] {path}: No weeks found")
        return False
        
    return True

def validate_stats_file(path):
    """Validate player stats file"""
    data = read_json(path)
    if not check_value(data, str(path)): return False
    
    rows = data.get("rows", [])
    if not rows and "weekly" in str(path):
        print(f"[WARN] {path}: No stats rows")
    
    return True

def validate_playoff_weeks(season_int, data):
    """Check that playoff weeks exist and are populated"""
    weeks = data.get("weeks", [])
    
    # weeks is a list of week objects, check we have enough weeks
    # Determine expected max week based on season
    if season_int >= 2021:
        expected_max_week = 17
    else:
        expected_max_week = 16
    
    if len(weeks) < expected_max_week:
        print(f"[WARN] Season {season_int}: Only {len(weeks)} weeks, expected {expected_max_week}")
    
    # Check playoff weeks have matchups (weeks list is 0-indexed, so week 15 is index 14)
    if season_int >= 2021:
        playoff_indices = [14, 15, 16]  # Weeks 15, 16, 17
    else:
        playoff_indices = [13, 14, 15]  # Weeks 14, 15, 16
    
    for idx in playoff_indices:
        if idx < len(weeks):
            week_data = weeks[idx]
            if isinstance(week_data, dict) and not week_data.get("matchups"):
                print(f"[WARN] Season {season_int}: Week {idx+1} has no matchups")
    
    return True

def validate_kilt_bowl(season_int, data):
    """Validate Kilt Bowl series completeness"""
    kilt_bowl = data.get("kilt_bowl")
    if not kilt_bowl:
        # Kilt Bowl may not exist for all seasons
        return True
    
    games = kilt_bowl.get("games", [])
    if len(games) < 2:
        print(f"[WARN] Season {season_int}: Kilt Bowl has fewer than 2 games")
    
    # Check series winner is set
    if not kilt_bowl.get("series_winner"):
        print(f"[FAIL] Season {season_int}: Kilt Bowl missing series_winner")
        return False
    
    return True

def validate_golden_record():
    """Cross-check season data against manual_league_history.json (authoritative)"""
    if not MANUAL_HISTORY.exists():
        print("[WARN] manual_league_history.json not found, skipping Golden Record validation")
        return True
    
    history = read_json(MANUAL_HISTORY)
    seasons_dict = history.get("seasons", {})
    success = True
    
    # seasons is a dict with year as key (e.g., "2025": {...})
    for season_str, season_entry in seasons_dict.items():
        if not isinstance(season_entry, dict):
            continue
            
        expected_champion = season_entry.get("champion")
        expected_kilt_loser = season_entry.get("kilt_bowl_loser")
        
        season_path = PUBLIC_DATA / "season" / f"{season_str}.json"
        if not season_path.exists():
            continue
        
        season_data = read_json(season_path)
        
        # Check champion matches
        actual_champion_raw = season_data.get("champion")
        actual_champion = None
        if isinstance(actual_champion_raw, dict):
            actual_champion = actual_champion_raw.get("team") or actual_champion_raw.get("owner")
        elif isinstance(actual_champion_raw, str):
            actual_champion = actual_champion_raw
            
        if expected_champion and actual_champion:
            # Normalize for comparison (could be team name or owner name)
            if expected_champion.lower() not in actual_champion.lower() and \
               actual_champion.lower() not in expected_champion.lower():
                print(f"[FAIL] Season {season_str}: Champion mismatch!")
                print(f"       Expected: {expected_champion}")
                print(f"       Actual:   {actual_champion}")
                success = False
        
        # Check Kilt Bowl loser matches
        kilt_bowl = season_data.get("kilt_bowl") or season_data.get("kiltBowl", {})
        actual_loser = None
        if isinstance(kilt_bowl, dict):
            actual_loser = kilt_bowl.get("series_loser")
        if expected_kilt_loser and actual_loser:
            if expected_kilt_loser.lower() not in actual_loser.lower() and \
               actual_loser.lower() not in expected_kilt_loser.lower():
                print(f"[WARN] Season {season_str}: Kilt Bowl loser mismatch")
                print(f"       Expected: {expected_kilt_loser}")
                print(f"       Actual:   {actual_loser}")
    
    return success

def main():
    print("=" * 50)
    print("TatnallLegacy Data Validation Suite")
    print("=" * 50)
    success = True
    
    # 1. Check Registry
    print("\n[1/5] Checking player registry...")
    registry_path = PUBLIC_DATA / "player_registry.json"
    if not registry_path.exists():
        print("[FAIL] Missing player_registry.json")
        success = False
    else:
        reg = read_json(registry_path)
        if not reg.get("registry"):
            print("[FAIL] Empty player registry")
            success = False
        else:
            print(f"      Found {len(reg['registry'])} players")
            
    # 2. Check Seasons (basic structure)
    print("\n[2/5] Validating season files...")
    for p in sorted(PUBLIC_DATA.glob("season/*.json")):
        if not validate_season_file(p.stem):
            success = False
            
    # 3. Check Playoff Weeks
    print("\n[3/5] Checking playoff week coverage...")
    for p in sorted(PUBLIC_DATA.glob("season/*.json")):
        try:
            season_int = int(p.stem)
            data = read_json(p)
            if not validate_playoff_weeks(season_int, data):
                success = False
            if not validate_kilt_bowl(season_int, data):
                success = False
        except ValueError:
            pass
            
    # 4. Check Stats
    print("\n[4/5] Validating player stats...")
    for p in PUBLIC_DATA.glob("player_stats/season/*.json"):
        if not validate_stats_file(p):
            success = False
            
    for p in PUBLIC_DATA.glob("player_stats/weekly/*.json"):
        if not validate_stats_file(p):
            success = False

    # 5. Golden Record Cross-Check
    print("\n[5/5] Validating Golden Record (manual_league_history.json)...")
    if not validate_golden_record():
        success = False

    print("\n" + "=" * 50)
    if success:
        print("✅ Validation Passed.")
        sys.exit(0)
    else:
        print("❌ Validation Failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
