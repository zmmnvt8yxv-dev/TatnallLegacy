"""Resolve and validate a season-specific Sleeper league ID."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import yaml

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.ingest.sleeper_client import SleeperClient


ROOT = Path(__file__).resolve().parents[2]


class LeagueResolutionError(ValueError):
    """Raised when a season cannot be resolved without ambiguity."""


@dataclass(frozen=True)
class ResolvedLeague:
    season: int
    league_id: str
    previous_league_id: str | None
    name: str
    status: str
    total_rosters: int
    strategy: str


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = yaml.safe_load(handle)
    if not isinstance(value, dict):
        raise LeagueResolutionError(f"Expected YAML mapping: {path}")
    return value


def sleeper_ids_for_active_owners(owner_config: Mapping[str, Any]) -> list[str]:
    result = []
    for owner in owner_config.get("owners") or []:
        if not isinstance(owner, dict) or not owner.get("active"):
            continue
        aliases = owner.get("aliases") or {}
        for user_id in aliases.get("sleeper_user_ids") or []:
            result.append(str(user_id))
    return sorted(set(result))


def as_resolved(league: Mapping[str, Any], strategy: str) -> ResolvedLeague:
    return ResolvedLeague(
        season=int(league.get("season") or 0),
        league_id=str(league.get("league_id") or ""),
        previous_league_id=(
            str(league["previous_league_id"])
            if league.get("previous_league_id")
            else None
        ),
        name=str(league.get("name") or ""),
        status=str(league.get("status") or "unknown"),
        total_rosters=int(league.get("total_rosters") or 0),
        strategy=strategy,
    )


def resolve_league(
    season: int,
    league_config: Mapping[str, Any],
    owner_config: Mapping[str, Any],
    client: SleeperClient,
) -> ResolvedLeague:
    sleeper = (league_config.get("platforms") or {}).get("sleeper") or {}
    configured_ids = sleeper.get("league_ids") or {}
    configured_id = configured_ids.get(str(season))
    previous_id = configured_ids.get(str(season - 1))

    if configured_id:
        league = client.league(str(configured_id))
        resolved = as_resolved(league, "configured_and_validated")
        if resolved.season != season:
            raise LeagueResolutionError(
                f"Configured league {configured_id} is season {resolved.season}, not {season}"
            )
        if previous_id and resolved.previous_league_id != str(previous_id):
            raise LeagueResolutionError(
                f"Configured league {configured_id} does not chain from {previous_id}"
            )
        return resolved

    if not previous_id:
        raise LeagueResolutionError(
            f"Cannot resolve {season}: no configured {season - 1} Sleeper league ID"
        )

    matches: dict[str, dict[str, Any]] = {}
    for user_id in sleeper_ids_for_active_owners(owner_config):
        for league in client.user_leagues(user_id, season):
            if str(league.get("previous_league_id") or "") == str(previous_id):
                matches[str(league.get("league_id"))] = league
    if len(matches) != 1:
        raise LeagueResolutionError(
            f"Expected one {season} league chained from {previous_id}, found {len(matches)}"
        )
    return as_resolved(next(iter(matches.values())), "previous_league_match")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int)
    args = parser.parse_args()
    league_config = load_yaml(ROOT / "data" / "config" / "league.yml")
    owner_config = load_yaml(ROOT / "data" / "config" / "owners.yml")
    season = args.season or int((league_config.get("current_season") or {})["season"])
    result = resolve_league(season, league_config, owner_config, SleeperClient())
    print(json.dumps(result.__dict__, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
