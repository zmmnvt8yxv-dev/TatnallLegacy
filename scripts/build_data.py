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

SCHEMA_VERSION = "1.0.0"

SEASON_SCHEMA: Dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["schemaVersion", "year", "teams", "matchups", "transactions", "draft", "awards"],
    "properties": {
        "schemaVersion": {"type": "string"},
        "year": {"type": "integer"},
        "league_id": {"type": ["string", "null"]},
        "generated_at": {"type": ["string", "null"]},
        "teams": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "team_id": {"type": ["integer", "null"]},
                    "team_name": {"type": "string"},
                    "owner": {"type": ["string", "null"]},
                    "record": {"type": ["string", "null"]},
                    "points_for": {"type": ["number", "null"]},
                    "points_against": {"type": ["number", "null"]},
                    "regular_season_rank": {"type": ["integer", "null"]},
                    "final_rank": {"type": ["integer", "null"]},
                },
            },
        },
        "matchups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "week": {"type": ["integer", "null"]},
                    "home_team": {"type": ["string", "null"]},
                    "home_score": {"type": ["number", "null"]},
                    "away_team": {"type": ["string", "null"]},
                    "away_score": {"type": ["number", "null"]},
                    "is_playoff": {"type": ["boolean", "null"]},
                },
            },
        },
        "transactions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["date", "entries"],
                "properties": {
                    "date": {"type": "string"},
                    "entries": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string"},
                                "team": {"type": ["string", "null"]},
                                "player": {"type": ["string", "null"]},
                                "faab": {"type": ["number", "null"]},
                            },
                        },
                    },
                },
            },
        },
        "draft": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "round": {"type": ["integer", "null"]},
                    "overall": {"type": ["integer", "null"]},
                    "team": {"type": ["string", "null"]},
                    "player": {"type": ["string", "null"]},
                    "player_nfl": {"type": ["string", "null"]},
                    "keeper": {"type": ["boolean", "null"]},
                },
            },
        },
        "awards": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "title"],
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                    "team": {"type": ["string", "null"]},
                    "owner": {"type": ["string", "null"]},
                    "value": {"type": ["number", "null"]},
                },
            },
        },
        "lineups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "week": {"type": ["integer", "null"]},
                    "team": {"type": ["string", "null"]},
                    "player_id": {"type": ["string", "null"]},
                    "player": {"type": ["string", "null"]},
                    "started": {"type": ["boolean", "null"]},
                    "points": {"type": ["number", "null"]},
                },
            },
        },
        "supplemental": {
            "type": "object",
            "properties": {
                "current_roster": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "player_index": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "object",
                        "properties": {
                            "full_name": {"type": ["string", "null"]},
                            "name": {"type": ["string", "null"]},
                            "team": {"type": ["string", "null"]},
                            "pos": {"type": ["string", "null"]},
                        },
                    },
                },
                "draft_day_roster": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "users": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "user_id": {"type": "string"},
                            "display_name": {"type": ["string", "null"]},
                        },
                    },
                },
                "trade_evals": {"type": "array"},
                "acquisitions": {"type": "array"},
            },
        },
    },
}

VALIDATOR = Draft202012Validator(SEASON_SCHEMA)


def run_script(path: Path, env: Optional[dict] = None) -> None:
    subprocess.run([sys.executable, str(path)], check=True, env=env)


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2))


def normalize_season(source: Dict[str, Any], year: int, lineups: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    supplemental = None
    if any(k in source for k in ("current_roster", "player_index", "draft_day_roster", "users", "trade_evals", "acquisitions")):
        supplemental = {
            "current_roster": source.get("current_roster"),
            "player_index": source.get("player_index"),
            "draft_day_roster": source.get("draft_day_roster"),
            "users": source.get("users"),
            "trade_evals": source.get("trade_evals"),
            "acquisitions": source.get("acquisitions"),
        }

    payload: Dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "year": int(source.get("year") or year),
        "league_id": source.get("league_id"),
        "generated_at": source.get("generated_at"),
        "teams": source.get("teams") or [],
        "matchups": source.get("matchups") or [],
        "transactions": source.get("transactions") or [],
        "draft": source.get("draft") or [],
        "awards": source.get("awards") or [],
    }

    if lineups:
        payload["lineups"] = lineups
    elif source.get("lineups"):
        payload["lineups"] = source.get("lineups")

    if supplemental:
        payload["supplemental"] = supplemental

    return payload


def validate_season(payload: Dict[str, Any], year: int) -> None:
    errors = sorted(VALIDATOR.iter_errors(payload), key=lambda e: e.path)
    if errors:
        details = "\n".join([f"- {list(e.path)}: {e.message}" for e in errors])
        raise SystemExit(f"Schema validation failed for {year}:\n{details}")


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

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "years": years,
    }
    write_json(root / "manifest.json", manifest)


if __name__ == "__main__":
    main()
