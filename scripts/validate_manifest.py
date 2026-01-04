#!/usr/bin/env python3
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
MANIFEST_PATH = DATA_DIR / "manifest.json"


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def resolve_template(template: str, **params) -> str:
    path = template
    for key, value in params.items():
        path = path.replace(f"{{{key}}}", str(value))
    return path


def main() -> int:
    if not MANIFEST_PATH.exists():
        print("Missing manifest.json")
        return 1

    manifest = read_json(MANIFEST_PATH)
    seasons = manifest.get("seasons") or []
    weeks_by_season = manifest.get("weeksBySeason") or {}
    paths = manifest.get("paths") or {}

    missing = []

    # Required top-level datasets
    required_static = ["allTime", "seasonSummary", "weeklyChunk", "transactions"]
    for key in required_static:
        if key not in paths:
            missing.append(f"manifest.paths.{key} (missing key)")

    # all_time.json
    all_time_path = paths.get("allTime")
    if all_time_path:
        if not (DATA_DIR / all_time_path).exists():
            missing.append(all_time_path)

    # season summaries + weekly chunks + transactions
    for season in seasons:
        season_path = resolve_template(paths.get("seasonSummary", ""), season=season)
        if season_path and not (DATA_DIR / season_path).exists():
            missing.append(season_path)

        txn_path = resolve_template(paths.get("transactions", ""), season=season)
        if txn_path and not (DATA_DIR / txn_path).exists():
            missing.append(txn_path)

        weeks = weeks_by_season.get(str(season)) or weeks_by_season.get(season) or []
        for week in weeks:
            weekly_path = resolve_template(paths.get("weeklyChunk", ""), season=season, week=week)
            if weekly_path and not (DATA_DIR / weekly_path).exists():
                missing.append(weekly_path)

    # Validate every template path with available params
    for key, template in paths.items():
        if "{season}" in template and seasons:
            for season in seasons:
                if "{week}" in template:
                    weeks = weeks_by_season.get(str(season)) or weeks_by_season.get(season) or []
                    for week in weeks:
                        resolved = resolve_template(template, season=season, week=week)
                        if resolved and not (DATA_DIR / resolved).exists():
                            missing.append(resolved)
                else:
                    resolved = resolve_template(template, season=season)
                    if resolved and not (DATA_DIR / resolved).exists():
                        missing.append(resolved)
        elif "{week}" in template:
            # week without season is not expected, but validate literal if present
            resolved = resolve_template(template)
            if resolved and not (DATA_DIR / resolved).exists():
                missing.append(resolved)
        else:
            resolved = resolve_template(template)
            if resolved and not (DATA_DIR / resolved).exists():
                missing.append(resolved)

    if missing:
        print("Missing manifest targets:")
        for path in sorted(set(missing)):
            print(f"- {path}")
        return 1

    print("Manifest validation OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
