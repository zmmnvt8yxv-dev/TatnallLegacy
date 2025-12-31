#!/usr/bin/env python3
"""
Builds canonical data/<YEAR>.json files from ESPN/Sleeper sources.
Re-uses existing Sleeper fetchers to refresh 2025 data and trade metrics.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from jsonschema import Draft202012Validator

from data_loader import load_json, normalize_power_rankings, normalize_season, normalize_weekly_recaps
from data_schemas import POWER_RANKINGS_SCHEMA, SCHEMA_VERSION, SEASON_SCHEMA, WEEKLY_RECAPS_SCHEMA

VALIDATOR = Draft202012Validator(SEASON_SCHEMA)
POWER_RANKINGS_VALIDATOR = Draft202012Validator(POWER_RANKINGS_SCHEMA)
WEEKLY_RECAPS_VALIDATOR = Draft202012Validator(WEEKLY_RECAPS_SCHEMA)


def run_script(path: Path, env: Optional[dict] = None) -> None:
    subprocess.run([sys.executable, str(path)], check=True, env=env)


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2))


def validate_season(payload: Dict[str, Any], year: int) -> None:
    errors = sorted(VALIDATOR.iter_errors(payload), key=lambda e: e.path)
    if errors:
        details = "\n".join([f"- {list(e.path)}: {e.message}" for e in errors])
        raise SystemExit(f"Schema validation failed for {year}:\n{details}")

    if payload.get("schemaVersion") != SCHEMA_VERSION:
        raise SystemExit(
            f"Schema validation failed for {year}: schemaVersion {payload.get('schemaVersion')} "
            f"does not match {SCHEMA_VERSION}"
        )


def validate_power_rankings(path: Path) -> None:
    payload = normalize_power_rankings(load_json(path))
    errors = sorted(POWER_RANKINGS_VALIDATOR.iter_errors(payload), key=lambda e: e.path)
    if errors:
        details = "\n".join([f"- {list(e.path)}: {e.message}" for e in errors])
        raise SystemExit(f"Schema validation failed for {path.name}:\n{details}")
    write_json(path, payload)


def validate_weekly_recaps(path: Path) -> None:
    payload = normalize_weekly_recaps(load_json(path))
    errors = sorted(WEEKLY_RECAPS_VALIDATOR.iter_errors(payload), key=lambda e: e.path)
    if errors:
        details = "\n".join([f"- {list(e.path)}: {e.message}" for e in errors])
        raise SystemExit(f"Schema validation failed for {path.name}:\n{details}")
    write_json(path, payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="public/data", help="Directory with ESPN legacy JSON files")
    parser.add_argument("--out", default="data", help="Output directory for canonical datasets")
    parser.add_argument("--skip-live", action="store_true", help="Skip live Sleeper fetch scripts")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    source_dir = root / args.source
    out_dir = root / args.out
    out_dir.mkdir(exist_ok=True)
    public_dir = root / "public" / "data"
    public_dir.mkdir(parents=True, exist_ok=True)

    raw_dir = out_dir / "raw"
    raw_dir.mkdir(exist_ok=True)

    if not args.skip_live:
        run_script(root / "sleeper_2025_to_json.py")
        run_script(root / "sleeper_trades_to_json.py")
        run_script(root / "build_trade_metrics_2025.py")

    years: List[int] = []
    for path in sorted(source_dir.glob("*.json")):
        if path.name == "manifest.json":
            continue
        try:
            year = int(path.stem)
        except ValueError:
            continue
        years.append(year)

    if (raw_dir / "2025.json").exists():
        years.append(2025)

    years = sorted(set(years))

    for year in years:
        if year == 2025 and (raw_dir / "2025.json").exists():
            source = load_json(raw_dir / "2025.json")
        else:
            source_path = source_dir / f"{year}.json"
            if not source_path.exists():
                continue
            source = load_json(source_path)

        lineups = None
        lineups_path = out_dir / f"lineups-{year}.json"
        if lineups_path.exists():
            lineups = load_json(lineups_path)
        elif (source_dir / f"lineups-{year}.json").exists():
            lineups = load_json(source_dir / f"lineups-{year}.json")

        if isinstance(lineups, dict):
            lineups = lineups.get("rows")

        payload = normalize_season(source, year, lineups if isinstance(lineups, list) else None)
        validate_season(payload, year)
        write_json(out_dir / f"{year}.json", payload)
        write_json(public_dir / f"{year}.json", payload)

    for extra_file, validator in (
        ("power-rankings.json", validate_power_rankings),
        ("weekly-recaps.json", validate_weekly_recaps),
    ):
        path = out_dir / extra_file
        if path.exists():
            validator(path)
            write_json(public_dir / extra_file, load_json(path))

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "years": years,
    }
    write_json(root / "manifest.json", manifest)
    write_json(root / "public" / "data" / "manifest.json", manifest)


if __name__ == "__main__":
    main()
