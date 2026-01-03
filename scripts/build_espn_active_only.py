import json
from pathlib import Path
import pandas as pd

ATH_DIR = Path("data_raw/espn_core/athletes")
OUT_DIR = Path("data_raw/verify")
OUT_DIR.mkdir(parents=True, exist_ok=True)

rows = []

for p in ATH_DIR.glob("*.json"):
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        continue

    # ESPN Core structure
    athlete = d.get("athlete") or d

    if not isinstance(athlete, dict):
        continue

    if athlete.get("active") is not True:
        continue

    rows.append({
        "espn_id": athlete.get("id"),
        "uid": athlete.get("uid"),
        "guid": athlete.get("guid"),
        "fullName": athlete.get("fullName"),
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
    })

df = pd.DataFrame(rows)

print("Active ESPN players:", len(df))
print("Columns:", sorted(df.columns.tolist()))

out = OUT_DIR / "espn_active_only.csv"
df.to_csv(out, index=False)
print("Wrote:", out)
