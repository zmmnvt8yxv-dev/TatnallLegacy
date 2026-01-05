import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
IN_DIR = ROOT / "data_raw" / "sleeper"
OUT_DIR = ROOT / "public" / "data"

def read_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    seasons = []
    for p in sorted(IN_DIR.glob("draft_values_*.json")):
        payload = read_json(p)
        season = payload.get("season")
        if season is None:
            continue

        values = payload.get("values") or {}
        values = {str(k): int(v) for k, v in values.items() if v is not None}

        out_payload = {
            "season": int(season),
            "league_id": str(payload.get("league_id") or ""),
            "draft_id": str(payload.get("draft_id") or ""),
            "draft_type": payload.get("draft_type"),
            "status": payload.get("status"),
            "generated_at": payload.get("generated_at") or datetime.now(timezone.utc).isoformat(),
            "values": values,
        }

        out_path = OUT_DIR / f"draft_values_{int(season)}.json"
        out_path.write_text(json.dumps(out_payload, indent=2), encoding="utf-8")
        seasons.append(int(season))

    seasons = sorted(set(seasons))
    (OUT_DIR / "draft_values_seasons.json").write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "seasons": seasons,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Wrote {len(seasons)} season files into {OUT_DIR}")

if __name__ == "__main__":
    main()
