"""Snapshot all actionable Sleeper resources for one Tatnall season."""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.ingest.resolve_sleeper_league import load_yaml, resolve_league
from scripts.ingest.sleeper_client import SleeperClient


ROOT = Path(__file__).resolve().parents[2]
REPLACEMENT_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}
REPLACEMENT_CANDIDATES_PER_POSITION = 5


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
    playoff_start_week = int(league_settings.get("playoff_week_start") or 15)
    regular_season_end_week = max(playoff_start_week - 1, 1)
    schedule_end_week = max(max_week, regular_season_end_week)
    matchups: dict[str, Any] = {}
    transactions: dict[str, Any] = {}
    for week in range(1, schedule_end_week + 1):
        matchups[str(week)] = client.get(f"league/{league_id}/matchups/{week}") or []
    for week in range(1, max_week + 1):
        transactions[str(week)] = client.get(
            f"league/{league_id}/transactions/{week}"
        ) or []
    resources["matchups"] = matchups
    resources["transactions"] = transactions

    rostered_player_ids = {
        str(player_id)
        for roster in resources["rosters"] or []
        for player_id in roster.get("players") or []
    }
    players_path = ROOT / "data" / "raw" / "sleeper" / "players" / "current.json"
    player_snapshot = (
        json.loads(players_path.read_text()).get("players") or {}
        if players_path.exists()
        else {}
    )

    def pull_projection_week(week: int) -> tuple[str, list[dict[str, Any]], dict[str, list[dict[str, Any]]], int]:
        params = urlencode({"season_type": "regular", "order_by": "pts_half_ppr"})
        endpoint = f"https://api.sleeper.app/projections/nfl/{season}/{week}?{params}"
        rows = client.get_url(endpoint, optional=True) or []
        scored: list[dict[str, Any]] = []
        for row in rows:
            player_id = str(row.get("player_id") or "")
            points = (row.get("stats") or {}).get("pts_half_ppr")
            if not player_id or points is None:
                continue
            source = player_snapshot.get(player_id) or {}
            scored.append(
                {
                    "player_id": player_id,
                    "week": int(row.get("week") or week),
                    "date": row.get("date"),
                    "team": row.get("team"),
                    "opponent": row.get("opponent"),
                    "game_id": row.get("game_id"),
                    "company": row.get("company"),
                    "updated_at": row.get("updated_at") or row.get("last_modified"),
                    "pts_half_ppr": points,
                    "position": row.get("position") or source.get("position"),
                }
            )

        rostered = sorted(
            [
                {key: value for key, value in row.items() if key != "position"}
                for row in scored
                if row["player_id"] in rostered_player_ids
            ],
            key=lambda row: row["player_id"],
        )
        available: dict[str, list[dict[str, Any]]] = {}
        for position in sorted(REPLACEMENT_POSITIONS):
            candidates = sorted(
                [
                    row
                    for row in scored
                    if row["player_id"] not in rostered_player_ids and row.get("position") == position
                ],
                key=lambda row: (-float(row["pts_half_ppr"]), row["player_id"]),
            )[:REPLACEMENT_CANDIDATES_PER_POSITION]
            available[position] = [
                {
                    "player_id": row["player_id"],
                    "position": position,
                    "pts_half_ppr": row["pts_half_ppr"],
                }
                for row in candidates
            ]
        return str(week), rostered, available, len(scored)

    projection_weeks: dict[str, list[dict[str, Any]]] = {}
    replacement_weeks: dict[str, dict[str, list[dict[str, Any]]]] = {}
    projection_pool_values = 0
    with ThreadPoolExecutor(max_workers=4) as executor:
        for week_text, rows, available, scored_count in executor.map(
            pull_projection_week, range(1, regular_season_end_week + 1)
        ):
            projection_weeks[week_text] = rows
            replacement_weeks[week_text] = available
            projection_pool_values += scored_count
    projection_weeks = dict(sorted(projection_weeks.items(), key=lambda item: int(item[0])))
    replacement_weeks = dict(sorted(replacement_weeks.items(), key=lambda item: int(item[0])))
    resources["projections"] = {
        "source": "Sleeper projections API",
        "scoring": "pts_half_ppr",
        "season_type": "regular",
        "weeks": projection_weeks,
    }
    resources["replacement_pool"] = {
        "source": "Sleeper projections API",
        "scoring": "pts_half_ppr",
        "season_type": "regular",
        "published_values": projection_pool_values,
        "candidates_per_position": REPLACEMENT_CANDIDATES_PER_POSITION,
        "weeks": replacement_weeks,
    }

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
        "regular_season_end_week": regular_season_end_week,
        "schedule_through_week": schedule_end_week,
        "projection_weeks": list(range(1, regular_season_end_week + 1)),
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
                    else sum(len(rows) for rows in value.get("weeks", {}).values())
                    if name == "projections" and isinstance(value, dict)
                    else sum(
                        len(rows)
                        for positions in value.get("weeks", {}).values()
                        for rows in positions.values()
                    )
                    if name == "replacement_pool" and isinstance(value, dict)
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
