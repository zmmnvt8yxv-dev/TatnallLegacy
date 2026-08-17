#!/usr/bin/env python3
"""Publish the post-draft 2026 season hub from Sleeper-owned evidence."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

RAW = ROOT / "data" / "raw" / "sleeper" / "2026" / "current"
PUBLIC = ROOT / "public" / "data"
NORMALIZED = ROOT / "data" / "normalized"
LINEUP_RULES = {"QB": 2, "RB": 3, "WR": 3, "TE": 1, "K": 1, "DEF": 1}
FLEX_POSITIONS = {"RB", "WR", "TE"}
REQUIRED_LINEUP_SLOTS = ("QB1", "QB2", "RB1", "RB2", "RB3", "WR1", "WR2", "WR3", "TE", "FLEX1", "FLEX2", "K", "DEF")
CORE_POSITIONS = ("QB", "RB", "WR", "TE")
REPLACEMENT_POOL_SIZES = {"QB": 3, "RB": 5, "WR": 5, "TE": 3, "K": 3, "DEF": 3}
REPLACEMENT_LINEUP_COUNTS = {"QB": 2, "RB": 5, "WR": 5, "TE": 3, "K": 1, "DEF": 1}
POSITION_LABELS = {
    "QB": "quarterback room",
    "RB": "running back room",
    "WR": "receiver room",
    "TE": "tight end room",
    "K": "kicker slot",
    "DEF": "defense",
}


def _json(path: Path) -> Any:
    return json.loads(path.read_text())


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number


def _write(path: Path, payload: Any) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    path.write_text(text)
    return len(text.encode("utf-8"))


def _ordinal(value: int) -> str:
    if 10 <= value % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(value % 10, "th")
    return f"{value}{suffix}"


def sleeper_score(entry: dict[str, Any]) -> float:
    """Return Sleeper's official matchup total, including commissioner overrides."""
    custom = _number(entry.get("custom_points"))
    points = custom if custom is not None else (_number(entry.get("points")) or 0.0)
    return round(points, 2)


def sleeper_matchup_status(
    week: int,
    current_week: int,
    season_phase: str,
    entries: list[dict[str, Any]],
) -> str:
    """Classify an official matchup snapshot without treating future zeroes as scores."""
    if season_phase == "complete" or week < current_week:
        return "final"
    if season_phase == "pre" or week > current_week:
        return "scheduled"
    has_scoring = any(
        sleeper_score(entry) != 0
        or any(
            (_number(value) or 0.0) != 0
            for value in (entry.get("players_points") or {}).values()
        )
        for entry in entries
    )
    return "live" if has_scoring else "scheduled"


def optimize_lineup(
    players: list[dict[str, Any]],
    projected_points: dict[str, float | None],
    replacement_points: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Choose the best legal lineup, optionally including expected waiver replacements."""

    replacement_points = replacement_points or {}
    pool = [
        {
            **player,
            "projectedPoints": round(_number(projected_points.get(str(player["sleeperId"]))) or 0.0, 2),
            "pointsAboveExpectedReplacement": round(
                max(
                    (_number(projected_points.get(str(player["sleeperId"]))) or 0.0)
                    - replacement_points.get(str(player.get("position") or ""), 0.0),
                    0.0,
                ),
                2,
            ),
            "replacement": False,
        }
        for player in players
    ]
    if replacement_points:
        for position, count in REPLACEMENT_LINEUP_COUNTS.items():
            baseline = round(replacement_points.get(position, 0.0), 2)
            for index in range(1, count + 1):
                pool.append(
                    {
                        "playerUid": None,
                        "sleeperId": f"replacement-{position.lower()}-{index}",
                        "name": f"Expected {position} replacement",
                        "position": position,
                        "nflTeam": None,
                        "starter": False,
                        "keeper": False,
                        "injuryStatus": None,
                        "nflStatus": None,
                        "weekOneProjection": baseline,
                        "regularSeasonProjection": 0.0,
                        "lineupPointsAboveExpectedReplacement": 0.0,
                        "projectedStarts": 0,
                        "draftPrice": None,
                        "projectedPoints": baseline,
                        "pointsAboveExpectedReplacement": 0.0,
                        "replacement": True,
                    }
                )
    pool.sort(
        key=lambda row: (
            -row["projectedPoints"],
            bool(row.get("replacement")),
            row.get("name") or "",
            row["sleeperId"],
        )
    )
    selected: set[str] = set()
    lineup: list[dict[str, Any]] = []

    def take(position: str, count: int, *, eligible: set[str] | None = None) -> None:
        candidates = [
            row
            for row in pool
            if row["sleeperId"] not in selected
            and (row.get("position") == position if eligible is None else row.get("position") in eligible)
        ]
        for index, row in enumerate(candidates[:count], start=1):
            selected.add(row["sleeperId"])
            lineup.append({**row, "slot": f"{position}{index}" if count > 1 else position})

    for position, count in LINEUP_RULES.items():
        take(position, count)
    take("FLEX", 2, eligible=FLEX_POSITIONS)
    slot_order = {"QB": 1, "RB": 2, "WR": 3, "TE": 4, "FLEX": 5, "K": 6, "DEF": 7}
    lineup.sort(key=lambda row: (slot_order.get("".join(filter(str.isalpha, row["slot"])), 99), row["slot"]))
    return lineup


def build_replacement_baselines(
    projection_by_week: dict[int, dict[str, float | None]],
    player_snapshot: dict[str, dict[str, Any]],
    rostered_player_ids: set[str],
    regular_end: int,
) -> dict[int, dict[str, float]]:
    """Return the median of each week's strongest immediately available options."""

    baselines: dict[int, dict[str, float]] = {}
    for week in range(1, regular_end + 1):
        candidates: dict[str, list[float]] = defaultdict(list)
        for player_id, value in projection_by_week.get(week, {}).items():
            points = _number(value)
            if player_id in rostered_player_ids or points is None or points <= 0:
                continue
            position = str((player_snapshot.get(player_id) or {}).get("position") or "")
            if position in REPLACEMENT_POOL_SIZES:
                candidates[position].append(points)

        week_baselines: dict[str, float] = {}
        for position, pool_size in REPLACEMENT_POOL_SIZES.items():
            top_available = sorted(candidates[position], reverse=True)[:pool_size]
            if not top_available:
                week_baselines[position] = 0.0
                continue
            midpoint = len(top_available) // 2
            if len(top_available) % 2:
                expected = top_available[midpoint]
            else:
                expected = (top_available[midpoint - 1] + top_available[midpoint]) / 2
            week_baselines[position] = round(expected, 2)
        baselines[week] = week_baselines
    return baselines


def _rank(values: dict[int, float], *, reverse: bool = True) -> dict[int, int]:
    ordered = sorted(values, key=lambda key: ((-values[key]) if reverse else values[key], key))
    return {key: index for index, key in enumerate(ordered, start=1)}


def _team_ref(team: dict[str, Any]) -> dict[str, Any]:
    return {
        "rosterId": team["rosterId"],
        "ownerUid": team["ownerUid"],
        "ownerName": team["ownerName"],
        "teamName": team["teamName"],
        "monogram": team.get("monogram") or "TL",
        "accent": team.get("accent") or "#d7a928",
    }


def build_payload() -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    manifest = _json(RAW / "manifest.json")
    projections_raw = _json(RAW / "projections.json")
    replacement_pool_path = RAW / "replacement_pool.json"
    replacement_pool_raw = _json(replacement_pool_path) if replacement_pool_path.exists() else {}
    matchups_raw = _json(RAW / "matchups.json")
    drafts = _json(RAW / "drafts.json")
    draft_pick_map = _json(RAW / "draft_picks.json")
    player_snapshot = (_json(ROOT / "data" / "raw" / "sleeper" / "players" / "current.json").get("players") or {})
    now = _json(PUBLIC / "now" / "index.json")
    current_week = int(manifest.get("current_week") or 1)
    season_phase = str(manifest.get("season_phase") or "pre")

    draft = max(drafts, key=lambda row: int(row.get("created") or 0))
    draft_id = str(draft["draft_id"])
    draft_picks = sorted(draft_pick_map.get(draft_id) or [], key=lambda row: int(row.get("pick_no") or 0))
    picks_by_roster: dict[int, list[dict[str, Any]]] = defaultdict(list)
    picks_by_player: dict[str, dict[str, Any]] = {}
    for pick in draft_picks:
        roster_id = int(pick.get("roster_id") or 0)
        picks_by_roster[roster_id].append(pick)
        picks_by_player[str(pick.get("player_id") or "")] = pick

    projection_by_week: dict[int, dict[str, float | None]] = {}
    projection_context: dict[tuple[int, str], dict[str, Any]] = {}
    projection_providers: set[str] = set()
    projection_updates: list[int] = []
    published_projection_count = 0
    projection_pool_count = 0
    rostered_player_ids = {
        str(player["sleeperId"])
        for team in now["teams"]
        for player in team["players"]
    }
    for week_text, rows in projections_raw.get("weeks", {}).items():
        week = int(week_text)
        projection_by_week[week] = {}
        for row in rows:
            player_id = str(row.get("player_id") or "")
            points = _number(row.get("pts_half_ppr"))
            projection_by_week[week][player_id] = points
            projection_context[(week, player_id)] = row
            if points is not None:
                projection_pool_count += 1
                if player_id in rostered_player_ids:
                    published_projection_count += 1
            if row.get("company"):
                projection_providers.add(str(row["company"]))
            if row.get("updated_at"):
                projection_updates.append(int(row["updated_at"]))
    projection_pool_count = int(replacement_pool_raw.get("published_values") or projection_pool_count)

    replacement_projection_by_week: dict[int, dict[str, float | None]] = {}
    for week_text, positions in replacement_pool_raw.get("weeks", {}).items():
        week = int(week_text)
        replacement_projection_by_week[week] = {}
        for rows in positions.values():
            for row in rows:
                replacement_projection_by_week[week][str(row.get("player_id") or "")] = _number(
                    row.get("pts_half_ppr")
                )

    player_ids = pd.read_parquet(NORMALIZED / "player_ids.parquet")
    sleeper_to_uid = dict(
        zip(
            player_ids[player_ids["id_type"] == "sleeper"]["id_value"].astype(str),
            player_ids[player_ids["id_type"] == "sleeper"]["player_uid"].astype(str),
        )
    )

    teams = [{**team} for team in now["teams"]]
    teams_by_roster = {int(team["rosterId"]): team for team in teams}
    team_week_totals: dict[int, dict[int, float]] = defaultdict(dict)
    team_week_paer: dict[int, dict[int, float]] = defaultdict(dict)
    team_week_lineups: dict[int, dict[int, list[dict[str, Any]]]] = defaultdict(dict)
    position_totals: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    position_paer_totals: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    regular_end = int(manifest["regular_season_end_week"])
    replacement_baselines = build_replacement_baselines(
        replacement_projection_by_week or projection_by_week,
        player_snapshot,
        rostered_player_ids,
        regular_end,
    )
    for team in teams:
        roster_id = int(team["rosterId"])
        keeper_ids = {
            str(pick.get("player_id") or "")
            for pick in picks_by_roster[roster_id]
            if pick.get("is_keeper")
        }
        enriched_players: list[dict[str, Any]] = []
        for player in team["players"]:
            sleeper_id = str(player["sleeperId"])
            source = player_snapshot.get(sleeper_id) or {}
            pick = picks_by_player.get(sleeper_id) or {}
            season_projection = sum(
                _number(projection_by_week.get(week, {}).get(sleeper_id)) or 0.0
                for week in range(1, regular_end + 1)
            )
            season_paer = sum(
                max(
                    (_number(projection_by_week.get(week, {}).get(sleeper_id)) or 0.0)
                    - replacement_baselines[week].get(str(player.get("position") or ""), 0.0),
                    0.0,
                )
                for week in range(1, regular_end + 1)
            )
            enriched_players.append(
                {
                    **player,
                    "playerUid": player.get("playerUid") or sleeper_to_uid.get(sleeper_id),
                    "keeper": sleeper_id in keeper_ids,
                    "injuryStatus": source.get("injury_status"),
                    "nflStatus": source.get("status"),
                    "weekOneProjection": round(_number(projection_by_week.get(1, {}).get(sleeper_id)) or 0.0, 2),
                    "regularSeasonProjection": round(season_projection, 2),
                    "pointsAboveExpectedReplacement": round(season_paer, 2),
                    "lineupPointsAboveExpectedReplacement": 0.0,
                    "projectedStarts": 0,
                    "draftPrice": _number((pick.get("metadata") or {}).get("amount")),
                }
            )
        lineup_paer_by_player: dict[str, float] = defaultdict(float)
        starts_by_player: dict[str, int] = defaultdict(int)
        for week in range(1, regular_end + 1):
            lineup = optimize_lineup(
                enriched_players,
                projection_by_week.get(week, {}),
                replacement_baselines[week],
            )
            team_week_lineups[roster_id][week] = lineup
            team_week_totals[roster_id][week] = round(sum(row["projectedPoints"] for row in lineup), 2)
            team_week_paer[roster_id][week] = round(
                sum(row["pointsAboveExpectedReplacement"] for row in lineup),
                2,
            )
            for row in lineup:
                position_totals[roster_id][str(row.get("position") or "UNK")] += row["projectedPoints"]
                if not row.get("replacement"):
                    player_id = str(row["sleeperId"])
                    paer = float(row["pointsAboveExpectedReplacement"])
                    position_paer_totals[roster_id][str(row.get("position") or "UNK")] += paer
                    lineup_paer_by_player[player_id] += paer
                    starts_by_player[player_id] += 1
        week_one_ids = {row["sleeperId"] for row in team_week_lineups[roster_id][1]}
        for player in enriched_players:
            player["projectedWeekOneStarter"] = player["sleeperId"] in week_one_ids
            player["lineupPointsAboveExpectedReplacement"] = round(
                lineup_paer_by_player[player["sleeperId"]],
                2,
            )
            player["projectedStarts"] = starts_by_player[player["sleeperId"]]
        enriched_players.sort(
            key=lambda row: (
                not row["projectedWeekOneStarter"],
                -(row["weekOneProjection"] or 0),
                row.get("position") or "",
                row["name"],
            )
        )
        team["players"] = enriched_players
        team["keepers"] = [row for row in enriched_players if row["keeper"]]

    schedule: list[dict[str, Any]] = []
    projected_records: dict[int, dict[str, int]] = {
        roster_id: {"wins": 0, "losses": 0, "ties": 0}
        for roster_id in teams_by_roster
    }
    opponent_totals: dict[int, list[float]] = defaultdict(list)
    for week in range(1, regular_end + 1):
        grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for entry in matchups_raw.get(str(week)) or []:
            grouped[int(entry.get("matchup_id") or 0)].append(entry)
        matchup_rows: list[dict[str, Any]] = []
        for matchup_id, matchup_entries in sorted(grouped.items()):
            if len(matchup_entries) != 2:
                continue
            entries_by_roster = {
                int(entry.get("roster_id") or 0): entry for entry in matchup_entries
            }
            roster_a, roster_b = sorted(entries_by_roster)
            points_a = team_week_totals[roster_a][week]
            points_b = team_week_totals[roster_b][week]
            sleeper_status = sleeper_matchup_status(
                week,
                current_week,
                season_phase,
                matchup_entries,
            )
            sleeper_a = (
                sleeper_score(entries_by_roster[roster_a])
                if sleeper_status != "scheduled"
                else None
            )
            sleeper_b = (
                sleeper_score(entries_by_roster[roster_b])
                if sleeper_status != "scheduled"
                else None
            )
            sleeper_winner = None
            if sleeper_a is not None and sleeper_b is not None and sleeper_a != sleeper_b:
                sleeper_winner = roster_a if sleeper_a > sleeper_b else roster_b
            opponent_totals[roster_a].append(points_b)
            opponent_totals[roster_b].append(points_a)
            if points_a == points_b:
                projected_records[roster_a]["ties"] += 1
                projected_records[roster_b]["ties"] += 1
                favorite = None
            elif points_a > points_b:
                projected_records[roster_a]["wins"] += 1
                projected_records[roster_b]["losses"] += 1
                favorite = roster_a
            else:
                projected_records[roster_b]["wins"] += 1
                projected_records[roster_a]["losses"] += 1
                favorite = roster_b
            matchup_rows.append(
                {
                    "matchupId": matchup_id,
                    "teamA": _team_ref(teams_by_roster[roster_a]),
                    "teamB": _team_ref(teams_by_roster[roster_b]),
                    "projectedA": points_a,
                    "projectedB": points_b,
                    "projectedFavoriteRosterId": favorite,
                    "projectedMargin": round(abs(points_a - points_b), 2),
                    "sleeperScoreA": sleeper_a,
                    "sleeperScoreB": sleeper_b,
                    "sleeperWinnerRosterId": sleeper_winner,
                    "sleeperMargin": (
                        round(abs(sleeper_a - sleeper_b), 2)
                        if sleeper_a is not None and sleeper_b is not None
                        else None
                    ),
                    "sleeperStatus": sleeper_status,
                }
            )
        schedule.append({"week": week, "matchups": matchup_rows})

    projected_season = {
        roster_id: round(sum(weeks.values()), 2)
        for roster_id, weeks in team_week_totals.items()
    }
    projected_season_paer = {
        roster_id: round(sum(weeks.values()), 2)
        for roster_id, weeks in team_week_paer.items()
    }
    projection_ranks = _rank(projected_season_paer)
    projected_weekly_average = {
        roster_id: round(total / regular_end, 2)
        for roster_id, total in projected_season.items()
    }
    schedule_average = {
        roster_id: round(sum(values) / len(values), 2) if values else 0.0
        for roster_id, values in opponent_totals.items()
    }
    schedule_ranks = _rank(schedule_average)
    position_ranks: dict[str, dict[int, int]] = {}
    for position in POSITION_LABELS:
        position_ranks[position] = _rank(
            {
                roster_id: position_paer_totals[roster_id].get(position, 0.0) / regular_end
                for roster_id in teams_by_roster
            }
        )

    projected_all_play: dict[int, float] = defaultdict(float)
    for week in range(1, regular_end + 1):
        for roster_id, totals in team_week_totals.items():
            value = totals[week]
            peers = [other[week] for other_id, other in team_week_totals.items() if other_id != roster_id]
            projected_all_play[roster_id] += sum(value > peer for peer in peers) + 0.5 * sum(value == peer for peer in peers)

    grade_by_rank = {1: "A", 2: "A−", 3: "B+", 4: "B", 5: "B−", 6: "C+", 7: "C", 8: "C−"}
    tier_by_rank = {
        1: "Preseason favorite",
        2: "Preseason favorite",
        3: "Playoff contender",
        4: "Playoff contender",
        5: "Playoff contender",
        6: "Needs the variance",
        7: "Needs the variance",
        8: "Needs the variance",
    }
    for team in teams:
        roster_id = int(team["rosterId"])
        core_ranks = {position: position_ranks[position][roster_id] for position in CORE_POSITIONS}
        strength_position = min(core_ranks, key=lambda position: (core_ranks[position], position))
        concern_position = max(core_ranks, key=lambda position: (core_ranks[position], position))
        rank = projection_ranks[roster_id]
        schedule_rank = schedule_ranks[roster_id]
        record = projected_records[roster_id]
        record_label = f"{record['wins']}-{record['losses']}"
        if record["ties"]:
            record_label += f"-{record['ties']}"
        schedule_label = "league's toughest" if schedule_rank == 1 else (
            "league's second-toughest" if schedule_rank == 2 else (
                "league's lightest" if schedule_rank == 8 else f"{_ordinal(schedule_rank)}-toughest"
            )
        )
        team_picks = picks_by_roster[roster_id]
        non_keeper_picks = [pick for pick in team_picks if not pick.get("is_keeper")]
        largest = max(
            non_keeper_picks,
            key=lambda pick: (_number((pick.get("metadata") or {}).get("amount")) or 0.0, -int(pick.get("pick_no") or 0)),
            default=None,
        )
        spend = int(sum(_number((pick.get("metadata") or {}).get("amount")) or 0.0 for pick in team_picks))
        keeper_spend = int(sum(_number((pick.get("metadata") or {}).get("amount")) or 0.0 for pick in team_picks if pick.get("is_keeper")))
        projected_players = sorted(
            team["players"],
            key=lambda row: (
                -row["lineupPointsAboveExpectedReplacement"],
                -row["pointsAboveExpectedReplacement"],
                -row["regularSeasonProjection"],
                row["name"],
            ),
        )
        position_groups = [
            {
                "position": position,
                "rank": position_ranks[position][roster_id],
                "projectedWeeklyPoints": round(position_totals[roster_id].get(position, 0.0) / regular_end, 2),
                "pointsAboveExpectedReplacement": round(
                    position_paer_totals[roster_id].get(position, 0.0) / regular_end,
                    2,
                ),
            }
            for position in POSITION_LABELS
        ]
        injury_count = sum(bool(player.get("injuryStatus")) for player in team["players"])
        team["analysis"] = {
            "projectionRank": rank,
            "grade": grade_by_rank[rank],
            "tier": tier_by_rank[rank],
            "projectedRegularSeasonPoints": projected_season[roster_id],
            "projectedWeeklyAverage": projected_weekly_average[roster_id],
            "pointsAboveExpectedReplacement": projected_season_paer[roster_id],
            "pointsAboveExpectedReplacementPerWeek": round(projected_season_paer[roster_id] / regular_end, 2),
            "projectedAllPlayWins": round(projected_all_play[roster_id], 1),
            "projectedRecord": record,
            "scheduleStrengthRank": schedule_rank,
            "opponentProjectedAverage": schedule_average[roster_id],
            "strength": {
                "position": strength_position,
                "rank": core_ranks[strength_position],
                "label": POSITION_LABELS[strength_position],
            },
            "concern": {
                "position": concern_position,
                "rank": core_ranks[concern_position],
                "label": POSITION_LABELS[concern_position],
            },
            "headline": f"The {POSITION_LABELS[strength_position]} sets the ceiling.",
            "overview": (
                f"{team['teamName']} opens {_ordinal(rank)} in the lineup-value model at "
                f"{projected_season_paer[roster_id] / regular_end:.1f} points above expected replacement per week. "
                f"The {POSITION_LABELS[strength_position]} "
                f"projects {_ordinal(core_ranks[strength_position])} in the league, while the {POSITION_LABELS[concern_position]} "
                f"enters {_ordinal(core_ranks[concern_position])}. Sleeper's schedule gives this roster the {schedule_label} "
                f"slate, producing a {record_label} "
                "projection if every weekly number held."
            ),
            "positionGroups": position_groups,
            "weekOneLineup": team_week_lineups[roster_id][1],
            "weeklyLineups": [
                {
                    "week": week,
                    "projectedPoints": team_week_totals[roster_id][week],
                    "players": [
                        {
                            "playerUid": player.get("playerUid"),
                            "sleeperId": player["sleeperId"],
                            "name": player["name"],
                            "position": player.get("position"),
                            "nflTeam": player.get("nflTeam"),
                            "projectedPoints": player["projectedPoints"],
                            "paer": player["pointsAboveExpectedReplacement"],
                            **({"replacement": True} if player.get("replacement") else {}),
                            "slot": player["slot"],
                        }
                        for player in team_week_lineups[roster_id][week]
                    ],
                }
                for week in range(1, regular_end + 1)
            ],
            "openLineupSlots": [
                slot
                for slot in REQUIRED_LINEUP_SLOTS
                if slot not in {row["slot"] for row in team_week_lineups[roster_id][1]}
            ],
            "topProjectedPlayers": [
                {
                    "playerUid": player.get("playerUid"),
                    "sleeperId": player["sleeperId"],
                    "name": player["name"],
                    "position": player.get("position"),
                    "projectedPoints": player["regularSeasonProjection"],
                    "pointsAboveExpectedReplacement": player["lineupPointsAboveExpectedReplacement"],
                }
                for player in projected_players[:3]
            ],
            "injuryFlags": injury_count,
        }
        largest_metadata = (largest or {}).get("metadata") or {}
        team["draftRecap"] = {
            "picks": len(team_picks),
            "spend": spend,
            "unspent": max(200 - spend, 0),
            "keeperSpend": keeper_spend,
            "auctionSpend": spend - keeper_spend,
            "largestPurchase": (
                {
                    "playerUid": sleeper_to_uid.get(str(largest.get("player_id") or "")),
                    "sleeperId": str(largest.get("player_id") or ""),
                    "name": f"{largest_metadata.get('first_name', '')} {largest_metadata.get('last_name', '')}".strip(),
                    "amount": int(_number(largest_metadata.get("amount")) or 0),
                }
                if largest
                else None
            ),
        }

    teams.sort(key=lambda team: team["analysis"]["projectionRank"])
    expected_projection_count = sum(len(team["players"]) for team in teams) * regular_end
    projection_updated_at = (
        datetime.fromtimestamp(max(projection_updates) / 1000, tz=timezone.utc).isoformat()
        if projection_updates
        else manifest["retrieved_at"]
    )
    payload = {
        "meta": {
            "schemaVersion": "3.1.0",
            "generatedAt": generated_at,
            "sleeperSnapshotAt": manifest["retrieved_at"],
            "season": 2026,
            "leagueId": str(manifest["league_id"]),
            "currentWeek": current_week,
            "seasonPhase": season_phase,
            "status": "post_draft" if draft.get("status") == "complete" else str(draft.get("status") or "unknown"),
        },
        "actualSource": {
            "label": "Sleeper official matchup scores",
            "snapshotAt": manifest["retrieved_at"],
            "endpointTemplate": f"https://api.sleeper.app/v1/league/{manifest['league_id']}/matchups/{{week}}",
            "refreshMode": "Current-week pages poll Sleeper directly every 60 seconds and retain this deployment snapshot as a fallback.",
        },
        "projectionSource": {
            "label": "Sleeper weekly projections",
            "provider": ", ".join(sorted(projection_providers)) or "as returned by Sleeper",
            "scoringField": str(projections_raw.get("scoring") or "pts_half_ppr"),
            "seasonType": str(projections_raw.get("season_type") or "regular"),
            "updatedAt": projection_updated_at,
            "publishedValues": published_projection_count,
            "projectionPoolValues": projection_pool_count,
            "expectedRosterWeeks": expected_projection_count,
            "coveragePct": round(published_projection_count / expected_projection_count, 4) if expected_projection_count else 0.0,
            "method": "Sleeper's published half-PPR points remain the scoring input. Player and roster value are ranked by weekly points above the expected unrostered replacement at each position, and team totals choose the best legal lineup from rostered players plus replacement-level waiver options.",
            "coverageNote": "A blank Sleeper value remains zero; expected replacement is the median of the strongest projected unrostered options in each weekly position pool.",
        },
        "replacementModel": {
            "label": "Points above expected replacement",
            "poolMethod": "Weekly median of the strongest projected unrostered players by position",
            "poolSizes": REPLACEMENT_POOL_SIZES,
            "weeklyBaselines": [
                {"week": week, **replacement_baselines[week]}
                for week in range(1, regular_end + 1)
            ],
        },
        "draft": {
            "draftId": draft_id,
            "status": draft.get("status"),
            "completedAt": (
                datetime.fromtimestamp(int(draft.get("last_picked") or 0) / 1000, tz=timezone.utc).isoformat()
                if draft.get("last_picked")
                else None
            ),
            "pickCount": len(draft_picks),
            "totalSpend": int(sum(team["draftRecap"]["spend"] for team in teams)),
            "unspent": int(sum(team["draftRecap"]["unspent"] for team in teams)),
            "sleeperUrl": f"https://sleeper.com/draft/nfl/{draft_id}",
        },
        "regularSeason": {
            "startWeek": 1,
            "endWeek": regular_end,
            "scheduleSource": "Sleeper league matchup endpoints",
            "matchupCount": sum(len(week["matchups"]) for week in schedule),
        },
        "teams": teams,
        "schedule": schedule,
    }
    return payload


def main() -> None:
    payload = build_payload()
    size = _write(PUBLIC / "now" / "season-hub.json", payload)
    if size >= 500_000:
        raise ValueError(f"Season hub exceeds 500 KB: {size}")
    print(
        f"Published 2026 season hub: {len(payload['teams'])} teams, "
        f"{payload['regularSeason']['matchupCount']} matchups, {size / 1024:.1f} KB"
    )


if __name__ == "__main__":
    main()
