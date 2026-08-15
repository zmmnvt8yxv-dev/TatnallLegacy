#!/usr/bin/env python3
"""Publish compact, canonical v3 JSON datasets for the React application.

The public files are delivery formats only. League truth remains in the
normalized Parquet tables and audited correction/configuration files.
"""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
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


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


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
    branding = (_load_yaml(CONFIG / "branding.yml").get("franchises") or {})
    owners = pd.read_parquet(NORMALIZED / "owners.parquet")
    by_key = {row.owner_key: row._asdict() for row in owners.itertuples(index=False)}
    full: dict[str, dict[str, Any]] = {}
    sleeper_to_uid: dict[str, str] = {}
    for configured in config.get("owners", []):
        canonical = by_key[configured["owner_key"]]
        aliases = configured.get("aliases") or {}
        uid = canonical["owner_uid"]
        identity = branding.get(configured["owner_key"]) or {}
        fallback = f"Team {str(canonical['canonical_name']).split()[-1]}"
        full[uid] = {
            **canonical,
            "aliases": aliases,
            "public_alias": identity.get("public_alias") or fallback,
            "monogram": identity.get("monogram") or "TL",
            "accent": identity.get("accent") or "#d7a928",
            "motto": identity.get("motto") or "",
        }
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
        "teamName": owners.get(owner_uid, {}).get("public_alias") or get("team_name"),
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
    lineups = pd.read_parquet(NORMALIZED / "lineups.parquet")
    lineup_entries = pd.read_parquet(NORMALIZED / "lineup_entries.parquet")
    transactions = pd.read_parquet(NORMALIZED / "transactions.parquet")
    transaction_assets = pd.read_parquet(NORMALIZED / "transaction_assets.parquet")
    drafts = pd.read_parquet(NORMALIZED / "drafts.parquet")
    draft_picks = pd.read_parquet(NORMALIZED / "draft_picks.parquet")
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
    current_drafts_raw = _load_json(SLEEPER_CURRENT / "drafts.json")
    current_draft_picks_raw = _load_json(SLEEPER_CURRENT / "draft_picks.json")
    current_transactions_raw = _load_json(SLEEPER_CURRENT / "transactions.json")
    current_matchups_raw = _load_json(SLEEPER_CURRENT / "matchups.json")
    users_by_id = {str(row["user_id"]): row for row in current_users}
    roster_to_franchise = _franchise_rosters(current_season)
    sleeper_to_player_uid, players_by_uid, player_directory = _current_players(player_ids, players)
    current_week = int(current_manifest.get("current_week") or current.get("current_week", 1))
    current_phase = {
        "pre": "preseason",
        "regular": "regular_season",
        "post": "postseason",
        "complete": "complete",
    }.get(str(current_manifest.get("season_phase") or ""), current["season_phase"])

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

        season_lineups = lineups[lineups["season"] == season_number]
        if not season_lineups.empty:
            season_entries = lineup_entries[lineup_entries["season"] == season_number]
            entries_by_lineup: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for entry in season_entries.to_dict("records"):
                player = players_by_uid.get(entry["player_uid"], {})
                entries_by_lineup[str(entry["lineup_uid"])].append(
                    {
                        "playerUid": entry["player_uid"],
                        "sleeperId": entry["sleeper_player_id"],
                        "name": player.get("display_name") or f"Sleeper {entry['sleeper_player_id']}",
                        "position": player.get("position") or None,
                        "nflTeam": None,
                        "slot": entry["roster_slot"],
                        "started": bool(entry["started"]),
                        "points": entry["fantasy_points"],
                    }
                )
            lineup_rows = []
            for lineup in season_lineups.sort_values(["week", "platform_roster_id"]).to_dict("records"):
                players_for_lineup = entries_by_lineup[str(lineup["lineup_uid"])]
                players_for_lineup.sort(
                    key=lambda row: (not row["started"], row["slot"], -(row["points"] or 0), row["name"])
                )
                lineup_rows.append(
                    {
                        "lineupUid": lineup["lineup_uid"],
                        "week": lineup["week"],
                        "team": _team_ref(teams_by_uid[lineup["team_season_uid"]], owners),
                        "matchupUid": lineup["matchup_uid"],
                        "points": lineup["points"],
                        "players": players_for_lineup,
                    }
                )

            season_transactions = transactions[transactions["season"] == season_number]
            season_assets = transaction_assets[transaction_assets["season"] == season_number]
            assets_by_transaction: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for asset in season_assets.to_dict("records"):
                player = players_by_uid.get(asset["player_uid"], {}) if asset["player_uid"] else {}
                from_team = teams_by_uid.get(asset["from_team_season_uid"])
                to_team = teams_by_uid.get(asset["to_team_season_uid"])
                assets_by_transaction[str(asset["transaction_uid"])].append(
                    {
                        "type": asset["asset_type"],
                        "playerUid": asset["player_uid"],
                        "sleeperId": asset["asset_id"] if asset["asset_type"] == "player" else None,
                        "name": player.get("display_name") if player else None,
                        "position": player.get("position") if player else None,
                        "amount": asset["amount"],
                        "from": _team_ref(from_team, owners) if from_team else None,
                        "to": _team_ref(to_team, owners) if to_team else None,
                    }
                )
            transaction_rows = []
            for transaction in season_transactions.sort_values("created_at_ms", ascending=False).to_dict("records"):
                team_uids = _clean(transaction["team_season_uids"]) or []
                transaction_rows.append(
                    {
                        "transactionUid": transaction["transaction_uid"],
                        "week": transaction["week"],
                        "type": transaction["transaction_type"],
                        "status": transaction["status"],
                        "createdAt": datetime.fromtimestamp(
                            int(transaction["created_at_ms"]) / 1000, tz=timezone.utc
                        ).isoformat(),
                        "waiverBid": transaction["waiver_bid"],
                        "teams": [
                            _team_ref(teams_by_uid[uid], owners)
                            for uid in team_uids
                            if uid in teams_by_uid
                        ],
                        "assets": assets_by_transaction.get(str(transaction["transaction_uid"]), []),
                    }
                )

            season_drafts = drafts[drafts["season"] == season_number]
            season_draft_picks = draft_picks[draft_picks["season"] == season_number]
            picks_by_draft: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for pick in season_draft_picks.sort_values("pick_no").to_dict("records"):
                player = players_by_uid.get(pick["player_uid"], {})
                picks_by_draft[str(pick["draft_uid"])].append(
                    {
                        "pickNo": pick["pick_no"],
                        "round": pick["round"],
                        "team": _team_ref(teams_by_uid[pick["team_season_uid"]], owners),
                        "playerUid": pick["player_uid"],
                        "sleeperId": pick["sleeper_player_id"],
                        "name": player.get("display_name") or f"Sleeper {pick['sleeper_player_id']}",
                        "position": player.get("position") or None,
                        "nflTeam": pick["nfl_team_at_draft"],
                        "amount": pick["amount"],
                        "keeper": bool(pick["is_keeper"]),
                    }
                )
            draft_rows = []
            for draft in season_drafts.sort_values("pick_count", ascending=False).to_dict("records"):
                settings = json.loads(draft["settings_json"] or "{}")
                draft_rows.append(
                    {
                        "draftUid": draft["draft_uid"],
                        "draftId": draft["platform_draft_id"],
                        "status": draft["status"],
                        "type": draft["draft_type"],
                        "startTime": datetime.fromtimestamp(
                            int(draft["start_time_ms"]) / 1000, tz=timezone.utc
                        ).isoformat(),
                        "budget": draft["budget"],
                        "rounds": draft["rounds"],
                        "pickCount": draft["pick_count"],
                        "settings": settings,
                        "picks": picks_by_draft.get(str(draft["draft_uid"]), []),
                    }
                )
            completed_transactions = [row for row in transaction_rows if row["status"] == "complete"]
            transaction_types = Counter(row["type"] for row in completed_transactions)
            primary_draft = max(draft_rows, key=lambda row: row["pickCount"], default=None)
            lineup_weeks = sorted({int(row["week"]) for row in lineup_rows})
            transaction_weeks = sorted({int(row["week"]) for row in transaction_rows})
            for week in lineup_weeks:
                emit(
                    f"seasons/{season_number}/lineups/{week}.json",
                    {
                        "meta": {"generatedAt": generated_at, "season": season_number, "week": week},
                        "lineups": [row for row in lineup_rows if int(row["week"]) == week],
                    },
                )
            for week in transaction_weeks:
                emit(
                    f"seasons/{season_number}/transactions/{week}.json",
                    {
                        "meta": {"generatedAt": generated_at, "season": season_number, "week": week},
                        "transactions": [
                            row for row in transaction_rows if int(row["week"]) == week
                        ],
                    },
                )
            emit(
                f"seasons/{season_number}/draft.json",
                {
                    "meta": {"generatedAt": generated_at, "season": season_number},
                    "drafts": draft_rows,
                },
            )
            emit(
                f"seasons/{season_number}/facts.json",
                {
                    "meta": {"schemaVersion": "3.0.0", "generatedAt": generated_at, "source": season.source},
                    "summary": {
                        "lineups": {
                            "weeks": int(season_lineups["week"].nunique()),
                            "availableWeeks": lineup_weeks,
                            "teamWeeks": len(lineup_rows),
                            "playerEntries": len(season_entries),
                        },
                        "transactions": {
                            "recorded": len(transaction_rows),
                            "completed": len(completed_transactions),
                            "failed": len(transaction_rows) - len(completed_transactions),
                            "byType": dict(sorted(transaction_types.items())),
                            "availableWeeks": transaction_weeks,
                        },
                        "draft": {
                            "draftsRecorded": len(draft_rows),
                            "completedPicks": len(season_draft_picks),
                            "primaryDraftId": primary_draft["draftId"] if primary_draft else None,
                            "budget": primary_draft["budget"] if primary_draft else None,
                        },
                    },
                    "paths": {
                        "lineups": f"data/seasons/{season_number}/lineups/{{week}}.json",
                        "transactions": f"data/seasons/{season_number}/transactions/{{week}}.json",
                        "draft": f"data/seasons/{season_number}/draft.json",
                    },
                },
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
    current_keeper_ids_by_roster: dict[int, set[str]] = defaultdict(set)
    for picks in current_draft_picks_raw.values():
        for pick in picks:
            if pick.get("is_keeper") and pick.get("roster_id") is not None:
                current_keeper_ids_by_roster[int(pick["roster_id"])].add(
                    str(pick.get("player_id") or "")
                )
    current_teams = []
    rostered_player_uids: set[str] = set()
    for roster in sorted(current_rosters, key=lambda row: int(row["roster_id"])):
        owner_uid = sleeper_owner_to_uid.get(str(roster.get("owner_id")))
        user = users_by_id.get(str(roster.get("owner_id")), {})
        metadata = user.get("metadata") or {}
        roster_players = []
        starters = {str(player_id) for player_id in roster.get("starters") or []}
        keepers = {
            str(player_id) for player_id in roster.get("keepers") or []
        } | current_keeper_ids_by_roster.get(int(roster["roster_id"]), set())
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
                    "keeper": str(sleeper_id) in keepers,
                }
            )
        roster_players.sort(
            key=lambda row: (
                not row["keeper"],
                not row["starter"],
                row["position"] or "",
                row["name"],
            )
        )
        settings = roster.get("settings") or {}
        current_teams.append(
            {
                "rosterId": int(roster["roster_id"]),
                "ownerUid": owner_uid,
                "ownerName": owners.get(owner_uid, {}).get("canonical_name", user.get("display_name", "Unknown owner")),
                "franchiseUid": roster_to_franchise.get(int(roster["roster_id"])),
                "teamName": owners.get(owner_uid, {}).get("public_alias") or f"Roster {roster['roster_id']}",
                "monogram": owners.get(owner_uid, {}).get("monogram") or "TL",
                "accent": owners.get(owner_uid, {}).get("accent") or "#d7a928",
                "motto": owners.get(owner_uid, {}).get("motto") or "",
                "avatar": metadata.get("avatar") or user.get("avatar"),
                "division": settings.get("division"),
                "wins": settings.get("wins", 0),
                "losses": settings.get("losses", 0),
                "ties": settings.get("ties", 0),
                "waiverPosition": settings.get("waiver_position"),
                "keepers": [row for row in roster_players if row["keeper"]],
                "players": roster_players,
            }
        )

    current_team_by_roster = {row["rosterId"]: row for row in current_teams}

    def current_team_ref(roster_id: int | None) -> dict[str, Any] | None:
        team = current_team_by_roster.get(int(roster_id)) if roster_id is not None else None
        if not team:
            return None
        return {
            "rosterId": team["rosterId"],
            "ownerUid": team["ownerUid"],
            "ownerName": team["ownerName"],
            "teamName": team["teamName"],
        }

    defending = history_seasons[-1]
    primary_current_draft = max(
        current_drafts_raw,
        key=lambda row: (
            len(current_draft_picks_raw.get(str(row.get("draft_id"))) or []),
            int(row.get("created") or 0),
        ),
        default=None,
    )
    current_draft = None
    if primary_current_draft:
        draft_id = str(primary_current_draft["draft_id"])
        draft_settings = primary_current_draft.get("settings") or {}
        draft_order = primary_current_draft.get("draft_order") or {}
        order_rows = []
        for user_id, slot in sorted(draft_order.items(), key=lambda item: int(item[1])):
            user = users_by_id.get(str(user_id), {})
            team = next(
                (
                    row
                    for row in current_teams
                    if row["ownerUid"] == sleeper_owner_to_uid.get(str(user_id))
                ),
                None,
            )
            order_rows.append(
                {
                    "slot": int(slot),
                    "userId": str(user_id),
                    "ownerName": team["ownerName"] if team else user.get("display_name", "Unknown owner"),
                    "teamName": team["teamName"] if team else user.get("display_name", "Unknown team"),
                }
            )
        start_time_ms = int(primary_current_draft.get("start_time") or 0)
        current_pick_rows = []
        for pick in sorted(
            current_draft_picks_raw.get(draft_id) or [],
            key=lambda row: int(row.get("pick_no") or 0),
        ):
            sleeper_id = str(pick.get("player_id") or "")
            player_uid = sleeper_to_player_uid.get(sleeper_id)
            player = players_by_uid.get(player_uid, {})
            metadata = pick.get("metadata") or {}
            metadata_name = (
                f"{metadata.get('first_name', '')} {metadata.get('last_name', '')}"
            ).strip()
            current_pick_rows.append(
                {
                    "pickNo": int(pick.get("pick_no") or 0),
                    "round": int(pick.get("round") or 0),
                    "team": current_team_ref(int(pick.get("roster_id") or 0)),
                    "playerUid": player_uid,
                    "sleeperId": sleeper_id,
                    "name": player.get("display_name")
                    or metadata_name
                    or f"Sleeper {sleeper_id}",
                    "position": player.get("position") or metadata.get("position"),
                    "nflTeam": player.get("nfl_team") or metadata.get("team"),
                    "amount": _number(metadata.get("amount")),
                    "keeper": bool(pick.get("is_keeper")),
                }
            )
        current_draft = {
            "draftId": draft_id,
            "status": primary_current_draft.get("status"),
            "type": primary_current_draft.get("type"),
            "startTime": (
                datetime.fromtimestamp(start_time_ms / 1000, tz=timezone.utc).isoformat()
                if start_time_ms
                else None
            ),
            "teamCount": draft_settings.get("teams"),
            "rounds": draft_settings.get("rounds"),
            "budget": draft_settings.get("budget"),
            "nominationSeconds": draft_settings.get("nomination_timer"),
            "pickSeconds": draft_settings.get("pick_timer"),
            "orderPublished": bool(order_rows),
            "order": order_rows,
            "pickCount": len(current_pick_rows),
            "picks": current_pick_rows,
            "sleeperUrl": f"https://sleeper.com/draft/nfl/{draft_id}",
        }
    current_transaction_rows = [
        transaction
        for week_transactions in current_transactions_raw.values()
        for transaction in week_transactions
    ]
    current_transaction_rows.sort(key=lambda row: int(row.get("created") or 0), reverse=True)
    recent_transactions = []
    for transaction in current_transaction_rows:
        if transaction.get("status") != "complete":
            continue
        adds = {str(key): int(value) for key, value in (transaction.get("adds") or {}).items()}
        drops = {str(key): int(value) for key, value in (transaction.get("drops") or {}).items()}
        assets = []
        for sleeper_id in sorted(set(adds) | set(drops)):
            player_uid = sleeper_to_player_uid.get(sleeper_id)
            player = players_by_uid.get(player_uid, {})
            assets.append(
                {
                    "playerUid": player_uid,
                    "sleeperId": sleeper_id,
                    "name": player.get("display_name") or f"Sleeper {sleeper_id}",
                    "position": player.get("position") or None,
                    "from": current_team_ref(drops.get(sleeper_id)),
                    "to": current_team_ref(adds.get(sleeper_id)),
                }
            )
        recent_transactions.append(
            {
                "transactionId": str(transaction.get("transaction_id") or ""),
                "week": int(transaction.get("leg") or 0),
                "type": str(transaction.get("type") or "unknown"),
                "createdAt": datetime.fromtimestamp(
                    int(transaction.get("created") or 0) / 1000, tz=timezone.utc
                ).isoformat(),
                "waiverBid": (transaction.get("settings") or {}).get("waiver_bid"),
                "assets": assets,
            }
        )
        if len(recent_transactions) == 20:
            break

    current_lineup_rows = []
    for entry in current_matchups_raw.get(str(current_week)) or []:
        roster_id = int(entry.get("roster_id") or 0)
        starters = []
        player_points = entry.get("players_points") or {}
        for sleeper_id_value in entry.get("starters") or []:
            sleeper_id = str(sleeper_id_value)
            player_uid = sleeper_to_player_uid.get(sleeper_id)
            player = players_by_uid.get(player_uid, {})
            starters.append(
                {
                    "playerUid": player_uid,
                    "sleeperId": sleeper_id,
                    "name": player.get("display_name") or f"Sleeper {sleeper_id}",
                    "position": player.get("position") or None,
                    "nflTeam": player.get("nfl_team") or None,
                    "points": _number(player_points.get(sleeper_id)),
                }
            )
        current_lineup_rows.append(
            {
                "rosterId": roster_id,
                "team": current_team_ref(roster_id),
                "matchupId": entry.get("matchup_id"),
                "points": _number(entry.get("points")),
                "starters": starters,
            }
        )
    submitted_keeper_count = sum(len(team["keepers"]) for team in current_teams)
    now_payload = {
        "meta": {
            "schemaVersion": "3.0.0",
            "generatedAt": generated_at,
            "sourceUpdatedAt": {"sleeper": current_manifest["retrieved_at"]},
            "completeness": {
                "league": "complete",
                "rosters": "complete",
                "lineups": "complete" if current_lineup_rows else "not_applicable",
                "matchups": "complete" if current_lineup_rows else "not_applicable",
                "transactions": "complete",
                "draft": (
                    "complete"
                    if current_draft and current_draft["status"] == "complete"
                    else "partial"
                ),
            },
        },
        "league": {
            "name": league_config["league"]["name"],
            "platformName": current_league.get("name"),
            "season": current_season,
            "week": current_week,
            "phase": current_phase,
            "status": current_league.get("status"),
            "teamCount": current_league.get("total_rosters"),
            "leagueId": str(current["league_id"]),
        },
        "defendingChampion": defending["champion"],
        "lastFinal": {"season": defending["season"], "champion": defending["champion"], "runnerUp": defending["runnerUp"]},
        "teams": current_teams,
        "keeperStatus": {
            "maxPerTeam": (current_league.get("settings") or {}).get("max_keepers"),
            "submitted": submitted_keeper_count,
            "expected": len(current_teams) * int((current_league.get("settings") or {}).get("max_keepers") or 0),
            "teamsComplete": sum(
                1
                for team in current_teams
                if len(team["keepers"])
                == int((current_league.get("settings") or {}).get("max_keepers") or 0)
            ),
        },
        "draft": current_draft,
        "transactionStatus": {
            "recorded": len(current_transaction_rows),
            "completed": sum(1 for row in current_transaction_rows if row.get("status") == "complete"),
            "asOf": current_manifest["retrieved_at"],
        },
        "recentTransactions": recent_transactions,
        "currentWeekLineups": current_lineup_rows,
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
                    "teamName": owners.get(owner_uid, {}).get("public_alias") or team["team_name"],
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
            "url": f"/players/{row['playerUid']}",
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
            "Verify ESPN-era scoring settings before recomputing historical custom player points.",
        ],
    }
    emit("integrity/index.json", integrity, pretty=True)

    league_meta = {
        "schemaVersion": "3.0.0",
        "league": league_config["league"],
        "currentSeason": current_season,
        "currentWeek": current_week,
        "seasonPhase": current_phase,
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
            "currentWeek": current_week,
            "seasonPhase": current_phase,
            "leaguePlatform": current["platform"],
            "leagueId": str(current["league_id"]),
        },
        "seasons": [int(value) for value in seasons["season"].tolist()],
        "coverage": {str(row["season"]): row["completeness"] for row in history_seasons},
        "paths": {
            "current": "data/now/index.json",
            "seasonHub": "data/now/season-hub.json",
            "history": "data/history/index.json",
            "season": "data/seasons/{season}/index.json",
            "seasonMatchups": "data/seasons/{season}/matchups.json",
            "seasonFacts": "data/seasons/{season}/facts.json",
            "owners": "data/owners/index.json",
            "owner": "data/owners/{ownerUid}.json",
            "players": "data/players/index.json",
            "playerCareer": "data/players/{playerUid}/career.json",
            "playerSeason": "data/players/{playerUid}/{season}.json",
            "playerResolve": "data/players/resolve/{providerId}.json",
            "warRoom": "data/war-room/index.json",
            "editorial": "data/now/editorial.json",
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
