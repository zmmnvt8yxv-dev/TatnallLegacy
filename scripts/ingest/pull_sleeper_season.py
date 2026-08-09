"""Snapshot all actionable Sleeper resources for one Tatnall season."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.ingest.resolve_sleeper_league import load_yaml, resolve_league
from scripts.ingest.sleeper_client import SleeperClient


ROOT = Path(__file__).resolve().parents[2]


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def pull_season(
    season: int,
    output_dir: Path,
    *,
    client: SleeperClient | None = None,
) -> dict[str, Any]:
    client = client or SleeperClient()
    league_config = load_yaml(ROOT / "data" / "config" / "league.yml")
    owner_config = load_yaml(ROOT / "data" / "config" / "owners.yml")
    resolved = resolve_league(season, league_config, owner_config, client)
    league_id = resolved.league_id
    state = client.get("state/nfl")
    league = client.league(league_id)

    drafts = client.get(f"league/{league_id}/drafts") or []
    draft_picks: dict[str, Any] = {}
    draft_traded_picks: dict[str, Any] = {}
    for draft in drafts:
        if not isinstance(draft, dict) or not draft.get("draft_id"):
            continue
        draft_id = str(draft["draft_id"])
        draft_picks[draft_id] = client.get(f"draft/{draft_id}/picks") or []
        draft_traded_picks[draft_id] = (
            client.get(f"draft/{draft_id}/traded_picks") or []
        )

    resources = {
        "state": state,
        "league": league,
        "users": client.get(f"league/{league_id}/users"),
        "rosters": client.get(f"league/{league_id}/rosters"),
        "drafts": drafts,
        "draft_picks": draft_picks,
        "draft_traded_picks": draft_traded_picks,
        "traded_picks": client.get(f"league/{league_id}/traded_picks"),
        "winners_bracket": client.get(
            f"league/{league_id}/winners_bracket", optional=True
        )
        or [],
        "losers_bracket": client.get(
            f"league/{league_id}/losers_bracket", optional=True
        )
        or [],
    }

    status = str(league.get("status") or "")
    state_week = int((state or {}).get("week") or 1)
    league_settings = league.get("settings") or {}
    league_week = int(
        league_settings.get("last_scored_leg")
        or league_settings.get("leg")
        or state_week
    )
    if status == "complete":
        max_week = league_week
    elif status in {"in_season", "post_season"}:
        max_week = max(1, state_week)
    else:
        max_week = 1
    matchups: dict[str, Any] = {}
    transactions: dict[str, Any] = {}
    for week in range(1, max_week + 1):
        matchups[str(week)] = client.get(f"league/{league_id}/matchups/{week}") or []
        transactions[str(week)] = client.get(
            f"league/{league_id}/transactions/{week}"
        ) or []
    resources["matchups"] = matchups
    resources["transactions"] = transactions

    retrieved_at = datetime.now(timezone.utc).isoformat()
    for name, value in resources.items():
        write_json(output_dir / f"{name}.json", value)
    manifest = {
        "schema_version": "1.0.0",
        "retrieved_at": retrieved_at,
        "season": season,
        "league_id": league_id,
        "previous_league_id": resolved.previous_league_id,
        "resolution_strategy": resolved.strategy,
        "league_status": resolved.status,
        "season_phase": "complete" if status == "complete" else (state or {}).get("season_type"),
        "current_week": max_week if status == "complete" else state_week,
        "resources": {
            name: {
                "path": f"{name}.json",
                "records": (
                    sum(len(rows) for rows in value.values())
                    if name
                    in {
                        "matchups",
                        "transactions",
                        "draft_picks",
                        "draft_traded_picks",
                    }
                    else len(value)
                    if isinstance(value, list)
                    else 1
                ),
            }
            for name, value in resources.items()
        },
    }
    write_json(output_dir / "manifest.json", manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    league_config = load_yaml(ROOT / "data" / "config" / "league.yml")
    season = args.season or int((league_config.get("current_season") or {})["season"])
    output = args.output or ROOT / "data" / "raw" / "sleeper" / str(season) / "current"
    manifest = pull_season(season, output)
    print(
        f"Sleeper snapshot OK: {manifest['season']} league {manifest['league_id']} "
        f"({manifest['league_status']}, {manifest['season_phase']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
