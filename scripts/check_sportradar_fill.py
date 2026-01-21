import csv
import sys
from pathlib import Path

csv.field_size_limit(sys.maxsize)

path = Path("data_raw/master/players_master_nflverse_espn_sleeper.csv")

try:
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        total = 0
        filled = 0
        for row in reader:
            total += 1
            if row.get("sleeper_sportradar_id"):
                filled += 1
        
    print(f"Total: {total}")
    print(f"Filled: {filled}")
    print(f"Fill Rate: {filled/total*100:.2f}%")
except Exception as e:
    print(f"Error: {e}")
