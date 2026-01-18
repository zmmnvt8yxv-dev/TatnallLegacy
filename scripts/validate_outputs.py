#!/usr/bin/env python3
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "public" / "data"

def read_json(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def check_value(val, path_str, context=""):
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
    data = read_json(path)
    if not check_value(data, str(path)): return False
    
    rows = data.get("rows", [])
    if not rows and "weekly" in str(path):
        print(f"[WARN] {path}: No stats rows")
    
    return True

def main():
    print("Running Output Validation...")
    success = True
    
    # 1. Check Registry
    registry_path = PUBLIC_DATA / "player_registry.json"
    if not registry_path.exists():
        print("[FAIL] Missing player_registry.json")
        success = False
    else:
        reg = read_json(registry_path)
        if not reg.get("registry"):
            print("[FAIL] Empty player registry")
            success = False
            
    # 2. Check Seasons
    for p in PUBLIC_DATA.glob("season/*.json"):
        if not validate_season_file(p.stem):
            success = False
            
    # 3. Check Stats
    for p in PUBLIC_DATA.glob("player_stats/season/*.json"):
        if not validate_stats_file(p):
            success = False
            
    for p in PUBLIC_DATA.glob("player_stats/weekly/*.json"):
        if not validate_stats_file(p):
            success = False

    if success:
        print("Validation Passed.")
        sys.exit(0)
    else:
        print("Validation Failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
