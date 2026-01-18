import json
from pathlib import Path
import pandas as pd

ATHLAB_DIR = Path("data_raw/espn_core/athletes")
ATH_ID_DIR = Path("data_raw/espn_core/athletes_by_id")
OUT_DIR = Path("data_raw/verify")
OUT_DIR.mkdir(parents=True, exist_ok=True)

rows = []
seen_ids = set()

def process_file(p):
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return

    # ESPN Core structure usually wrapped in "athlete" or sometimes raw
    athlete = d.get("athlete") or d.get("data") or d

    if not isinstance(athlete, dict):
        return
    
    eid = athlete.get("id") or athlete.get("playerId")
    if not eid:
        return
        
    if eid in seen_ids:
        return
    seen_ids.add(eid)

    rows.append({
        "espn_id": eid,
        "uid": athlete.get("uid"),
        "guid": athlete.get("guid"),
        "fullName": athlete.get("fullName") or athlete.get("displayName"),
        "displayName": athlete.get("displayName"),
        "firstName": athlete.get("firstName"),
        "lastName": athlete.get("lastName"),
        "position": (athlete.get("position") or {}).get("abbreviation"),
        "team": (athlete.get("team") or {}).get("abbreviation"),
        "dateOfBirth": athlete.get("dateOfBirth"),
        "age": athlete.get("age"),
        "height": athlete.get("height"),
        "weight": athlete.get("weight"),
        "jersey": athlete.get("jersey"),
        "experience_years": (athlete.get("experience") or {}).get("years"),
        "status": athlete.get("status"),
        "active": athlete.get("active"),
    })

# Process both sources
if ATHLAB_DIR.exists():
    for p in ATHLAB_DIR.glob("*.json"):
        process_file(p)

if ATH_ID_DIR.exists():
    for p in ATH_ID_DIR.glob("*.json"):
        process_file(p)

df = pd.DataFrame(rows)

print("Total ESPN players found:", len(df))
if not df.empty:
    print("Columns:", sorted(df.columns.tolist()))
    out = OUT_DIR / "espn_all.csv"
    df.to_csv(out, index=False)
    print("Wrote:", out)
else:
    print("No players found!")
