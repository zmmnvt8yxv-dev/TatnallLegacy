"""Build canonical Tatnall league-history tables from checked-in evidence."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

import yaml

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.lib.canonical_ids import CanonicalIds
from scripts.normalize.corrections import (
    AppliedCorrection,
    apply_corrections_with_report,
    load_corrections,
)


ROOT = Path(__file__).resolve().parents[2]
LEAGUE_CONFIG = ROOT / "data" / "config" / "league.yml"
OWNERS_CONFIG = ROOT / "data" / "config" / "owners.yml"
FRANCHISES_CONFIG = ROOT / "data" / "config" / "franchises.yml"
HISTORY_SOURCE = ROOT / "data" / "manual_league_history.json"
SLEEPER_FINAL_ROOT = ROOT / "data" / "raw" / "sleeper"
CORRECTION_FILES = (
    ROOT / "data" / "corrections" / "season_results.yml",
    ROOT / "data" / "corrections" / "matchup_results.yml",
)


class NormalizationError(ValueError):
    """Raised when source evidence cannot be normalized without guessing."""


@dataclass(frozen=True)
class CanonicalHistory:
    seasons: list[dict[str, Any]]
    owners: list[dict[str, Any]]
    franchises: list[dict[str, Any]]
    team_seasons: list[dict[str, Any]]
    matchups: list[dict[str, Any]]
    playoff_games: list[dict[str, Any]]
    lineups: list[dict[str, Any]]
    lineup_entries: list[dict[str, Any]]
    transactions: list[dict[str, Any]]
    transaction_assets: list[dict[str, Any]]
    drafts: list[dict[str, Any]]
    draft_picks: list[dict[str, Any]]
    corrections: tuple[AppliedCorrection, ...]
    verification: dict[str, Any]


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def read_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = yaml.safe_load(handle)
    if not isinstance(value, dict):
        raise NormalizationError(f"Expected a YAML mapping: {path}")
    return value


def configured_league_id(config: Mapping[str, Any], season: int) -> str:
    platforms = config.get("platforms") or {}
    if season <= 2024:
        value = (platforms.get("espn") or {}).get("league_id")
    else:
        value = ((platforms.get("sleeper") or {}).get("league_ids") or {}).get(
            str(season)
        )
    if not value:
        raise NormalizationError(f"No configured provider league ID for {season}")
    return str(value)


def normalize_label(value: Any) -> str:
    """Normalize provider labels only for explicit alias lookup."""
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.casefold().replace("&", " and ")
    text = re.sub(r"[^a-z0-9@]+", " ", text)
    return " ".join(text.split())


def finite_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def parse_record(value: Any) -> tuple[int | None, int | None, int | None]:
    match = re.fullmatch(r"\s*(\d+)\s*[-–]\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*", str(value or ""))
    if not match:
        return None, None, None
    return int(match.group(1)), int(match.group(2)), int(match.group(3) or 0)


def sleeper_points(settings: Mapping[str, Any], prefix: str) -> float | None:
    whole = finite_number(settings.get(prefix))
    if whole is None:
        return None
    decimal = finite_number(settings.get(f"{prefix}_decimal")) or 0.0
    return whole + decimal / 100.0


def sleeper_final_payload(
    root: Path, season: int, history: Mapping[str, Any]
) -> dict[str, Any] | None:
    """Convert a checked-in final Sleeper snapshot into the history contract."""
    snapshot = root / "data" / "raw" / "sleeper" / str(season) / "final"
    required = ("league", "users", "rosters", "matchups", "winners_bracket")
    if not snapshot.exists() or any(not (snapshot / f"{name}.json").exists() for name in required):
        return None

    league = read_json(snapshot / "league.json")
    users = read_json(snapshot / "users.json")
    rosters = read_json(snapshot / "rosters.json")
    raw_matchups = read_json(snapshot / "matchups.json")
    winners_bracket = read_json(snapshot / "winners_bracket.json")
    losers_bracket = read_json(snapshot / "losers_bracket.json")
    users_by_id = {str(row.get("user_id")): row for row in users}

    def points_for(roster: Mapping[str, Any]) -> float:
        return sleeper_points(roster.get("settings") or {}, "fpts") or 0.0

    ranked_rosters = sorted(
        rosters,
        key=lambda row: (
            -int((row.get("settings") or {}).get("wins") or 0),
            -points_for(row),
            int(row.get("roster_id") or 0),
        ),
    )
    rank_by_roster = {
        int(row["roster_id"]): rank for rank, row in enumerate(ranked_rosters, start=1)
    }
    teams = []
    for roster in rosters:
        roster_id = int(roster["roster_id"])
        user = users_by_id.get(str(roster.get("owner_id")), {})
        user_metadata = user.get("metadata") or {}
        teams.append(
            {
                **roster,
                "owner_id": roster.get("owner_id"),
                "display_name": user.get("display_name"),
                "username": user.get("display_name"),
                "team_name": user_metadata.get("team_name")
                or user.get("display_name")
                or f"Roster {roster_id}",
                "regular_season_rank": rank_by_roster[roster_id],
            }
        )

    playoff_start = int((league.get("settings") or {}).get("playoff_week_start") or 15)
    bracket_types: dict[tuple[int, tuple[int, int]], str] = {}
    finish_by_roster: dict[int, int] = {}
    finish_labels = {1: "championship", 3: "third_place", 5: "fifth_place"}
    for game in winners_bracket:
        if not isinstance(game, dict) or game.get("t1") is None or game.get("t2") is None:
            continue
        week = playoff_start + int(game.get("r") or 1) - 1
        pair = tuple(sorted((int(game["t1"]), int(game["t2"]))))
        placement = game.get("p")
        if placement is not None:
            matchup_type = finish_labels.get(int(placement), "placement")
            if game.get("w") is not None:
                finish_by_roster[int(game["w"])] = int(placement)
            if game.get("l") is not None:
                finish_by_roster[int(game["l"])] = int(placement) + 1
        else:
            matchup_type = (
                "playoff_quarterfinal" if int(game.get("r") or 1) == 1 else "playoff_semifinal"
            )
        bracket_types[(week, pair)] = matchup_type
    for game in losers_bracket:
        if not isinstance(game, dict) or game.get("t1") is None or game.get("t2") is None:
            continue
        week = playoff_start + int(game.get("r") or 1) - 1
        pair = tuple(sorted((int(game["t1"]), int(game["t2"]))))
        bracket_types[(week, pair)] = "kilt_bowl_game"

    final_week = int(max(history.get(str(season), {}).get("playoff_weeks") or [17]))
    matchups = []
    for week_text, entries in sorted(raw_matchups.items(), key=lambda item: int(item[0])):
        week = int(week_text)
        if week < 1 or week > final_week:
            continue
        grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for entry in entries:
            if entry.get("matchup_id") is not None:
                grouped[int(entry["matchup_id"])].append(entry)
        for matchup_id, pair_rows in sorted(grouped.items()):
            if len(pair_rows) != 2:
                raise NormalizationError(
                    f"Sleeper {season} week {week} matchup {matchup_id} has {len(pair_rows)} teams"
                )
            home, away = sorted(pair_rows, key=lambda row: int(row["roster_id"]))
            roster_pair = tuple(sorted((int(home["roster_id"]), int(away["roster_id"]))))
            matchups.append(
                {
                    "week": week,
                    "matchup_id": matchup_id,
                    "home_roster_id": int(home["roster_id"]),
                    "away_roster_id": int(away["roster_id"]),
                    "home_score": home.get("points"),
                    "away_score": away.get("points"),
                    "matchup_type": bracket_types.get((week, roster_pair)),
                }
            )

    return {
        "league_id": str(league.get("league_id")),
        "season": season,
        "teams": teams,
        "matchups": matchups,
        "_provider_finishes": finish_by_roster,
        "_source": f"data/raw/sleeper/{season}/final",
    }


class OwnerDirectory:
    def __init__(self, config: Mapping[str, Any], ids: CanonicalIds):
        records = config.get("owners")
        if not isinstance(records, list) or not records:
            raise NormalizationError("owners.yml must contain a non-empty owners list")

        self.records: dict[str, dict[str, Any]] = {}
        self.aliases: dict[str, str] = {}
        for raw in records:
            if not isinstance(raw, dict):
                raise NormalizationError("Every owner config entry must be a mapping")
            owner_key = str(raw.get("owner_key") or "").strip()
            canonical_name = str(raw.get("canonical_name") or "").strip()
            if not owner_key or not canonical_name:
                raise NormalizationError("Owner entries require owner_key and canonical_name")
            owner_uid = ids.make("owner", owner_key=owner_key)
            if owner_uid in self.records:
                raise NormalizationError(f"Duplicate owner identity: {owner_key}")
            self.records[owner_uid] = {
                "owner_uid": owner_uid,
                "owner_key": owner_key,
                "canonical_name": canonical_name,
                "active": bool(raw.get("active")),
                "first_season": None,
                "last_season": None,
            }

            alias_groups = raw.get("aliases") or {}
            aliases: list[Any] = [owner_key, canonical_name]
            if isinstance(alias_groups, dict):
                for values in alias_groups.values():
                    aliases.extend(values if isinstance(values, list) else [values])
            for alias in aliases:
                normalized = normalize_label(alias)
                if not normalized:
                    continue
                prior = self.aliases.get(normalized)
                if prior and prior != owner_uid:
                    raise NormalizationError(f"Owner alias collision: {alias!r}")
                self.aliases[normalized] = owner_uid

    def resolve(self, candidates: Iterable[Any], *, context: str) -> str:
        for candidate in candidates:
            normalized = normalize_label(candidate)
            owner_uid = self.aliases.get(normalized)
            if owner_uid:
                return owner_uid
        rendered = [str(value) for value in candidates if value not in (None, "")]
        raise NormalizationError(f"Unresolved owner for {context}: {rendered}")

    def rows(self, team_seasons: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seasons_by_owner: dict[str, list[int]] = defaultdict(list)
        for row in team_seasons:
            seasons_by_owner[row["owner_uid"]].append(int(row["season"]))
        output = []
        for owner_uid, raw in self.records.items():
            row = dict(raw)
            seasons = seasons_by_owner.get(owner_uid, [])
            row["first_season"] = min(seasons) if seasons else None
            row["last_season"] = max(seasons) if seasons else None
            output.append(row)
        return sorted(output, key=lambda row: (row["canonical_name"], row["owner_uid"]))


class FranchiseDirectory:
    def __init__(self, config: Mapping[str, Any], ids: CanonicalIds):
        records = config.get("franchises")
        if not isinstance(records, list) or not records:
            raise NormalizationError("franchises.yml must contain a non-empty franchises list")
        self.by_espn_slot: dict[int, dict[str, Any]] = {}
        self.by_sleeper_roster: dict[tuple[int, int], dict[str, Any]] = {}
        self.records: list[dict[str, Any]] = []
        for raw in records:
            if not isinstance(raw, dict):
                raise NormalizationError("Every franchise config entry must be a mapping")
            franchise_key = str(raw.get("franchise_key") or "").strip()
            slot = int(raw.get("espn_team_slot") or 0)
            if not franchise_key or slot < 1:
                raise NormalizationError("Franchise entries require a key and ESPN slot")
            row = {
                "franchise_uid": ids.make("franchise", franchise_key=franchise_key),
                "franchise_key": franchise_key,
                "canonical_name": str(raw.get("canonical_name") or franchise_key),
                "first_season": None,
                "last_season": None,
                "active": False,
            }
            self.records.append(row)
            self.by_espn_slot[slot] = row
            for season, roster_id in (raw.get("sleeper_roster_ids") or {}).items():
                self.by_sleeper_roster[(int(season), int(roster_id))] = row

    def resolve(self, platform: str, season: int, platform_team_id: int) -> dict[str, Any]:
        if platform == "espn":
            row = self.by_espn_slot.get(platform_team_id)
        else:
            row = self.by_sleeper_roster.get((season, platform_team_id))
        if not row:
            raise NormalizationError(
                f"No franchise mapping for {platform} {season} team {platform_team_id}"
            )
        return row

    def rows(self, team_seasons: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seasons_by_franchise: dict[str, list[int]] = defaultdict(list)
        for row in team_seasons:
            seasons_by_franchise[row["franchise_uid"]].append(int(row["season"]))
        output = []
        for raw in self.records:
            row = dict(raw)
            seasons = seasons_by_franchise.get(row["franchise_uid"], [])
            row["first_season"] = min(seasons) if seasons else None
            row["last_season"] = max(seasons) if seasons else None
            row["active"] = bool(seasons and max(seasons) == 2025)
            output.append(row)
        return sorted(output, key=lambda row: row["franchise_key"])


def owner_candidates(team: Mapping[str, Any]) -> list[Any]:
    candidates: list[Any] = [
        team.get("owner_id"),
        team.get("owner"),
        team.get("display_name"),
        team.get("username"),
    ]
    for owner in team.get("owners") or []:
        if not isinstance(owner, dict):
            continue
        candidates.extend(
            [
                owner.get("id"),
                owner.get("displayName"),
                " ".join(
                    part
                    for part in [owner.get("firstName"), owner.get("lastName")]
                    if part
                ),
            ]
        )
    return candidates


def build_team_seasons(
    season_payloads: Mapping[int, Mapping[str, Any]],
    ids: CanonicalIds,
    owners: OwnerDirectory,
    franchises: FranchiseDirectory,
) -> tuple[list[dict[str, Any]], dict[int, dict[str, str]]]:
    rows: list[dict[str, Any]] = []
    aliases_by_season: dict[int, dict[str, str]] = {}

    for season, payload in sorted(season_payloads.items()):
        platform = "sleeper" if season >= 2025 else "espn"
        league_id = str(payload.get("league_id") or "")
        teams = payload.get("teams") or []
        if not isinstance(teams, list) or len(teams) != 8:
            raise NormalizationError(f"Expected eight teams in {season}, found {len(teams)}")

        aliases: dict[str, str] = {}
        season_rows: list[dict[str, Any]] = []
        for index, team in enumerate(teams, start=1):
            if not isinstance(team, dict):
                raise NormalizationError(f"Invalid team entry in {season}")
            platform_team_id = int(
                team.get("roster_id") if platform == "sleeper" else team.get("team_id") or index
            )
            owner_uid = owners.resolve(
                owner_candidates(team), context=f"{season} team {platform_team_id}"
            )
            franchise = franchises.resolve(platform, season, platform_team_id)
            team_season_uid = ids.make(
                "team_season",
                platform=platform,
                league_id=league_id,
                season=season,
                platform_team_id=platform_team_id,
            )

            settings = team.get("settings") if isinstance(team.get("settings"), dict) else {}
            wins, losses, ties = parse_record(team.get("record"))
            if platform == "sleeper":
                wins = int(settings.get("wins") or 0)
                losses = int(settings.get("losses") or 0)
                ties = int(settings.get("ties") or 0)
                points_for = sleeper_points(settings, "fpts")
                points_against = sleeper_points(settings, "fpts_against")
            else:
                points_for = finite_number(team.get("points_for"))
                points_against = finite_number(team.get("points_against"))

            seed = team.get("regular_season_rank")
            row = {
                "team_season_uid": team_season_uid,
                "season": season,
                "franchise_uid": franchise["franchise_uid"],
                "owner_uid": owner_uid,
                "platform_team_id": platform_team_id if platform == "espn" else None,
                "platform_roster_id": platform_team_id if platform == "sleeper" else None,
                "team_name": str(team.get("team_name") or team.get("display_name") or "").strip(),
                "provider_owner_label": str(
                    team.get("display_name") or team.get("owner") or team.get("username") or ""
                ).strip(),
                "seed": int(seed) if seed is not None else None,
                "playoff_seed": None if season == 2022 else (int(seed) if seed is not None else None),
                "wins": wins,
                "losses": losses,
                "ties": ties,
                "points_for": points_for,
                "points_against": points_against,
                "regular_season_rank": int(seed) if seed is not None else None,
                "playoff_finish": None,
                "champion": False,
                "runner_up": False,
                "source": f"data/{season}.json",
            }
            rows.append(row)
            season_rows.append(row)

            owner_name = owners.records[owner_uid]["canonical_name"]
            team_aliases = [
                team.get("team_name"),
                team.get("owner"),
                team.get("display_name"),
                team.get("username"),
                team.get("owner_id"),
                platform_team_id,
                owner_name,
            ]
            for owner in team.get("owners") or []:
                if isinstance(owner, dict):
                    team_aliases.extend([owner.get("id"), owner.get("displayName")])
            for alias in team_aliases:
                normalized = normalize_label(alias)
                if not normalized:
                    continue
                prior = aliases.get(normalized)
                if prior and prior != team_season_uid:
                    raise NormalizationError(
                        f"Team alias collision in {season}: {alias!r}"
                    )
                aliases[normalized] = team_season_uid

        if any(row["seed"] is None for row in season_rows):
            ranked = sorted(
                season_rows,
                key=lambda row: (
                    -(row["wins"] if row["wins"] is not None else -1),
                    -(row["points_for"] if row["points_for"] is not None else -1.0),
                    row["team_season_uid"],
                ),
            )
            for rank, row in enumerate(ranked, start=1):
                row["seed"] = rank
                row["playoff_seed"] = rank
                row["regular_season_rank"] = rank

        aliases_by_season[season] = aliases
    return rows, aliases_by_season


def resolve_team_alias(
    aliases_by_season: Mapping[int, Mapping[str, str]],
    season: int,
    value: Any,
    *,
    optional: bool = False,
) -> str | None:
    normalized = normalize_label(value)
    resolved = aliases_by_season.get(season, {}).get(normalized)
    if resolved or optional:
        return resolved
    raise NormalizationError(f"Unresolved {season} team alias: {value!r}")


def regular_season_weeks(season: int, history: Mapping[str, Any]) -> int:
    configured = history.get(str(season), {}).get("regular_season_weeks")
    return int(configured or (13 if season <= 2020 else 14))


def championship_week(season: int, history: Mapping[str, Any]) -> int:
    weeks = history.get(str(season), {}).get("playoff_weeks") or []
    return int(max(weeks) if weeks else (16 if season <= 2020 else 17))


def build_matchups(
    season_payloads: Mapping[int, Mapping[str, Any]],
    ids: CanonicalIds,
    aliases_by_season: Mapping[int, Mapping[str, str]],
    history: Mapping[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_keys: Counter[tuple[int, int, str]] = Counter()

    for season, payload in sorted(season_payloads.items()):
        platform = "sleeper" if season >= 2025 else "espn"
        league_id = str(payload.get("league_id") or "")
        regular_weeks = regular_season_weeks(season, history)
        final_week = championship_week(season, history)
        manual = history.get(str(season), {})
        champion_uid = resolve_team_alias(
            aliases_by_season, season, manual.get("champion"), optional=True
        )
        runner_uid = resolve_team_alias(
            aliases_by_season, season, manual.get("second_place"), optional=True
        )
        third_uid = resolve_team_alias(
            aliases_by_season, season, manual.get("third_place"), optional=True
        )

        for matchup in payload.get("matchups") or []:
            if not isinstance(matchup, dict):
                continue
            week = int(matchup.get("week") or 0)
            if week < 1 or week > final_week:
                continue
            # ESPN emits first-round bye placeholders as one-sided 0-point
            # "matchups". They are evidence of a bye, not canonical games.
            if platform == "espn" and (
                not matchup.get("home_team") or not matchup.get("away_team")
            ):
                continue
            if platform == "sleeper":
                home_uid = resolve_team_alias(
                    aliases_by_season, season, matchup.get("home_roster_id")
                )
                away_uid = resolve_team_alias(
                    aliases_by_season, season, matchup.get("away_roster_id")
                )
            else:
                home_uid = resolve_team_alias(
                    aliases_by_season, season, matchup.get("home_team")
                )
                away_uid = resolve_team_alias(
                    aliases_by_season, season, matchup.get("away_team")
                )
            if home_uid == away_uid:
                raise NormalizationError(f"Self-matchup in {season} week {week}")

            team_pair = ":".join(sorted((str(home_uid), str(away_uid))))
            duplicate_key = (season, week, team_pair)
            seen_keys[duplicate_key] += 1
            uid_pair = team_pair
            if seen_keys[duplicate_key] > 1:
                uid_pair = f"{team_pair}:occurrence-{seen_keys[duplicate_key]}"
            matchup_uid = ids.make(
                "matchup",
                platform=platform,
                league_id=league_id,
                season=season,
                week=week,
                team_pair=uid_pair,
            )

            home_points = finite_number(matchup.get("home_score"))
            away_points = finite_number(matchup.get("away_score"))
            winner_uid: str | None = None
            loser_uid: str | None = None
            tie = False
            if home_points is not None and away_points is not None:
                if home_points > away_points:
                    winner_uid, loser_uid = str(home_uid), str(away_uid)
                elif away_points > home_points:
                    winner_uid, loser_uid = str(away_uid), str(home_uid)
                else:
                    tie = True

            matchup_type = str(
                matchup.get("matchup_type")
                or ("regular_season" if week <= regular_weeks else "unknown_playoff")
            )
            pair = {str(home_uid), str(away_uid)}
            if week == final_week and champion_uid and runner_uid and pair == {champion_uid, runner_uid}:
                matchup_type = "championship"
            elif week == final_week and third_uid and third_uid in pair:
                matchup_type = "third_place"

            rows.append(
                {
                    "matchup_uid": matchup_uid,
                    "season": season,
                    "week": week,
                    "matchup_type": matchup_type,
                    "home_team_season_uid": str(home_uid),
                    "away_team_season_uid": str(away_uid),
                    "home_points": home_points,
                    "away_points": away_points,
                    "winner_team_season_uid": winner_uid,
                    "loser_team_season_uid": loser_uid,
                    "tie": tie,
                    "source": str(payload.get("_source") or f"data/{season}.json"),
                    "source_matchup_id": str(matchup.get("matchup_id") or ""),
                    "status": "final" if home_points is not None and away_points is not None else "unknown",
                    "is_corrected": False,
                }
            )
    return sorted(rows, key=lambda row: (row["season"], row["week"], row["matchup_uid"]))


def coverage_for_season(season: int) -> dict[str, str]:
    if season <= 2017:
        lineups = "unavailable"
        transactions = "unavailable"
    elif season == 2022:
        lineups = "partial"
        transactions = "partial"
    elif season == 2025:
        lineups = "complete"
        transactions = "complete"
    else:
        lineups = "complete"
        transactions = "partial"
    return {
        "matchups": "partial" if season == 2022 else "complete",
        "lineups": lineups,
        "transactions": transactions,
        "draft": "complete",
    }


def build_seasons(
    season_payloads: Mapping[int, Mapping[str, Any]],
    team_seasons: list[dict[str, Any]],
    matchups: list[dict[str, Any]],
    aliases_by_season: Mapping[int, Mapping[str, str]],
    history: Mapping[str, Any],
) -> list[dict[str, Any]]:
    teams_by_uid = {row["team_season_uid"]: row for row in team_seasons}
    matchups_by_season: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for matchup in matchups:
        matchups_by_season[int(matchup["season"])].append(matchup)

    rows = []
    for season, payload in sorted(season_payloads.items()):
        platform = "sleeper" if season >= 2025 else "espn"
        manual = history.get(str(season), {})
        canonical_champion = resolve_team_alias(
            aliases_by_season, season, manual.get("champion")
        )
        canonical_runner = resolve_team_alias(
            aliases_by_season, season, manual.get("second_place")
        )
        champion_uid = canonical_champion
        runner_uid = canonical_runner

        provider_finishes = payload.get("_provider_finishes") or {}
        if provider_finishes:
            provider_champion_roster = next(
                (roster_id for roster_id, finish in provider_finishes.items() if int(finish) == 1),
                None,
            )
            provider_runner_roster = next(
                (roster_id for roster_id, finish in provider_finishes.items() if int(finish) == 2),
                None,
            )
            provider_champion = resolve_team_alias(
                aliases_by_season, season, provider_champion_roster
            )
            provider_runner = resolve_team_alias(
                aliases_by_season, season, provider_runner_roster
            )
            if provider_champion != canonical_champion or provider_runner != canonical_runner:
                raise NormalizationError(
                    f"{season} manual final disagrees with the completed Sleeper bracket"
                )
            champion_uid = provider_champion
            runner_uid = provider_runner

        if season == 2022:
            championship = next(
                (
                    row
                    for row in matchups_by_season[season]
                    if row["matchup_type"] == "championship"
                ),
                None,
            )
            if not championship or not championship["winner_team_season_uid"]:
                raise NormalizationError("Missing raw 2022 championship matchup")
            champion_uid = championship["winner_team_season_uid"]
            runner_uid = championship["loser_team_season_uid"]

        champion_team = teams_by_uid[str(champion_uid)]
        runner_team = teams_by_uid[str(runner_uid)]
        rows.append(
            {
                "season": season,
                "platform": platform,
                "platform_league_id": str(payload.get("league_id") or ""),
                "regular_season_weeks": regular_season_weeks(season, history),
                "playoff_start_week": regular_season_weeks(season, history) + 1,
                "championship_week": championship_week(season, history),
                "team_count": len(payload.get("teams") or []),
                "status": "complete",
                "champion_team_season_uid": champion_uid,
                "runner_up_team_season_uid": runner_uid,
                "champion_seed": champion_team["seed"],
                "runner_up_seed": runner_team["seed"],
                "data_completeness": coverage_for_season(season),
                "source": (
                    "provider_result"
                    if season in {2022, 2025}
                    else "manual_league_history"
                ),
                "is_corrected": False,
                "correction_ids": [],
            }
        )
    return rows


def apply_all_corrections(
    seasons: list[dict[str, Any]],
    team_seasons: list[dict[str, Any]],
    matchups: list[dict[str, Any]],
) -> tuple[dict[str, Any], tuple[AppliedCorrection, ...]]:
    corrections: list[dict[str, Any]] = []
    for path in CORRECTION_FILES:
        corrections.extend(load_corrections(path))
    result = apply_corrections_with_report(
        {
            "seasons": seasons,
            "team_seasons": team_seasons,
            "matchups": matchups,
        },
        corrections,
    )
    return result.data, result.applied


def annotate_results(
    normalized: dict[str, Any],
    applied: tuple[AppliedCorrection, ...],
    aliases_by_season: Mapping[int, Mapping[str, str]],
    history: Mapping[str, Any],
    season_payloads: Mapping[int, Mapping[str, Any]],
) -> None:
    correction_ids_by_season: dict[int, list[str]] = defaultdict(list)
    for correction in applied:
        if correction.status not in {"applied", "already_applied"}:
            continue
        season = correction.match.get("season")
        if isinstance(season, int):
            correction_ids_by_season[season].append(correction.correction_id)

    season_by_year = {row["season"]: row for row in normalized["seasons"]}
    for season, row in season_by_year.items():
        ids = sorted(set(correction_ids_by_season.get(season, [])))
        row["correction_ids"] = ids
        row["is_corrected"] = bool(ids)
        if ids:
            row["source"] = "provider+audited_correction"

    for team in normalized["team_seasons"]:
        season = int(team["season"])
        season_row = season_by_year[season]
        team_uid = team["team_season_uid"]
        team["champion"] = team_uid == season_row["champion_team_season_uid"]
        team["runner_up"] = team_uid == season_row["runner_up_team_season_uid"]
        if team["champion"]:
            team["playoff_finish"] = 1
        elif team["runner_up"]:
            team["playoff_finish"] = 2
        else:
            third_name = history.get(str(season), {}).get("third_place")
            third_uid = resolve_team_alias(
                aliases_by_season, season, third_name, optional=True
            )
            if third_uid == team_uid:
                team["playoff_finish"] = 3

    for season, payload in season_payloads.items():
        for roster_id, finish in (payload.get("_provider_finishes") or {}).items():
            team_uid = resolve_team_alias(aliases_by_season, season, roster_id)
            team = next(
                row for row in normalized["team_seasons"] if row["team_season_uid"] == team_uid
            )
            team["playoff_finish"] = int(finish)


def sleeper_player_uid_map(root: Path) -> dict[str, str]:
    path = root / "data" / "normalized" / "player_ids.parquet"
    if not path.exists():
        raise NormalizationError(
            "Sleeper lineup normalization requires player_ids.parquet; "
            "run player_identity.py first"
        )
    try:
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise NormalizationError("Player ID lookup requires pyarrow") from exc
    rows = pq.read_table(path).to_pylist()
    return {
        str(row["id_value"]): str(row["player_uid"])
        for row in rows
        if row.get("id_type") == "sleeper"
    }


def build_sleeper_fact_tables(
    root: Path,
    ids: CanonicalIds,
    aliases_by_season: Mapping[int, Mapping[str, str]],
    matchups: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Normalize final Sleeper lineups, transactions, and drafts."""
    output: dict[str, list[dict[str, Any]]] = {
        "lineups": [],
        "lineup_entries": [],
        "transactions": [],
        "transaction_assets": [],
        "drafts": [],
        "draft_picks": [],
    }
    player_uids = sleeper_player_uid_map(root)

    for season in sorted(aliases_by_season):
        snapshot = root / "data" / "raw" / "sleeper" / str(season) / "final"
        if not snapshot.exists():
            continue
        league = read_json(snapshot / "league.json")
        league_id = str(league["league_id"])
        source = f"data/raw/sleeper/{season}/final"
        playoff_start = int((league.get("settings") or {}).get("playoff_week_start") or 15)
        final_week = playoff_start + 2
        starter_positions = [
            str(value)
            for value in (league.get("roster_positions") or [])
            if str(value) != "BN"
        ]
        matchup_uids = {
            (int(row["week"]), str(row["source_matchup_id"])): row["matchup_uid"]
            for row in matchups
            if int(row["season"]) == season
        }

        raw_matchups = read_json(snapshot / "matchups.json")
        for week_text, entries in sorted(raw_matchups.items(), key=lambda item: int(item[0])):
            week = int(week_text)
            if week < 1 or week > final_week:
                continue
            for entry in sorted(entries, key=lambda row: int(row["roster_id"])):
                roster_id = int(entry["roster_id"])
                team_uid = resolve_team_alias(aliases_by_season, season, roster_id)
                lineup_uid = ids.make(
                    "lineup",
                    platform="sleeper",
                    league_id=league_id,
                    season=season,
                    week=week,
                    platform_team_id=roster_id,
                )
                matchup_id = entry.get("matchup_id")
                output["lineups"].append(
                    {
                        "lineup_uid": lineup_uid,
                        "season": season,
                        "week": week,
                        "team_season_uid": team_uid,
                        "matchup_uid": (
                            matchup_uids.get((week, str(matchup_id)))
                            if matchup_id is not None
                            else None
                        ),
                        "platform_roster_id": roster_id,
                        "points": finite_number(entry.get("points")),
                        "starter_count": len(entry.get("starters") or []),
                        "rostered_count": len(entry.get("players") or []),
                        "is_playoff_week": week >= playoff_start,
                        "status": "final",
                        "source": source,
                    }
                )
                starters = [str(value) for value in (entry.get("starters") or [])]
                slot_by_player = {
                    player_id: (
                        starter_positions[index]
                        if index < len(starter_positions)
                        else "STARTER"
                    )
                    for index, player_id in enumerate(starters)
                }
                starter_index = {player_id: index + 1 for index, player_id in enumerate(starters)}
                player_points = entry.get("players_points") or {}
                for player_id_value in entry.get("players") or []:
                    player_id = str(player_id_value)
                    player_uid = player_uids.get(player_id)
                    if not player_uid:
                        raise NormalizationError(
                            f"Unresolved Sleeper player {player_id} in {season} week {week}"
                        )
                    output["lineup_entries"].append(
                        {
                            "lineup_entry_uid": ids.make(
                                "lineup_entry",
                                lineup_uid=lineup_uid,
                                player_id=player_id,
                            ),
                            "lineup_uid": lineup_uid,
                            "season": season,
                            "week": week,
                            "team_season_uid": team_uid,
                            "player_uid": player_uid,
                            "sleeper_player_id": player_id,
                            "roster_slot": slot_by_player.get(player_id, "BN"),
                            "starter_index": starter_index.get(player_id),
                            "started": player_id in slot_by_player,
                            "fantasy_points": finite_number(player_points.get(player_id)),
                            "source": source,
                        }
                    )

        raw_transactions = read_json(snapshot / "transactions.json")
        for endpoint_week, transactions in sorted(
            raw_transactions.items(), key=lambda item: int(item[0])
        ):
            for transaction in transactions:
                transaction_id = str(transaction["transaction_id"])
                transaction_uid = ids.make(
                    "transaction",
                    platform="sleeper",
                    league_id=league_id,
                    season=season,
                    transaction_id=transaction_id,
                )
                roster_ids = [int(value) for value in transaction.get("roster_ids") or []]
                settings = transaction.get("settings") or {}
                output["transactions"].append(
                    {
                        "transaction_uid": transaction_uid,
                        "season": season,
                        "week": int(transaction.get("leg") or endpoint_week),
                        "endpoint_week": int(endpoint_week),
                        "transaction_type": str(transaction.get("type") or "unknown"),
                        "status": str(transaction.get("status") or "unknown"),
                        "created_at_ms": int(transaction.get("created") or 0),
                        "status_updated_at_ms": int(transaction.get("status_updated") or 0),
                        "creator_user_id": str(transaction.get("creator") or ""),
                        "platform_roster_ids": roster_ids,
                        "team_season_uids": [
                            resolve_team_alias(aliases_by_season, season, roster_id)
                            for roster_id in roster_ids
                        ],
                        "waiver_bid": settings.get("waiver_bid"),
                        "source_transaction_id": transaction_id,
                        "source": source,
                    }
                )
                adds = {str(key): int(value) for key, value in (transaction.get("adds") or {}).items()}
                drops = {str(key): int(value) for key, value in (transaction.get("drops") or {}).items()}
                for player_id in sorted(set(adds) | set(drops)):
                    player_uid = player_uids.get(player_id)
                    if not player_uid:
                        raise NormalizationError(
                            f"Unresolved Sleeper transaction player {player_id}"
                        )
                    from_roster = drops.get(player_id)
                    to_roster = adds.get(player_id)
                    output["transaction_assets"].append(
                        {
                            "transaction_asset_uid": ids.make(
                                "transaction_asset",
                                transaction_uid=transaction_uid,
                                asset_type="player",
                                asset_id=player_id,
                                from_roster_id=from_roster or 0,
                                to_roster_id=to_roster or 0,
                            ),
                            "transaction_uid": transaction_uid,
                            "season": season,
                            "asset_type": "player",
                            "asset_id": player_id,
                            "player_uid": player_uid,
                            "from_team_season_uid": (
                                resolve_team_alias(aliases_by_season, season, from_roster)
                                if from_roster is not None
                                else None
                            ),
                            "to_team_season_uid": (
                                resolve_team_alias(aliases_by_season, season, to_roster)
                                if to_roster is not None
                                else None
                            ),
                            "amount": None,
                            "metadata_json": None,
                            "source": source,
                        }
                    )
                for index, budget in enumerate(transaction.get("waiver_budget") or []):
                    sender = int(budget.get("sender") or 0)
                    receiver = int(budget.get("receiver") or 0)
                    asset_id = f"faab-{index + 1}"
                    output["transaction_assets"].append(
                        {
                            "transaction_asset_uid": ids.make(
                                "transaction_asset",
                                transaction_uid=transaction_uid,
                                asset_type="faab",
                                asset_id=asset_id,
                                from_roster_id=sender,
                                to_roster_id=receiver,
                            ),
                            "transaction_uid": transaction_uid,
                            "season": season,
                            "asset_type": "faab",
                            "asset_id": asset_id,
                            "player_uid": None,
                            "from_team_season_uid": resolve_team_alias(
                                aliases_by_season, season, sender
                            ),
                            "to_team_season_uid": resolve_team_alias(
                                aliases_by_season, season, receiver
                            ),
                            "amount": finite_number(budget.get("amount")),
                            "metadata_json": None,
                            "source": source,
                        }
                    )
                for index, pick in enumerate(transaction.get("draft_picks") or []):
                    owner_roster = int(pick.get("owner_id") or 0)
                    previous_roster = int(pick.get("previous_owner_id") or 0)
                    asset_id = f"{pick.get('season')}-{pick.get('round')}-{index + 1}"
                    output["transaction_assets"].append(
                        {
                            "transaction_asset_uid": ids.make(
                                "transaction_asset",
                                transaction_uid=transaction_uid,
                                asset_type="draft_pick",
                                asset_id=asset_id,
                                from_roster_id=previous_roster,
                                to_roster_id=owner_roster,
                            ),
                            "transaction_uid": transaction_uid,
                            "season": season,
                            "asset_type": "draft_pick",
                            "asset_id": asset_id,
                            "player_uid": None,
                            "from_team_season_uid": (
                                resolve_team_alias(aliases_by_season, season, previous_roster)
                                if previous_roster
                                else None
                            ),
                            "to_team_season_uid": (
                                resolve_team_alias(aliases_by_season, season, owner_roster)
                                if owner_roster
                                else None
                            ),
                            "amount": None,
                            "metadata_json": json.dumps(pick, sort_keys=True),
                            "source": source,
                        }
                    )

        raw_drafts = read_json(snapshot / "drafts.json")
        raw_draft_picks = read_json(snapshot / "draft_picks.json")
        for draft in raw_drafts:
            draft_id = str(draft["draft_id"])
            draft_uid = ids.make(
                "draft",
                platform="sleeper",
                league_id=league_id,
                season=season,
                draft_id=draft_id,
            )
            picks = raw_draft_picks.get(draft_id) or []
            output["drafts"].append(
                {
                    "draft_uid": draft_uid,
                    "season": season,
                    "platform_draft_id": draft_id,
                    "status": str(draft.get("status") or "unknown"),
                    "draft_type": str(draft.get("type") or "unknown"),
                    "start_time_ms": int(draft.get("start_time") or 0),
                    "created_at_ms": int(draft.get("created") or 0),
                    "team_count": int((draft.get("settings") or {}).get("teams") or 0),
                    "rounds": int((draft.get("settings") or {}).get("rounds") or 0),
                    "budget": (draft.get("settings") or {}).get("budget"),
                    "pick_count": len(picks),
                    "settings_json": json.dumps(draft.get("settings") or {}, sort_keys=True),
                    "metadata_json": json.dumps(draft.get("metadata") or {}, sort_keys=True),
                    "source": source,
                }
            )
            for pick in picks:
                player_id = str(pick["player_id"])
                player_uid = player_uids.get(player_id)
                if not player_uid:
                    raise NormalizationError(f"Unresolved Sleeper draft player {player_id}")
                roster_id = int(pick["roster_id"])
                metadata = pick.get("metadata") or {}
                output["draft_picks"].append(
                    {
                        "draft_pick_uid": ids.make(
                            "draft_pick", draft_uid=draft_uid, pick_no=int(pick["pick_no"])
                        ),
                        "draft_uid": draft_uid,
                        "season": season,
                        "pick_no": int(pick["pick_no"]),
                        "round": int(pick.get("round") or 0),
                        "draft_slot": int(pick.get("draft_slot") or 0),
                        "team_season_uid": resolve_team_alias(
                            aliases_by_season, season, roster_id
                        ),
                        "platform_roster_id": roster_id,
                        "picked_by_user_id": str(pick.get("picked_by") or ""),
                        "player_uid": player_uid,
                        "sleeper_player_id": player_id,
                        "nfl_team_at_draft": str(metadata.get("team") or "") or None,
                        "amount": finite_number(metadata.get("amount")),
                        "is_keeper": bool(pick.get("is_keeper")),
                        "source": source,
                    }
                )

    for rows in output.values():
        rows.sort(key=lambda row: tuple(str(value) for value in row.values()))
    return output


def validate_history(normalized: Mapping[str, Any]) -> dict[str, Any]:
    critical: list[str] = []
    warnings: list[str] = []
    seasons = normalized["seasons"]
    team_seasons = normalized["team_seasons"]
    matchups = normalized["matchups"]
    team_by_uid = {row["team_season_uid"]: row for row in team_seasons}

    def duplicate_ids(rows: list[dict[str, Any]], key: str) -> list[str]:
        counts = Counter(str(row.get(key)) for row in rows)
        return sorted(value for value, count in counts.items() if count > 1)

    for table, rows, key in (
        ("team_seasons", team_seasons, "team_season_uid"),
        ("matchups", matchups, "matchup_uid"),
        ("lineups", normalized.get("lineups") or [], "lineup_uid"),
        (
            "lineup_entries",
            normalized.get("lineup_entries") or [],
            "lineup_entry_uid",
        ),
        (
            "transactions",
            normalized.get("transactions") or [],
            "transaction_uid",
        ),
        (
            "transaction_assets",
            normalized.get("transaction_assets") or [],
            "transaction_asset_uid",
        ),
        ("drafts", normalized.get("drafts") or [], "draft_uid"),
        ("draft_picks", normalized.get("draft_picks") or [], "draft_pick_uid"),
    ):
        duplicates = duplicate_ids(rows, key)
        if duplicates:
            critical.append(f"{table} has duplicate {key} values: {duplicates[:3]}")

    verification_seasons = []
    for season in seasons:
        year = int(season["season"])
        year_teams = [row for row in team_seasons if int(row["season"]) == year]
        year_matchups = [row for row in matchups if int(row["season"]) == year]
        champions = [row for row in year_teams if row["champion"]]
        runners = [row for row in year_teams if row["runner_up"]]
        if len(year_teams) != int(season["team_count"]):
            critical.append(f"{year}: team count mismatch")
        if len(champions) != 1:
            critical.append(f"{year}: expected one champion, found {len(champions)}")
        if len(runners) != 1:
            critical.append(f"{year}: expected one runner-up, found {len(runners)}")
        if season["champion_team_season_uid"] == season["runner_up_team_season_uid"]:
            critical.append(f"{year}: champion and runner-up are the same team")

        for matchup in year_matchups:
            home = matchup["home_team_season_uid"]
            away = matchup["away_team_season_uid"]
            if home not in team_by_uid or away not in team_by_uid:
                critical.append(f"{year}: matchup references an unknown team")
            if home == away:
                critical.append(f"{year}: matchup contains the same team twice")
            hp, ap = matchup["home_points"], matchup["away_points"]
            if matchup["status"] == "final" and (hp is None or ap is None):
                critical.append(f"{year}: final matchup has a missing score")
            expected_winner = None
            if hp is not None and ap is not None:
                if hp > ap:
                    expected_winner = home
                elif ap > hp:
                    expected_winner = away
            if (
                expected_winner != matchup["winner_team_season_uid"]
                and not matchup["is_corrected"]
            ):
                critical.append(
                    f"{year}: winner disagrees with score for {matchup['matchup_uid']}"
                )

        completeness = season["data_completeness"]
        incomplete = sorted(
            key for key, status in completeness.items() if status != "complete"
        )
        if incomplete:
            warnings.append(f"{year}: non-complete datasets: {', '.join(incomplete)}")
        champion = team_by_uid.get(season["champion_team_season_uid"], {})
        runner = team_by_uid.get(season["runner_up_team_season_uid"], {})
        verification_seasons.append(
            {
                "season": year,
                "champion": champion.get("team_name"),
                "champion_owner_uid": champion.get("owner_uid"),
                "champion_seed": season["champion_seed"],
                "runner_up": runner.get("team_name"),
                "runner_up_owner_uid": runner.get("owner_uid"),
                "runner_up_seed": season["runner_up_seed"],
                "team_count": len(year_teams),
                "matchup_count": len(year_matchups),
                "corrected": season["is_corrected"],
                "correction_ids": season["correction_ids"],
                "completeness": completeness,
            }
        )

    final_lineups = normalized.get("lineups") or []
    final_transactions = normalized.get("transactions") or []
    final_draft_picks = normalized.get("draft_picks") or []
    if len([row for row in final_lineups if int(row["season"]) == 2025]) != 136:
        critical.append("2025: expected 136 final team-week lineups")
    if len(
        [
            row
            for row in final_transactions
            if int(row["season"]) == 2025 and row["status"] == "complete"
        ]
    ) != 551:
        critical.append("2025: expected 551 completed Sleeper transactions")
    if len([row for row in final_draft_picks if int(row["season"]) == 2025]) != 152:
        critical.append("2025: expected 152 completed auction purchases")

    return {
        "status": "error" if critical else ("warning" if warnings else "ok"),
        "critical": critical,
        "warnings": warnings,
        "summary": {
            "seasons": len(seasons),
            "owners": len(normalized["owners"]),
            "franchises": len(normalized["franchises"]),
            "team_seasons": len(team_seasons),
            "matchups": len(matchups),
            "playoff_games": len(normalized["playoff_games"]),
            "lineups": len(final_lineups),
            "lineup_entries": len(normalized.get("lineup_entries") or []),
            "transactions": len(final_transactions),
            "transaction_assets": len(normalized.get("transaction_assets") or []),
            "drafts": len(normalized.get("drafts") or []),
            "draft_picks": len(final_draft_picks),
        },
        "seasons": verification_seasons,
    }


def build_canonical_history(root: Path = ROOT) -> CanonicalHistory:
    league_config_path = root / "data" / "config" / "league.yml"
    league_config = read_yaml(league_config_path)
    ids = CanonicalIds(league_config_path)
    owner_directory = OwnerDirectory(
        read_yaml(root / "data" / "config" / "owners.yml"), ids
    )
    franchise_directory = FranchiseDirectory(
        read_yaml(root / "data" / "config" / "franchises.yml"), ids
    )
    history_document = read_json(root / "data" / "manual_league_history.json")
    history = history_document.get("seasons") or {}
    payloads = {}
    for season in range(2015, 2026):
        final_sleeper = sleeper_final_payload(root, season, history)
        payload = dict(
            final_sleeper
            if final_sleeper is not None
            else read_json(root / "data" / f"{season}.json")
        )
        payload["league_id"] = str(
            payload.get("league_id") or configured_league_id(league_config, season)
        )
        payloads[season] = payload

    team_seasons, aliases_by_season = build_team_seasons(
        payloads, ids, owner_directory, franchise_directory
    )
    matchups = build_matchups(payloads, ids, aliases_by_season, history)
    seasons = build_seasons(
        payloads, team_seasons, matchups, aliases_by_season, history
    )
    corrected, applied = apply_all_corrections(seasons, team_seasons, matchups)
    annotate_results(corrected, applied, aliases_by_season, history, payloads)
    corrected["owners"] = owner_directory.rows(corrected["team_seasons"])
    corrected["franchises"] = franchise_directory.rows(corrected["team_seasons"])
    corrected["playoff_games"] = [
        row for row in corrected["matchups"] if row["matchup_type"] != "regular_season"
    ]
    sleeper_facts = build_sleeper_fact_tables(
        root, ids, aliases_by_season, corrected["matchups"]
    )
    corrected.update(sleeper_facts)
    verification = validate_history(corrected)
    if verification["critical"]:
        raise NormalizationError(
            "Canonical history validation failed:\n- "
            + "\n- ".join(verification["critical"])
        )

    return CanonicalHistory(
        seasons=corrected["seasons"],
        owners=corrected["owners"],
        franchises=corrected["franchises"],
        team_seasons=corrected["team_seasons"],
        matchups=corrected["matchups"],
        playoff_games=corrected["playoff_games"],
        lineups=corrected["lineups"],
        lineup_entries=corrected["lineup_entries"],
        transactions=corrected["transactions"],
        transaction_assets=corrected["transaction_assets"],
        drafts=corrected["drafts"],
        draft_picks=corrected["draft_picks"],
        corrections=applied,
        verification=verification,
    )


def write_parquet(path: Path, rows: list[dict[str, Any]]) -> None:
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise NormalizationError(
            "Parquet output requires pyarrow; install requirements-data.txt"
        ) from exc
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pylist(rows), path, compression="zstd")


def write_outputs(history: CanonicalHistory, root: Path = ROOT) -> None:
    normalized_dir = root / "data" / "normalized"
    derived_dir = root / "data" / "derived"
    tables = {
        "seasons": history.seasons,
        "owners": history.owners,
        "franchises": history.franchises,
        "team_seasons": history.team_seasons,
        "matchups": history.matchups,
        "playoff_games": history.playoff_games,
        "lineups": history.lineups,
        "lineup_entries": history.lineup_entries,
        "transactions": history.transactions,
        "transaction_assets": history.transaction_assets,
        "drafts": history.drafts,
        "draft_picks": history.draft_picks,
    }
    for name, rows in tables.items():
        write_parquet(normalized_dir / f"{name}.parquet", rows)

    generated_at = datetime.now(timezone.utc).isoformat()
    schema = {
        "schema_version": "1.0.0",
        "generated_at": generated_at,
        "tables": {
            name: {
                "path": f"data/normalized/{name}.parquet",
                "rows": len(rows),
                "fields": list(rows[0].keys()) if rows else [],
            }
            for name, rows in tables.items()
        },
    }
    normalized_dir.mkdir(parents=True, exist_ok=True)
    (normalized_dir / "schema.json").write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    correction_report = {
        "schema_version": "1.0.0",
        "generated_at": generated_at,
        "corrections": [
            {
                "correction_id": row.correction_id,
                "dataset": row.dataset,
                "match": dict(row.match),
                "field": row.field,
                "previous_value": row.previous_value,
                "new_value": row.new_value,
                "status": row.status,
            }
            for row in history.corrections
        ],
    }
    derived_dir.mkdir(parents=True, exist_ok=True)
    (derived_dir / "corrections_applied.json").write_text(
        json.dumps(correction_report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    verification = {
        "schema_version": "1.0.0",
        "generated_at": generated_at,
        **history.verification,
    }
    (derived_dir / "history_verification.json").write_text(
        json.dumps(verification, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Build and validate in memory without writing Parquet outputs.",
    )
    args = parser.parse_args()
    history = build_canonical_history()
    if not args.check:
        write_outputs(history)
    summary = history.verification["summary"]
    print(
        "Canonical history OK: "
        f"{summary['seasons']} seasons, {summary['team_seasons']} team seasons, "
        f"{summary['matchups']} matchups, {len(history.corrections)} corrections"
    )
    for warning in history.verification["warnings"]:
        print(f"WARNING: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
