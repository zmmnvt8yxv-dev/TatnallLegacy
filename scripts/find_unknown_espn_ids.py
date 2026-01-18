import json
import csv
from pathlib import Path

ROOT = Path(".")
LINEUPS_DIR = ROOT / "data_raw/espn_lineups"
SLEEPER_MAP = ROOT / "data_raw/verify/espn_active_x_sleeper_xwalk.csv"
OUT_CSV = ROOT / "data_raw/verify/espn_ids_missing_from_lineups.csv"

def load_known_ids():
    known = set()
    if SLEEPER_MAP.exists():
        with open(SLEEPER_MAP, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                eid = row.get("espn_id")
                if eid:
                    known.add(str(eid).strip())
    return known

def scan_lineups():
    all_espn_ids = set()
    usage = {} # id -> count

    for path in LINEUPS_DIR.rglob("week-*.json"):
        try:
            data = json.loads(path.read_text())
            lineups = data.get("lineups", [])
            for lineup in lineups:
                pid = str(lineup.get("player_id", "")).strip()
                if pid and pid.isdigit(): # Basic check for ESPN ID
                     all_espn_ids.add(pid)
                     usage[pid] = usage.get(pid, 0) + 1
        except Exception as e:
            print(f"Error reading {path}: {e}")
            
    return all_espn_ids, usage

def main():
    print("Loading known IDs...")
    known = load_known_ids()
    print(f"Found {len(known)} known ESPN IDs.")

    print("Scanning lineups for ESPN IDs...")
    found, usage = scan_lineups()
    print(f"Found {len(found)} unique ESPN IDs in lineups.")

    missing = []
    for pid in found:
        if pid not in known:
            missing.append(pid)
    
    print(f"Found {len(missing)} IDs missing from our map.")

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["espn_id", "frequency"])
        for pid in missing:
            writer.writerow([pid, usage.get(pid, 0)])
    
    print(f"Wrote missing IDs to {OUT_CSV}")

if __name__ == "__main__":
    main()
