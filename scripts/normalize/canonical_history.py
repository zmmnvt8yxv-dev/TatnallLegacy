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

            matchup_type = "regular_season" if week <= regular_weeks else "unknown_playoff"
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
                    "source": f"data/{season}.json",
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
        lineups = "partial"
        transactions = "partial"
    else:
        lineups = "complete"
        transactions = "partial"
    return {
        "matchups": "partial" if season in {2022, 2025} else "complete",
        "lineups": lineups,
        "transactions": transactions,
        "draft": "partial" if season == 2025 else "complete",
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
                "source": "provider_result" if season == 2022 else "manual_league_history",
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
        payload = dict(read_json(root / "data" / f"{season}.json"))
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
    annotate_results(corrected, applied, aliases_by_season, history)
    corrected["owners"] = owner_directory.rows(corrected["team_seasons"])
    corrected["franchises"] = franchise_directory.rows(corrected["team_seasons"])
    corrected["playoff_games"] = [
        row for row in corrected["matchups"] if row["matchup_type"] != "regular_season"
    ]
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
