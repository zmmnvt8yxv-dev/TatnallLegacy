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


def optimize_lineup(
    players: list[dict[str, Any]],
    projected_points: dict[str, float | None],
) -> list[dict[str, Any]]:
    """Choose the best legal Tatnall lineup from unchanged Sleeper values."""

    pool = [
        {
            **player,
            "projectedPoints": round(_number(projected_points.get(str(player["sleeperId"]))) or 0.0, 2),
        }
        for player in players
    ]
    pool.sort(key=lambda row: (-row["projectedPoints"], row.get("name") or "", row["sleeperId"]))
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
    matchups_raw = _json(RAW / "matchups.json")
    drafts = _json(RAW / "drafts.json")
    draft_pick_map = _json(RAW / "draft_picks.json")
    player_snapshot = (_json(ROOT / "data" / "raw" / "sleeper" / "players" / "current.json").get("players") or {})
    now = _json(PUBLIC / "now" / "index.json")

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
    for week_text, rows in projections_raw.get("weeks", {}).items():
        week = int(week_text)
        projection_by_week[week] = {}
        for row in rows:
            player_id = str(row.get("player_id") or "")
            points = _number(row.get("pts_half_ppr"))
            projection_by_week[week][player_id] = points
            projection_context[(week, player_id)] = row
            if points is not None:
                published_projection_count += 1
            if row.get("company"):
                projection_providers.add(str(row["company"]))
            if row.get("updated_at"):
                projection_updates.append(int(row["updated_at"]))

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
    team_week_lineups: dict[int, dict[int, list[dict[str, Any]]]] = defaultdict(dict)
    position_totals: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    regular_end = int(manifest["regular_season_end_week"])
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
            enriched_players.append(
                {
                    **player,
                    "playerUid": player.get("playerUid") or sleeper_to_uid.get(sleeper_id),
                    "keeper": sleeper_id in keeper_ids,
                    "injuryStatus": source.get("injury_status"),
                    "nflStatus": source.get("status"),
                    "weekOneProjection": round(_number(projection_by_week.get(1, {}).get(sleeper_id)) or 0.0, 2),
                    "regularSeasonProjection": round(season_projection, 2),
                    "draftPrice": _number((pick.get("metadata") or {}).get("amount")),
                }
            )
        for week in range(1, regular_end + 1):
            lineup = optimize_lineup(enriched_players, projection_by_week.get(week, {}))
            team_week_lineups[roster_id][week] = lineup
            team_week_totals[roster_id][week] = round(sum(row["projectedPoints"] for row in lineup), 2)
            for row in lineup:
                position_totals[roster_id][str(row.get("position") or "UNK")] += row["projectedPoints"]
        week_one_ids = {row["sleeperId"] for row in team_week_lineups[roster_id][1]}
        for player in enriched_players:
            player["projectedWeekOneStarter"] = player["sleeperId"] in week_one_ids
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
        grouped: dict[int, list[int]] = defaultdict(list)
        for entry in matchups_raw.get(str(week)) or []:
            grouped[int(entry.get("matchup_id") or 0)].append(int(entry.get("roster_id") or 0))
        matchup_rows: list[dict[str, Any]] = []
        for matchup_id, roster_ids in sorted(grouped.items()):
            if len(roster_ids) != 2:
                continue
            roster_a, roster_b = sorted(roster_ids)
            points_a = team_week_totals[roster_a][week]
            points_b = team_week_totals[roster_b][week]
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
                }
            )
        schedule.append({"week": week, "matchups": matchup_rows})

    projected_season = {
        roster_id: round(sum(weeks.values()), 2)
        for roster_id, weeks in team_week_totals.items()
    }
    projection_ranks = _rank(projected_season)
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
                roster_id: position_totals[roster_id].get(position, 0.0) / regular_end
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
        projected_players = sorted(team["players"], key=lambda row: (-row["regularSeasonProjection"], row["name"]))
        position_groups = [
            {
                "position": position,
                "rank": position_ranks[position][roster_id],
                "projectedWeeklyPoints": round(position_totals[roster_id].get(position, 0.0) / regular_end, 2),
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
                f"{team['teamName']} opens {_ordinal(rank)} in the Sleeper projection table at "
                f"{projected_weekly_average[roster_id]:.1f} points per week. The {POSITION_LABELS[strength_position]} "
                f"projects {_ordinal(core_ranks[strength_position])} in the league, while the {POSITION_LABELS[concern_position]} "
                f"enters {_ordinal(core_ranks[concern_position])}. Sleeper's schedule gives this roster the {schedule_label} "
                f"slate, producing a {record_label} "
                "projection if every weekly number held."
            ),
            "positionGroups": position_groups,
            "weekOneLineup": team_week_lineups[roster_id][1],
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
            "status": "post_draft" if draft.get("status") == "complete" else str(draft.get("status") or "unknown"),
        },
        "projectionSource": {
            "label": "Sleeper weekly projections",
            "provider": ", ".join(sorted(projection_providers)) or "as returned by Sleeper",
            "scoringField": str(projections_raw.get("scoring") or "pts_half_ppr"),
            "seasonType": str(projections_raw.get("season_type") or "regular"),
            "updatedAt": projection_updated_at,
            "publishedValues": published_projection_count,
            "expectedRosterWeeks": expected_projection_count,
            "coveragePct": round(published_projection_count / expected_projection_count, 4) if expected_projection_count else 0.0,
            "method": "Player values are Sleeper's published pts_half_ppr field, unchanged. Team totals select the highest-projected legal Tatnall lineup each week; no injury penalty or private projection is added.",
            "coverageNote": "A blank Sleeper value remains zero in the weekly total; most blanks are scheduled NFL bye weeks.",
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
