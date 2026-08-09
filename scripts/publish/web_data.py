#!/usr/bin/env python3
"""Publish compact, canonical v3 JSON datasets for the React application.

The public files are delivery formats only. League truth remains in the
normalized Parquet tables and audited correction/configuration files.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yaml


ROOT = Path(__file__).resolve().parents[2]
NORMALIZED = ROOT / "data" / "normalized"
DERIVED = ROOT / "data" / "derived"
CONFIG = ROOT / "data" / "config"
SLEEPER_CURRENT = ROOT / "data" / "raw" / "sleeper" / "2026" / "current"
PUBLIC = ROOT / "public" / "data"


def _clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_clean(item) for item in value]
    if hasattr(value, "tolist") and not isinstance(value, str):
        return _clean(value.tolist())
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if pd.isna(value) if not isinstance(value, (list, dict, tuple, set)) else False:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return int(value) if value.is_integer() else round(value, 3)
    return value


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def _load_yaml(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text()) or {}


def _write(path: Path, payload: Any, *, pretty: bool = False) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    if pretty:
        text = json.dumps(_clean(payload), indent=2, ensure_ascii=False) + "\n"
    else:
        text = json.dumps(_clean(payload), ensure_ascii=False, separators=(",", ":")) + "\n"
    path.write_text(text)
    return len(text.encode("utf-8"))


def _owner_aliases() -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    config = _load_yaml(CONFIG / "owners.yml")
    owners = pd.read_parquet(NORMALIZED / "owners.parquet")
    by_key = {row.owner_key: row._asdict() for row in owners.itertuples(index=False)}
    full: dict[str, dict[str, Any]] = {}
    sleeper_to_uid: dict[str, str] = {}
    for configured in config.get("owners", []):
        canonical = by_key[configured["owner_key"]]
        aliases = configured.get("aliases") or {}
        uid = canonical["owner_uid"]
        full[uid] = {**canonical, "aliases": aliases}
        for user_id in aliases.get("sleeper_user_ids") or []:
            sleeper_to_uid[str(user_id)] = uid
    return full, sleeper_to_uid


def _franchise_rosters(season: int) -> dict[int, str]:
    config = _load_yaml(CONFIG / "franchises.yml")
    normalized = pd.read_parquet(NORMALIZED / "franchises.parquet")
    by_key = {row.franchise_key: row.franchise_uid for row in normalized.itertuples(index=False)}
    result: dict[int, str] = {}
    for row in config.get("franchises", []):
        roster_id = (row.get("sleeper_roster_ids") or {}).get(str(season))
        if roster_id is not None:
            result[int(roster_id)] = by_key[row["franchise_key"]]
    return result


def _team_ref(row: pd.Series | dict[str, Any], owners: dict[str, dict[str, Any]]) -> dict[str, Any]:
    get = row.get
    owner_uid = get("owner_uid")
    return {
        "teamSeasonUid": get("team_season_uid"),
        "teamName": get("team_name"),
        "ownerUid": owner_uid,
        "ownerName": owners.get(owner_uid, {}).get("canonical_name", "Unknown owner"),
        "franchiseUid": get("franchise_uid"),
        "seed": get("playoff_seed") if get("playoff_seed") is not None else get("seed"),
    }


def _regular_h2h(
    owner_uid: str,
    matchups: pd.DataFrame,
    teams_by_uid: dict[str, dict[str, Any]],
    owners: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    totals: dict[str, dict[str, Any]] = {}
    for matchup in matchups.itertuples(index=False):
        home = teams_by_uid.get(matchup.home_team_season_uid)
        away = teams_by_uid.get(matchup.away_team_season_uid)
        if not home or not away:
            continue
        home_owner = home["owner_uid"]
        away_owner = away["owner_uid"]
        if owner_uid not in (home_owner, away_owner):
            continue
        opponent_uid = away_owner if home_owner == owner_uid else home_owner
        if opponent_uid == owner_uid:
            continue
        row = totals.setdefault(
            opponent_uid,
            {
                "ownerUid": opponent_uid,
                "ownerName": owners.get(opponent_uid, {}).get("canonical_name", "Unknown owner"),
                "games": 0,
                "wins": 0,
                "losses": 0,
                "ties": 0,
                "pointsFor": 0.0,
                "pointsAgainst": 0.0,
                "playoffGames": 0,
                "playoffWins": 0,
            },
        )
        is_home = home_owner == owner_uid
        team_uid = matchup.home_team_season_uid if is_home else matchup.away_team_season_uid
        points_for = matchup.home_points if is_home else matchup.away_points
        points_against = matchup.away_points if is_home else matchup.home_points
        row["games"] += 1
        row["pointsFor"] += float(points_for)
        row["pointsAgainst"] += float(points_against)
        if matchup.tie:
            row["ties"] += 1
        elif matchup.winner_team_season_uid == team_uid:
            row["wins"] += 1
        else:
            row["losses"] += 1
        if matchup.matchup_type != "regular_season":
            row["playoffGames"] += 1
            if matchup.winner_team_season_uid == team_uid:
                row["playoffWins"] += 1
    return sorted(totals.values(), key=lambda row: (-row["games"], row["ownerName"]))


def _current_players(
    player_ids: pd.DataFrame, players: pd.DataFrame
) -> tuple[dict[str, str], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    sleeper_ids = player_ids[player_ids["id_type"] == "sleeper"]
    sleeper_to_uid = dict(zip(sleeper_ids["id_value"].astype(str), sleeper_ids["player_uid"]))
    player_rows = {row.player_uid: row._asdict() for row in players.itertuples(index=False)}
    fantasy_positions = {"QB", "RB", "WR", "TE", "K", "DEF"}
    directory: list[dict[str, Any]] = []
    for sleeper_id, uid in sleeper_to_uid.items():
        player = player_rows.get(uid)
        if not player or player.get("position") not in fantasy_positions:
            continue
        if not player.get("active"):
            continue
        # Sleeper keeps thousands of unsigned/offseason records marked active.
        # The web directory is for actionable NFL research, so require a current
        # team. Rostered exceptions are surfaced from the current roster payload.
        if not player.get("nfl_team"):
            continue
        directory.append(
            {
                "playerUid": uid,
                "sleeperId": sleeper_id,
                "name": player.get("display_name"),
                "position": player.get("position"),
                "nflTeam": player.get("nfl_team") or None,
                "college": player.get("college") or None,
                "yearsExperience": player.get("years_experience"),
            }
        )
    directory.sort(key=lambda row: (row["name"] or "", row["playerUid"]))
    return sleeper_to_uid, player_rows, directory


def publish() -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    league_config = _load_yaml(CONFIG / "league.yml")
    scoring = _load_yaml(CONFIG / "scoring.yml")
    history_report = _load_json(DERIVED / "history_verification.json")
    corrections_report = _load_json(DERIVED / "corrections_applied.json")
    identity_report = _load_json(DERIVED / "player_identity_report.json")

    seasons = pd.read_parquet(NORMALIZED / "seasons.parquet").sort_values("season")
    teams = pd.read_parquet(NORMALIZED / "team_seasons.parquet").sort_values(["season", "regular_season_rank"])
    matchups = pd.read_parquet(NORMALIZED / "matchups.parquet").sort_values(["season", "week", "matchup_uid"])
    players = pd.read_parquet(NORMALIZED / "players.parquet")
    player_ids = pd.read_parquet(NORMALIZED / "player_ids.parquet")
    owners, sleeper_owner_to_uid = _owner_aliases()
    teams_by_uid = {row.team_season_uid: row._asdict() for row in teams.itertuples(index=False)}
    complete_matchup_seasons = {
        int(row.season)
        for row in seasons.itertuples(index=False)
        if _clean(row.data_completeness).get("matchups") == "complete"
    }
    trusted_matchups = matchups[matchups["season"].isin(complete_matchup_seasons)].copy()

    current = league_config["current_season"]
    current_season = int(current["season"])
    current_manifest = _load_json(SLEEPER_CURRENT / "manifest.json")
    current_league = _load_json(SLEEPER_CURRENT / "league.json")
    current_users = _load_json(SLEEPER_CURRENT / "users.json")
    current_rosters = _load_json(SLEEPER_CURRENT / "rosters.json")
    users_by_id = {str(row["user_id"]): row for row in current_users}
    roster_to_franchise = _franchise_rosters(current_season)
    sleeper_to_player_uid, players_by_uid, player_directory = _current_players(player_ids, players)

    sizes: dict[str, int] = {}
    paths: list[str] = []

    def emit(relative: str, payload: Any, *, pretty: bool = False) -> None:
        path = PUBLIC / relative
        sizes[relative] = _write(path, payload, pretty=pretty)
        paths.append(relative)

    # Season yearbooks and compact history index.
    history_seasons: list[dict[str, Any]] = []
    for season in seasons.itertuples(index=False):
        season_number = int(season.season)
        season_teams = teams[teams["season"] == season_number]
        season_matchups = matchups[matchups["season"] == season_number]
        champion_row = teams_by_uid[season.champion_team_season_uid]
        runner_row = teams_by_uid[season.runner_up_team_season_uid]
        champion = _team_ref(champion_row, owners)
        runner_up = _team_ref(runner_row, owners)
        completeness = _clean(season.data_completeness)
        history_row = {
            "season": season_number,
            "platform": season.platform,
            "champion": champion,
            "runnerUp": runner_up,
            "teamCount": int(season.team_count),
            "corrected": bool(season.is_corrected),
            "completeness": completeness,
        }
        history_seasons.append(history_row)
        standings = []
        for team in season_teams.to_dict("records"):
            standings.append(
                {
                    **_team_ref(team, owners),
                    "rank": team["regular_season_rank"],
                    "wins": team["wins"],
                    "losses": team["losses"],
                    "ties": team["ties"],
                    "pointsFor": team["points_for"],
                    "pointsAgainst": team["points_against"],
                    "playoffFinish": team["playoff_finish"],
                    "champion": team["champion"],
                    "runnerUp": team["runner_up"],
                }
            )
        matchup_rows = []
        for matchup in season_matchups.to_dict("records"):
            matchup_rows.append(
                {
                    "matchupUid": matchup["matchup_uid"],
                    "week": matchup["week"],
                    "type": matchup["matchup_type"],
                    "home": {**_team_ref(teams_by_uid[matchup["home_team_season_uid"]], owners), "points": matchup["home_points"]},
                    "away": {**_team_ref(teams_by_uid[matchup["away_team_season_uid"]], owners), "points": matchup["away_points"]},
                    "winnerTeamSeasonUid": matchup["winner_team_season_uid"],
                    "tie": matchup["tie"],
                    "corrected": matchup["is_corrected"],
                }
            )
        emit(
            f"seasons/{season_number}/index.json",
            {
                "meta": {
                    "schemaVersion": "3.0.0",
                    "generatedAt": generated_at,
                    "source": season.source,
                    "completeness": completeness,
                },
                "season": history_row,
                "standings": standings,
                "playoffWeeks": list(range(int(season.playoff_start_week), int(season.championship_week) + 1)),
                "correctionIds": _clean(season.correction_ids),
            },
        )
        emit(
            f"seasons/{season_number}/matchups.json",
            {"meta": {"generatedAt": generated_at, "completeness": completeness["matchups"]}, "matchups": matchup_rows},
        )

    title_counts: dict[str, int] = defaultdict(int)
    finals_counts: dict[str, int] = defaultdict(int)
    for row in history_seasons:
        title_counts[row["champion"]["ownerUid"]] += 1
        finals_counts[row["champion"]["ownerUid"]] += 1
        finals_counts[row["runnerUp"]["ownerUid"]] += 1
    emit(
        "history/index.json",
        {
            "meta": {"schemaVersion": "3.0.0", "generatedAt": generated_at, "seasons": len(history_seasons)},
            "seasons": list(reversed(history_seasons)),
        },
    )

    # Current-season/offseason command center.
    current_teams = []
    rostered_player_uids: set[str] = set()
    for roster in sorted(current_rosters, key=lambda row: int(row["roster_id"])):
        owner_uid = sleeper_owner_to_uid.get(str(roster.get("owner_id")))
        user = users_by_id.get(str(roster.get("owner_id")), {})
        metadata = user.get("metadata") or {}
        roster_players = []
        starters = {str(player_id) for player_id in roster.get("starters") or []}
        for sleeper_id in roster.get("players") or []:
            player_uid = sleeper_to_player_uid.get(str(sleeper_id))
            player = players_by_uid.get(player_uid, {})
            if player_uid:
                rostered_player_uids.add(player_uid)
            roster_players.append(
                {
                    "playerUid": player_uid,
                    "sleeperId": str(sleeper_id),
                    "name": player.get("display_name") or f"Sleeper {sleeper_id}",
                    "position": player.get("position") or None,
                    "nflTeam": player.get("nfl_team") or None,
                    "starter": str(sleeper_id) in starters,
                }
            )
        roster_players.sort(key=lambda row: (not row["starter"], row["position"] or "", row["name"]))
        settings = roster.get("settings") or {}
        current_teams.append(
            {
                "rosterId": int(roster["roster_id"]),
                "ownerUid": owner_uid,
                "ownerName": owners.get(owner_uid, {}).get("canonical_name", user.get("display_name", "Unknown owner")),
                "franchiseUid": roster_to_franchise.get(int(roster["roster_id"])),
                "teamName": metadata.get("team_name") or user.get("display_name") or f"Roster {roster['roster_id']}",
                "avatar": metadata.get("avatar") or user.get("avatar"),
                "division": settings.get("division"),
                "wins": settings.get("wins", 0),
                "losses": settings.get("losses", 0),
                "ties": settings.get("ties", 0),
                "waiverPosition": settings.get("waiver_position"),
                "players": roster_players,
            }
        )

    defending = history_seasons[-1]
    now_payload = {
        "meta": {
            "schemaVersion": "3.0.0",
            "generatedAt": generated_at,
            "sourceUpdatedAt": {"sleeper": current_manifest["retrieved_at"]},
            "completeness": {
                "league": "complete",
                "rosters": "complete",
                "matchups": "not_applicable",
                "transactions": "not_applicable",
                "draft": "partial",
            },
        },
        "league": {
            "name": league_config["league"]["name"],
            "platformName": current_league.get("name"),
            "season": current_season,
            "week": int(current.get("current_week", 1)),
            "phase": current["season_phase"],
            "status": current_league.get("status"),
            "teamCount": current_league.get("total_rosters"),
            "leagueId": str(current["league_id"]),
        },
        "defendingChampion": defending["champion"],
        "lastFinal": {"season": defending["season"], "champion": defending["champion"], "runnerUp": defending["runnerUp"]},
        "teams": current_teams,
        "drafts": _load_json(SLEEPER_CURRENT / "drafts.json"),
    }
    emit("now/index.json", now_payload)

    # Owner directory, profile files, and precomputed rivalries.
    owner_index = []
    for owner_uid, owner in sorted(owners.items(), key=lambda item: item[1]["canonical_name"]):
        owner_teams = teams[teams["owner_uid"] == owner_uid].sort_values("season")
        seasons_played = len(owner_teams)
        wins = int(owner_teams["wins"].sum()) if seasons_played else 0
        losses = int(owner_teams["losses"].sum()) if seasons_played else 0
        ties = int(owner_teams["ties"].sum()) if seasons_played else 0
        games = wins + losses + ties
        championships = int(owner_teams["champion"].sum()) if seasons_played else 0
        runner_ups = int(owner_teams["runner_up"].sum()) if seasons_played else 0
        profile_summary = {
            "ownerUid": owner_uid,
            "name": owner["canonical_name"],
            "active": bool(owner["active"]),
            "firstSeason": owner["first_season"],
            "lastSeason": owner["last_season"],
            "seasons": seasons_played,
            "wins": wins,
            "losses": losses,
            "ties": ties,
            "winPct": round((wins + ties * 0.5) / games, 3) if games else None,
            "championships": championships,
            "runnerUps": runner_ups,
            "finals": championships + runner_ups,
            "pointsFor": round(float(owner_teams["points_for"].sum()), 2) if seasons_played else 0,
            "pointsAgainst": round(float(owner_teams["points_against"].sum()), 2) if seasons_played else 0,
        }
        owner_index.append(profile_summary)
        team_history = []
        for team in owner_teams.to_dict("records"):
            team_history.append(
                {
                    "season": team["season"],
                    "teamSeasonUid": team["team_season_uid"],
                    "franchiseUid": team["franchise_uid"],
                    "teamName": team["team_name"],
                    "seed": team["playoff_seed"] if team["playoff_seed"] is not None else team["seed"],
                    "record": {"wins": team["wins"], "losses": team["losses"], "ties": team["ties"]},
                    "pointsFor": team["points_for"],
                    "pointsAgainst": team["points_against"],
                    "playoffFinish": team["playoff_finish"],
                    "champion": team["champion"],
                    "runnerUp": team["runner_up"],
                }
            )
        emit(
            f"owners/{owner_uid}.json",
            {
                "meta": {"schemaVersion": "3.0.0", "generatedAt": generated_at},
                "owner": profile_summary,
                "aliases": owner.get("aliases", {}).get("names", []),
                "teamHistory": list(reversed(team_history)),
                "headToHeadCoverage": {
                    "status": "complete_for_listed_seasons",
                    "seasons": sorted(complete_matchup_seasons),
                    "excludedSeasons": sorted(set(int(value) for value in seasons["season"]) - complete_matchup_seasons),
                },
                "headToHead": _regular_h2h(owner_uid, trusted_matchups, teams_by_uid, owners),
            },
        )
    owner_index.sort(key=lambda row: (-row["championships"], -row["wins"], row["name"]))
    emit("owners/index.json", {"meta": {"generatedAt": generated_at}, "owners": owner_index})

    # Records are generated from canonical tables and always retain context.
    completed_matchups = trusted_matchups[
        (trusted_matchups["status"] == "final")
        & trusted_matchups["home_points"].notna()
        & trusted_matchups["away_points"].notna()
    ].copy()
    matchup_records: list[dict[str, Any]] = []
    for row in completed_matchups.to_dict("records"):
        for side, other in (("home", "away"), ("away", "home")):
            team_uid = row[f"{side}_team_season_uid"]
            other_uid = row[f"{other}_team_season_uid"]
            team = teams_by_uid[team_uid]
            other_team = teams_by_uid[other_uid]
            matchup_records.append(
                {
                    "matchupUid": row["matchup_uid"],
                    "season": row["season"],
                    "week": row["week"],
                    "type": row["matchup_type"],
                    "points": row[f"{side}_points"],
                    "opponentPoints": row[f"{other}_points"],
                    "margin": abs(float(row["home_points"]) - float(row["away_points"])),
                    "team": _team_ref(team, owners),
                    "opponent": _team_ref(other_team, owners),
                }
            )
    highest_score = max(matchup_records, key=lambda row: row["points"])
    largest_win = max(
        (row for row in matchup_records if row["points"] > row["opponentPoints"]),
        key=lambda row: row["margin"],
    )
    closest_game = min(
        (row for row in matchup_records if row["margin"] > 0),
        key=lambda row: (row["margin"], row["season"], row["week"]),
    )
    records = {
        "ownerLeaders": {
            "championships": owner_index[:5],
            "wins": sorted(owner_index, key=lambda row: (-row["wins"], row["name"]))[:5],
            "winPct": sorted(
                (row for row in owner_index if row["seasons"] >= 3),
                key=lambda row: (-(row["winPct"] or 0), row["name"]),
            )[:5],
        },
        "matchups": {
            "highestScore": highest_score,
            "largestWin": largest_win,
            "closestGame": closest_game,
        },
        "playoffs": {
            "lowestSeedChampion": max(history_seasons, key=lambda row: row["champion"]["seed"] or 0),
            "titleCountBySeed": [
                {"seed": seed, "championships": sum(1 for row in history_seasons if row["champion"]["seed"] == seed)}
                for seed in sorted({row["champion"]["seed"] for row in history_seasons})
            ],
        },
    }
    emit(
        "records/index.json",
        {
            "meta": {
                "schemaVersion": "3.0.0",
                "generatedAt": generated_at,
                "matchupCoverage": "complete_seasons_only",
                "includedSeasons": sorted(complete_matchup_seasons),
                "excludedSeasons": sorted(set(int(value) for value in seasons["season"]) - complete_matchup_seasons),
            },
            **records,
        },
    )

    # One canonical lightweight directory replaces the old multi-megabyte registry load.
    for row in player_directory:
        row["currentlyRostered"] = row["playerUid"] in rostered_player_uids
    player_directory.sort(key=lambda row: (not row["currentlyRostered"], row["name"] or ""))
    emit(
        "players/index.json",
        {"meta": {"schemaVersion": "3.0.0", "generatedAt": generated_at, "count": len(player_directory)}, "players": player_directory},
    )
    search_items = [
        {
            "type": "owner",
            "id": row["ownerUid"],
            "label": row["name"],
            "secondary": f"{row['championships']} titles · {row['wins']} wins",
            "url": f"/owners/{row['ownerUid']}",
        }
        for row in owner_index
    ]
    search_items.extend(
        {
            "type": "season",
            "id": str(row["season"]),
            "label": f"{row['season']} season",
            "secondary": f"{row['champion']['ownerName']} · {row['champion']['teamName']}",
            "url": f"/seasons/{row['season']}",
        }
        for row in history_seasons
    )
    search_items.extend(
        {
            "type": "player",
            "id": row["playerUid"],
            "label": row["name"],
            "secondary": " · ".join(part for part in (row["position"], row["nflTeam"]) if part),
            "url": f"/players/{row['sleeperId']}",
        }
        for row in player_directory
    )
    emit("search/index.json", {"meta": {"generatedAt": generated_at}, "items": search_items})

    integrity = {
        "meta": {"schemaVersion": "3.0.0", "generatedAt": generated_at},
        "status": "warning" if history_report["warnings"] or identity_report["conflicts"] else "healthy",
        "critical": history_report["critical"],
        "warnings": history_report["warnings"],
        "coverage": {str(row["season"]): row["completeness"] for row in history_seasons},
        "corrections": corrections_report["corrections"],
        "identity": {
            "summary": identity_report["summary"],
            "quarantined": identity_report["conflicts"],
        },
        "openQuestions": [
            "Confirm 2025 third-place result if the league recognizes one.",
            "Verify ESPN-era scoring settings before recomputing historical custom player points.",
        ],
    }
    emit("integrity/index.json", integrity, pretty=True)

    league_meta = {
        "schemaVersion": "3.0.0",
        "league": league_config["league"],
        "currentSeason": current_season,
        "currentWeek": int(current.get("current_week", 1)),
        "seasonPhase": current["season_phase"],
        "leaguePlatform": current["platform"],
        "leagueId": str(current["league_id"]),
        "updatedAt": generated_at,
        "sourceUpdatedAt": {"sleeper": current_manifest["retrieved_at"]},
        "scoring": scoring,
    }
    emit("meta/league.json", league_meta, pretty=True)

    manifest = {
        "schemaVersion": "3.0.0",
        "generatedAt": generated_at,
        "league": {
            "name": league_config["league"]["name"],
            "firstSeason": league_config["league"]["first_season"],
            "currentSeason": current_season,
            "currentWeek": int(current.get("current_week", 1)),
            "seasonPhase": current["season_phase"],
            "leaguePlatform": current["platform"],
            "leagueId": str(current["league_id"]),
        },
        "seasons": [int(value) for value in seasons["season"].tolist()],
        "coverage": {str(row["season"]): row["completeness"] for row in history_seasons},
        "paths": {
            "current": "data/now/index.json",
            "history": "data/history/index.json",
            "season": "data/seasons/{season}/index.json",
            "seasonMatchups": "data/seasons/{season}/matchups.json",
            "owners": "data/owners/index.json",
            "owner": "data/owners/{ownerUid}.json",
            "players": "data/players/index.json",
            "records": "data/records/index.json",
            "search": "data/search/index.json",
            "integrity": "data/integrity/index.json",
        },
    }
    emit("manifest.v3.json", manifest, pretty=True)

    oversized = [
        {"path": path, "bytes": size, "level": "critical_review" if size > 2_000_000 else "warning"}
        for path, size in sizes.items()
        if size > 500_000
    ]
    build = {
        "schemaVersion": "3.0.0",
        "generatedAt": generated_at,
        "pipeline": ["ingest", "normalize", "correct", "derive", "publish", "validate"],
        "sourceCounts": current_manifest["resources"],
        "normalizedCounts": history_report["summary"] | {"players": identity_report["summary"]["canonical_players"]},
        "correctionCount": len(corrections_report["corrections"]),
        "warningCount": len(history_report["warnings"]) + len(oversized),
        "criticalCount": len(history_report["critical"]),
        "publishedFiles": len(paths) + 1,
        "oversizedFiles": oversized,
    }
    emit("meta/build.json", build, pretty=True)

    print(
        f"Published manifest v3: {len(paths)} files, {len(history_seasons)} seasons, "
        f"{len(owner_index)} owners, {len(player_directory)} active fantasy players"
    )
    if oversized:
        for row in oversized:
            print(f"WARNING: {row['path']} is {row['bytes'] / 1024:.1f} KB")
    return build


if __name__ == "__main__":
    publish()
