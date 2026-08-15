#!/usr/bin/env python3
"""Build canonical player intelligence tables and route-sized public resources.

The Tatnall Draft Score is an explainable league-specific score, not a player
projection. Only the verified 2025 Sleeper scoring season is eligible for the
performance model; older provider totals remain labeled as recorded history.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yaml


ROOT = Path(__file__).resolve().parents[2]
NORMALIZED = ROOT / "data" / "normalized"
CONFIG = ROOT / "data" / "config"
PUBLIC = ROOT / "public" / "data"
RAW_PLAYERS = ROOT / "data" / "raw" / "sleeper" / "players" / "current.json"
CURRENT = ROOT / "data" / "raw" / "sleeper" / "2026" / "current"
FANTASY_POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
BOOM_THRESHOLDS = {"QB": 18.0, "RB": 15.0, "WR": 15.0, "TE": 12.0, "K": 12.0, "DEF": 10.0}


def _json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _yaml(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_clean(item) for item in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item") and not isinstance(value, (str, bytes)):
        try:
            return _clean(value.item())
        except (TypeError, ValueError):
            pass
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, float):
        return round(value, 4)
    return value


def _write_json(path: Path, payload: Any, *, pretty: bool = False) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = (
        json.dumps(_clean(payload), indent=2, ensure_ascii=False)
        if pretty
        else json.dumps(_clean(payload), ensure_ascii=False, separators=(",", ":"))
    ) + "\n"
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def percentile(values: pd.Series) -> pd.Series:
    """Stable zero-to-one percentile, with a neutral score for one-row groups."""
    numeric = pd.to_numeric(values, errors="coerce")
    valid = numeric.notna()
    result = pd.Series(float("nan"), index=values.index, dtype=float)
    count = int(valid.sum())
    if count == 1:
        result.loc[valid] = 0.5
    elif count > 1:
        ranks = numeric.loc[valid].rank(method="average")
        result.loc[valid] = (ranks - 1) / (count - 1)
    return result


def confidence_level(games: int, has_market: bool) -> str:
    if games >= 8 and has_market:
        return "high"
    if games >= 4:
        return "medium"
    return "low"


def draft_score(performance: float | None, market: float | None, games: int) -> tuple[float | None, float]:
    """Return score and reliability using the published Tatnall v1 formula."""
    reliability = min(max(games, 0) / 8.0, 1.0)
    if performance is None and market is None:
        return None, reliability
    if performance is None:
        return market, reliability
    if market is None:
        return performance, reliability
    score = reliability * (0.85 * performance + 0.15 * market) + (1.0 - reliability) * market
    return score, reliability


def reconcile_integer_pool(weights: dict[str, float], dollars: int) -> dict[str, int]:
    """Hamilton allocation with deterministic tie-breaking and exact reconciliation."""
    if not weights:
        return {}
    positive = {key: max(float(value), 0.0) for key, value in weights.items()}
    total = sum(positive.values())
    if total <= 0:
        positive = {key: 1.0 for key in positive}
        total = float(len(positive))
    exact = {key: dollars * value / total for key, value in positive.items()}
    result = {key: int(math.floor(value)) for key, value in exact.items()}
    remainder = dollars - sum(result.values())
    order = sorted(exact, key=lambda key: (-(exact[key] - result[key]), key))
    for key in order[:remainder]:
        result[key] += 1
    return result


def _identity_maps() -> tuple[dict[str, str], dict[str, str], dict[str, dict[str, Any]]]:
    ids = pd.read_parquet(NORMALIZED / "player_ids.parquet")
    players = pd.read_parquet(NORMALIZED / "players.parquet")
    sleeper = dict(
        zip(
            ids.loc[ids["id_type"] == "sleeper", "id_value"].astype(str),
            ids.loc[ids["id_type"] == "sleeper", "player_uid"].astype(str),
        )
    )
    gsis = dict(
        zip(
            ids.loc[ids["id_type"] == "gsis", "id_value"].astype(str),
            ids.loc[ids["id_type"] == "gsis", "player_uid"].astype(str),
        )
    )
    by_uid = {str(row.player_uid): row._asdict() for row in players.itertuples(index=False)}
    return sleeper, gsis, by_uid


def _owner_context() -> tuple[dict[str, dict[str, Any]], dict[str, str], dict[str, str]]:
    owners = pd.read_parquet(NORMALIZED / "owners.parquet")
    owner_config = _yaml(CONFIG / "owners.yml").get("owners") or []
    brand = _yaml(CONFIG / "branding.yml").get("franchises") or {}
    by_key = {str(row.owner_key): row._asdict() for row in owners.itertuples(index=False)}
    result: dict[str, dict[str, Any]] = {}
    sleeper_to_uid: dict[str, str] = {}
    key_to_uid: dict[str, str] = {}
    for configured in owner_config:
        owner_key = str(configured["owner_key"])
        row = by_key[owner_key]
        uid = str(row["owner_uid"])
        identity = brand.get(owner_key) or {}
        fallback = f"Team {str(row['canonical_name']).split()[-1]}"
        result[uid] = {
            "ownerUid": uid,
            "ownerKey": owner_key,
            "ownerName": row["canonical_name"],
            "teamName": identity.get("public_alias") or fallback,
            "monogram": identity.get("monogram") or "".join(part[0] for part in str(row["canonical_name"]).split()[:2]),
            "accent": identity.get("accent") or "#d7a928",
            "motto": identity.get("motto") or "",
        }
        key_to_uid[owner_key] = uid
        for sleeper_id in (configured.get("aliases") or {}).get("sleeper_user_ids") or []:
            sleeper_to_uid[str(sleeper_id)] = uid
    return result, sleeper_to_uid, key_to_uid


def _metrics_rows(kind: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for season in range(2015, 2026):
        family = "player_stats" if kind == "season" else "player_metrics"
        path = PUBLIC / family / kind / f"{season}.json"
        if path.exists():
            rows.extend(_json(path).get("rows") or [])
    return rows


def _resolve_uid(row: dict[str, Any], sleeper: dict[str, str], gsis: dict[str, str]) -> str | None:
    sleeper_id = str(row.get("sleeper_id") or "")
    gsis_id = str(row.get("gsis_id") or "")
    return sleeper.get(sleeper_id) or gsis.get(gsis_id)


def build_player_tables() -> dict[str, pd.DataFrame]:
    sleeper_to_uid, gsis_to_uid, players_by_uid = _identity_maps()
    season_rows: list[dict[str, Any]] = []
    for row in _metrics_rows("season"):
        uid = _resolve_uid(row, sleeper_to_uid, gsis_to_uid)
        if not uid:
            continue
        season = int(row["season"])
        verified = season >= 2025
        season_rows.append(
            {
                "player_uid": uid,
                "season": season,
                "display_name": row.get("display_name") or players_by_uid.get(uid, {}).get("display_name"),
                "position": row.get("position") or players_by_uid.get(uid, {}).get("position"),
                "nfl_team": row.get("team"),
                "games": int(row.get("games") or 0),
                "provider_points": _finite(row.get("points") if row.get("points") is not None else row.get("fantasy_points_custom")),
                "points_per_game": _finite(row.get("points_pg") if row.get("points_pg") is not None else row.get("fantasy_points_custom_pg")),
                "replacement_war": _finite(row.get("war_rep")) if verified else None,
                "replacement_war_per_game": _finite(row.get("war_rep_pg")) if verified else None,
                "scoring_era": "verified_tatnall" if verified else "provider_recorded",
                "model_verified": verified,
                "source": f"public/data/player_stats/season/{season}.json",
            }
        )
    player_seasons = pd.DataFrame(season_rows).drop_duplicates(["player_uid", "season"], keep="last")

    start_counts: dict[tuple[str, int, int], int] = defaultdict(int)
    owner_by_week: dict[tuple[str, int, int], str] = {}
    entries = pd.read_parquet(NORMALIZED / "lineup_entries.parquet")
    for row in entries.itertuples(index=False):
        key = (str(row.player_uid), int(row.season), int(row.week))
        if bool(row.started):
            start_counts[key] += 1
        owner_by_week[key] = str(row.team_season_uid)

    week_rows: list[dict[str, Any]] = []
    for row in _metrics_rows("weekly"):
        uid = _resolve_uid(row, sleeper_to_uid, gsis_to_uid)
        if not uid:
            continue
        season = int(row["season"])
        week = int(row["week"])
        verified = season >= 2025
        key = (uid, season, week)
        week_rows.append(
            {
                "player_uid": uid,
                "season": season,
                "week": week,
                "display_name": row.get("display_name") or players_by_uid.get(uid, {}).get("display_name"),
                "position": row.get("position") or players_by_uid.get(uid, {}).get("position"),
                "nfl_team": row.get("team"),
                "provider_points": _finite(row.get("points")),
                "positional_baseline": _finite(row.get("replacement_baseline")) if verified else None,
                "replacement_war": _finite(row.get("war_rep")) if verified else None,
                "tatnall_starts": start_counts.get(key, 0),
                "team_season_uid": owner_by_week.get(key),
                "scoring_era": "verified_tatnall" if verified else "provider_recorded",
                "model_verified": verified,
                "source": f"public/data/player_metrics/weekly/{season}.json",
            }
        )
    player_weeks = pd.DataFrame(week_rows).drop_duplicates(["player_uid", "season", "week"], keep="last")

    teams = pd.read_parquet(NORMALIZED / "team_seasons.parquet")
    team_owner = dict(zip(teams["team_season_uid"].astype(str), teams["owner_uid"].astype(str)))
    event_rows: list[dict[str, Any]] = []
    acquisition_rows: list[dict[str, Any]] = []
    picks = pd.read_parquet(NORMALIZED / "draft_picks.parquet")
    for row in picks.itertuples(index=False):
        event_type = "kept" if bool(row.is_keeper) else "drafted"
        event = {
            "event_uid": str(row.draft_pick_uid),
            "player_uid": str(row.player_uid),
            "season": int(row.season),
            "week": 0,
            "event_type": event_type,
            "team_season_uid": str(row.team_season_uid),
            "owner_uid": team_owner.get(str(row.team_season_uid)),
            "amount": _finite(row.amount),
            "created_at_ms": None,
            "source_uid": str(row.draft_uid),
        }
        event_rows.append(event)
        acquisition_rows.append({**event, "acquisition_type": event_type})

    transactions = pd.read_parquet(NORMALIZED / "transactions.parquet")
    tx_by_uid = {str(row.transaction_uid): row._asdict() for row in transactions.itertuples(index=False)}
    assets = pd.read_parquet(NORMALIZED / "transaction_assets.parquet")
    player_assets = assets[(assets["asset_type"] == "player") & assets["player_uid"].notna()]
    for row in player_assets.itertuples(index=False):
        tx = tx_by_uid.get(str(row.transaction_uid), {})
        from_team = str(row.from_team_season_uid) if pd.notna(row.from_team_season_uid) else None
        to_team = str(row.to_team_season_uid) if pd.notna(row.to_team_season_uid) else None
        if from_team and to_team:
            event_type = "traded"
            team_uid = to_team
        elif to_team:
            event_type = "added"
            team_uid = to_team
        else:
            event_type = "dropped"
            team_uid = from_team
        event = {
            "event_uid": str(row.transaction_asset_uid),
            "player_uid": str(row.player_uid),
            "season": int(row.season),
            "week": int(tx.get("week") or 0),
            "event_type": event_type,
            "team_season_uid": team_uid,
            "owner_uid": team_owner.get(team_uid or ""),
            "amount": _finite(row.amount if pd.notna(row.amount) else tx.get("waiver_bid")),
            "created_at_ms": int(tx.get("created_at_ms")) if tx.get("created_at_ms") is not None else None,
            "source_uid": str(row.transaction_uid),
        }
        event_rows.append(event)
        if event_type in {"added", "traded"}:
            acquisition_rows.append({**event, "acquisition_type": event_type})

    started = entries[entries["started"]].copy()
    for row in started.itertuples(index=False):
        event_rows.append(
            {
                "event_uid": f"start:{row.lineup_entry_uid}",
                "player_uid": str(row.player_uid),
                "season": int(row.season),
                "week": int(row.week),
                "event_type": "started",
                "team_season_uid": str(row.team_season_uid),
                "owner_uid": team_owner.get(str(row.team_season_uid)),
                "amount": None,
                "created_at_ms": None,
                "source_uid": str(row.lineup_uid),
            }
        )

    ownership_events = pd.DataFrame(event_rows)
    acquisitions = pd.DataFrame(acquisition_rows)
    return {
        "player_seasons": player_seasons,
        "player_weeks": player_weeks,
        "ownership_events": ownership_events,
        "acquisitions": acquisitions,
    }


def _current_keeper_costs(
    sleeper_to_uid: dict[str, str],
    owners: dict[str, dict[str, Any]],
    sleeper_owner_to_uid: dict[str, str],
) -> tuple[pd.DataFrame, dict[int, str]]:
    model = _yaml(CONFIG / "draft_model.yml")
    pricing = model["keeper_pricing"]
    overrides = pricing.get("overrides") or {}
    increase = int(pricing.get("default_increase") or 5)
    previous = pd.read_parquet(NORMALIZED / "draft_picks.parquet")
    previous = previous[previous["season"] == 2025]
    prior_prices = {
        str(row.sleeper_player_id): int(row.amount)
        for row in previous.itertuples(index=False)
        if pd.notna(row.amount)
    }
    roster_rows = _json(CURRENT / "rosters.json")
    draft_rows = _json(CURRENT / "drafts.json")
    draft_pick_map = _json(CURRENT / "draft_picks.json")
    latest_draft = max(draft_rows, key=lambda row: int(row.get("created") or 0), default={})
    latest_picks = draft_pick_map.get(str(latest_draft.get("draft_id") or "")) or []
    drafted_keepers: dict[int, list[str]] = defaultdict(list)
    for pick in latest_picks:
        if pick.get("is_keeper") and pick.get("roster_id") is not None:
            drafted_keepers[int(pick["roster_id"])].append(str(pick.get("player_id") or ""))
    roster_to_owner: dict[int, str] = {}
    rows: list[dict[str, Any]] = []
    for roster in roster_rows:
        roster_id = int(roster["roster_id"])
        owner_uid = sleeper_owner_to_uid.get(str(roster.get("owner_id")))
        if owner_uid:
            roster_to_owner[roster_id] = owner_uid
        keeper_ids = [str(value) for value in roster.get("keepers") or []]
        if not keeper_ids:
            keeper_ids = drafted_keepers.get(roster_id, [])
        for sleeper_id_value in keeper_ids:
            sleeper_id = str(sleeper_id_value)
            override = overrides.get(sleeper_id)
            prior = prior_prices.get(sleeper_id)
            if override:
                amount = int(override["amount"])
                basis = "commissioner_override"
                reason = override.get("reason")
            elif prior is not None:
                amount = prior + increase
                basis = "prior_auction_plus_increase"
                reason = f"2025 price ${prior} + ${increase}"
            else:
                raise ValueError(f"Keeper {sleeper_id} has no prior price or configured override")
            rows.append(
                {
                    "season": 2026,
                    "player_uid": sleeper_to_uid.get(sleeper_id),
                    "sleeper_player_id": sleeper_id,
                    "roster_id": roster_id,
                    "owner_uid": owner_uid,
                    "keeper_cost": amount,
                    "prior_auction_cost": prior,
                    "pricing_basis": basis,
                    "reason": reason,
                }
            )
    result = pd.DataFrame(rows).sort_values(["roster_id", "sleeper_player_id"])
    if int(result["keeper_cost"].sum()) != 301:
        raise ValueError(f"Expected $301 keeper spend, found ${int(result['keeper_cost'].sum())}")
    return result, roster_to_owner


def _select_roster_demand(values: pd.DataFrame, keeper_uids: set[str]) -> list[str]:
    eligible = values[
        (values["draft_score"].notna() | (values["position"] == "DEF"))
        & values["active"]
        & (values["nfl_team"].notna() | values["player_uid"].isin(keeper_uids))
    ].copy()
    eligible = eligible.sort_values(["draft_score", "market_score", "player_uid"], ascending=[False, False, True])
    keeper_positions = values[values["player_uid"].isin(keeper_uids)]["position"].value_counts().to_dict()
    selected: list[str] = []
    selected_set: set[str] = set()

    def take(position: str | None, count: int, allowed: set[str] | None = None) -> None:
        if count <= 0:
            return
        pool = eligible
        if position:
            pool = pool[pool["position"] == position]
        if allowed:
            pool = pool[pool["position"].isin(allowed)]
        taken = 0
        for uid in pool["player_uid"].astype(str):
            if uid in keeper_uids or uid in selected_set:
                continue
            selected.append(uid)
            selected_set.add(uid)
            taken += 1
            if taken >= count:
                break

    fixed = {"QB": 16, "RB": 24, "WR": 24, "TE": 8, "K": 8, "DEF": 8}
    for position, demand in fixed.items():
        take(position, max(demand - int(keeper_positions.get(position, 0)), 0))
    flex_keeper_overflow = sum(max(int(keeper_positions.get(pos, 0)) - fixed[pos], 0) for pos in ("RB", "WR", "TE"))
    take(None, max(16 - flex_keeper_overflow, 0), {"RB", "WR", "TE"})
    take(None, 152 - len(keeper_uids) - len(selected), {"QB", "RB", "WR", "TE"})
    if len(selected) != 152 - len(keeper_uids):
        raise ValueError(f"Roster demand selected {len(selected)} open players; expected {152-len(keeper_uids)}")
    return selected


def build_valuations(tables: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, pd.DataFrame, dict[int, str]]:
    sleeper_to_uid, _, players_by_uid = _identity_maps()
    owners, sleeper_owner_to_uid, _ = _owner_context()
    keepers, roster_to_owner = _current_keeper_costs(sleeper_to_uid, owners, sleeper_owner_to_uid)
    keeper_uids = set(keepers["player_uid"].dropna().astype(str))
    raw = _json(RAW_PLAYERS).get("players") or {}
    current_rows: list[dict[str, Any]] = []
    for sleeper_id, player in raw.items():
        position = str(player.get("position") or "")
        uid = sleeper_to_uid.get(str(sleeper_id))
        if not uid or position not in FANTASY_POSITIONS:
            continue
        current_rows.append(
            {
                "player_uid": uid,
                "sleeper_player_id": str(sleeper_id),
                "display_name": player.get("full_name") or players_by_uid.get(uid, {}).get("display_name"),
                "position": position,
                "nfl_team": player.get("team"),
                "active": bool(player.get("active")),
                "status": player.get("status"),
                "injury_status": player.get("injury_status"),
                "depth_chart_position": player.get("depth_chart_position"),
                "depth_chart_order": _finite(player.get("depth_chart_order")),
                "search_rank": _finite(player.get("search_rank")),
                "years_experience": _finite(player.get("years_exp")),
            }
        )
    values = pd.DataFrame(current_rows).drop_duplicates("player_uid")
    ranked_market = values["search_rank"].notna() & values["active"] & values["nfl_team"].notna()
    if ranked_market.any():
        inverse_rank = -values.loc[ranked_market, "search_rank"]
        values.loc[ranked_market, "market_score"] = percentile(inverse_rank)
    else:
        values["market_score"] = float("nan")

    season = tables["player_seasons"]
    performance = season[season["season"] == 2025][
        ["player_uid", "games", "points_per_game", "replacement_war"]
    ].copy()
    weeks = tables["player_weeks"]
    weeks = weeks[(weeks["season"] == 2025) & weeks["provider_points"].notna()].copy()
    consistency_rows: list[dict[str, Any]] = []
    for uid, group in weeks.groupby("player_uid"):
        points = pd.to_numeric(group["provider_points"], errors="coerce").dropna()
        if points.empty:
            continue
        position = str(group.iloc[0]["position"] or "")
        mean = float(points.mean())
        volatility = float(points.std(ddof=0) / mean) if mean > 0 else 10.0
        consistency_rows.append(
            {
                "player_uid": uid,
                "boom_rate": float((points >= BOOM_THRESHOLDS.get(position, 15.0)).mean()),
                "volatility": volatility,
                "inverse_volatility": 1.0 / (1.0 + max(volatility, 0.0)),
            }
        )
    consistency = pd.DataFrame(consistency_rows)
    performance = performance.merge(consistency, on="player_uid", how="left")
    performance = performance.merge(values[["player_uid", "position"]], on="player_uid", how="left")
    for column in ("points_per_game", "replacement_war", "boom_rate", "inverse_volatility"):
        performance[f"{column}_percentile"] = performance.groupby("position")[column].transform(percentile)
    performance["consistency_percentile"] = (
        performance["boom_rate_percentile"].fillna(0.0) * 0.5
        + performance["inverse_volatility_percentile"].fillna(0.0) * 0.5
    )
    performance["performance_score"] = (
        performance["points_per_game_percentile"].fillna(0.0) * 0.55
        + performance["replacement_war_percentile"].fillna(0.0) * 0.30
        + performance["consistency_percentile"].fillna(0.0) * 0.15
    )
    values = values.merge(
        performance[
            [
                "player_uid", "games", "points_per_game", "replacement_war", "boom_rate", "volatility",
                "consistency_percentile", "performance_score",
            ]
        ],
        on="player_uid",
        how="left",
    )
    scores: list[float | None] = []
    reliability: list[float] = []
    confidence: list[str] = []
    for row in values.itertuples(index=False):
        games = int(row.games) if pd.notna(row.games) else 0
        perf = _finite(row.performance_score)
        market = _finite(row.market_score)
        score, rel = draft_score(perf, market, games)
        scores.append(score)
        reliability.append(rel)
        confidence.append(confidence_level(games, market is not None))
    values["draft_score"] = scores
    values["reliability"] = reliability
    values["confidence"] = confidence
    actionable = values["active"] & values["nfl_team"].notna()
    values["rank_overall"] = len(values) + 1
    values.loc[actionable, "rank_overall"] = values.loc[actionable, "draft_score"].rank(
        method="first", ascending=False, na_option="bottom"
    ).astype(int)
    values["rank_position"] = len(values) + 1
    values.loc[actionable, "rank_position"] = values.loc[actionable].groupby("position")["draft_score"].rank(
        method="first", ascending=False, na_option="bottom"
    ).astype(int)
    values[["rank_overall", "rank_position"]] = values[["rank_overall", "rank_position"]].astype(int)
    values["scarcity_tier"] = "pool"
    for position, group in values[actionable].groupby("position"):
        elite_cut = max(2, math.ceil(len(group) * 0.10))
        core_cut = max(4, math.ceil(len(group) * 0.35))
        values.loc[group.index, "scarcity_tier"] = group["rank_position"].map(
            lambda rank: "elite" if rank <= elite_cut else ("core" if rank <= core_cut else "pool")
        )
    values["keeper"] = values["player_uid"].isin(keeper_uids)
    keeper_cost_by_uid = dict(zip(keepers["player_uid"].astype(str), keepers["keeper_cost"].astype(int)))
    keeper_owner_by_uid = dict(zip(keepers["player_uid"].astype(str), keepers["owner_uid"].astype(str)))
    values["keeper_cost"] = values["player_uid"].map(keeper_cost_by_uid)
    values["keeper_owner_uid"] = values["player_uid"].map(keeper_owner_by_uid)

    selected = _select_roster_demand(values, keeper_uids)
    selected_set = set(selected)
    selected_values = values[values["player_uid"].isin(selected_set)].copy()
    replacement = selected_values.groupby("position")["draft_score"].min().to_dict()
    weights = {
        str(row.player_uid): max((_finite(row.draft_score) or 0.0) - (_finite(replacement.get(row.position)) or 0.0), 0.0)
        for row in selected_values.itertuples(index=False)
    }
    discretionary = reconcile_integer_pool(weights, 1163)
    recommended = {uid: 1 + discretionary.get(uid, 0) for uid in selected}
    if sum(recommended.values()) != 1299:
        raise ValueError(f"Auction recommendations total ${sum(recommended.values())}; expected $1299")
    values["in_roster_demand"] = values["player_uid"].isin(selected_set)
    values["recommended_value"] = values["player_uid"].map(recommended).fillna(1).astype(int)
    open_weight_total = sum(weights.values()) or 1.0
    shadow_values: dict[str, int] = {}
    for row in values[values["keeper"]].itertuples(index=False):
        surplus = max(float(row.draft_score or 0.0) - float(replacement.get(row.position, 0.0)), 0.0)
        shadow_values[str(row.player_uid)] = 1 + round(1163 * surplus / open_weight_total)
    values.loc[values["keeper"], "recommended_value"] = values.loc[values["keeper"], "player_uid"].map(shadow_values).fillna(1).astype(int)
    values["keeper_surplus"] = values.apply(
        lambda row: int(row["recommended_value"] - row["keeper_cost"]) if pd.notna(row["keeper_cost"]) else None,
        axis=1,
    )
    values["model_version"] = "tatnall_draft_score_v1"
    values["verified_season"] = 2025
    return values, keepers, roster_to_owner


def _team_identity_maps(owners: dict[str, dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    teams = pd.read_parquet(NORMALIZED / "team_seasons.parquet")
    team_identity: dict[str, dict[str, Any]] = {}
    for row in teams.itertuples(index=False):
        owner_uid = str(row.owner_uid)
        identity = owners.get(owner_uid) or {
            "ownerUid": owner_uid,
            "ownerName": "Unknown owner",
            "teamName": "Unknown team",
            "accent": "#d7a928",
            "monogram": "TL",
            "motto": "",
        }
        team_identity[str(row.team_season_uid)] = identity
    return team_identity, dict(zip(teams["team_season_uid"].astype(str), teams["owner_uid"].astype(str)))


def _editorial_payload(
    tables: dict[str, pd.DataFrame],
    owners: dict[str, dict[str, Any]],
    generated_at: str,
) -> dict[str, Any]:
    lineups = pd.read_parquet(NORMALIZED / "lineups.parquet")
    entries = pd.read_parquet(NORMALIZED / "lineup_entries.parquet")
    teams = pd.read_parquet(NORMALIZED / "team_seasons.parquet")
    players = pd.read_parquet(NORMALIZED / "players.parquet")[["player_uid", "position"]]
    season_lineups = lineups[(lineups["season"] == 2025) & (~lineups["is_playoff_week"])].copy()
    rows: list[dict[str, Any]] = []
    for team_uid, group in season_lineups.groupby("team_season_uid"):
        all_play_wins = 0.0
        games = 0
        for row in group.itertuples(index=False):
            peers = season_lineups[season_lineups["week"] == row.week]["points"]
            all_play_wins += float((peers < row.points).sum()) + 0.5 * float((peers == row.points).sum() - 1)
            games += max(len(peers) - 1, 0)
        identity = owners.get(str(teams.loc[teams["team_season_uid"] == team_uid, "owner_uid"].iloc[0]))
        team_row = teams[teams["team_season_uid"] == team_uid].iloc[0]
        rows.append(
            {
                "teamSeasonUid": str(team_uid),
                "ownerUid": identity["ownerUid"] if identity else str(team_row["owner_uid"]),
                "ownerName": identity["ownerName"] if identity else "Unknown owner",
                "teamName": identity["teamName"] if identity else "Unknown team",
                "accent": identity["accent"] if identity else "#d7a928",
                "wins": int(team_row["wins"]),
                "allPlayWins": round(all_play_wins, 1),
                "allPlayGames": games,
                "expectedWins": round(all_play_wins / 7.0, 2) if games else 0.0,
                "luck": round(int(team_row["wins"]) - all_play_wins / 7.0, 2) if games else 0.0,
                "pointsFor": float(team_row["points_for"]),
            }
        )

    entries_2025 = entries[(entries["season"] == 2025)].merge(players, on="player_uid", how="left")
    efficiency: dict[str, list[float]] = defaultdict(list)
    for lineup_uid, group in entries_2025.groupby("lineup_uid"):
        actual = float(group.loc[group["started"], "fantasy_points"].fillna(0).sum())
        picked: set[str] = set()

        def take(position: str, count: int) -> float:
            eligible = group[(group["position"] == position) & (~group["lineup_entry_uid"].isin(picked))]
            best = eligible.nlargest(count, "fantasy_points")
            picked.update(best["lineup_entry_uid"].astype(str))
            return float(best["fantasy_points"].fillna(0).sum())

        optimal = sum(take(pos, count) for pos, count in {"QB": 2, "RB": 3, "WR": 3, "TE": 1, "K": 1, "DEF": 1}.items())
        flex = group[(group["position"].isin(["RB", "WR", "TE"])) & (~group["lineup_entry_uid"].isin(picked))].nlargest(2, "fantasy_points")
        optimal += float(flex["fantasy_points"].fillna(0).sum())
        team_uid = str(group.iloc[0]["team_season_uid"])
        if optimal > 0:
            efficiency[team_uid].append(min(actual / optimal, 1.0))
    for row in rows:
        samples = efficiency.get(row["teamSeasonUid"], [])
        row["managerEfficiency"] = round(sum(samples) / len(samples), 3) if samples else None
        recent = season_lineups[season_lineups["team_season_uid"] == row["teamSeasonUid"]].sort_values("week").tail(4)
        row["recentPoints"] = float(recent["points"].sum())

    frame = pd.DataFrame(rows)
    frame["pointsPct"] = percentile(frame["pointsFor"])
    frame["allPlayPct"] = percentile(frame["allPlayWins"])
    frame["efficiencyPct"] = percentile(frame["managerEfficiency"])
    frame["recentPct"] = percentile(frame["recentPoints"])
    frame["powerScore"] = (
        frame["pointsPct"] * 45 + frame["allPlayPct"] * 25 + frame["efficiencyPct"] * 20 + frame["recentPct"] * 10
    ).round(1)
    frame = frame.sort_values(["powerScore", "pointsFor"], ascending=False)
    frame["powerRank"] = range(1, len(frame) + 1)
    rankings = frame[
        [
            "powerRank", "powerScore", "ownerUid", "ownerName", "teamName", "accent", "wins", "pointsFor",
            "expectedWins", "luck", "allPlayWins", "allPlayGames", "managerEfficiency",
        ]
    ].to_dict("records")
    note = str((_yaml(CONFIG / "draft_model.yml").get("editorial") or {}).get("commissioner_note") or "").strip()
    current_drafts = _json(CURRENT / "drafts.json")
    current_pick_map = _json(CURRENT / "draft_picks.json")
    current_draft = max(current_drafts, key=lambda row: int(row.get("created") or 0), default={})
    current_pick_count = len(current_pick_map.get(str(current_draft.get("draft_id") or "")) or [])
    post_draft = current_draft.get("status") == "complete" and current_pick_count == 152
    return {
        "meta": {
            "schemaVersion": "3.0.0",
            "generatedAt": generated_at,
            "modelVersion": "tatnall_power_v1",
            "verifiedThrough": 2025,
        },
        "lead": {
            "kicker": "Tatnall 2026 Season Hub" if post_draft else "Tatnall Draft Central",
            "headline": (
                "The auction is over. Eight rosters enter the 2026 race."
                if post_draft
                else "Sixteen keepers are locked. The remaining $1,299 is up for auction."
            ),
            "dek": (
                "Every roster, weekly matchup, Sleeper projection, transaction, and eleven-season league record now lives in one command center."
                if post_draft
                else "The first Tatnall Draft Score board is live with verified 2025 performance, market context, and every franchise's real roster constraints."
            ),
            "commissionerNote": note or None,
        },
        "powerRankings": rankings,
        "methodology": {
            "powerRankings": "45% points, 25% all-play, 20% manager efficiency, 10% final-four-week form.",
            "expectedWins": "All-play wins divided by seven opponents per completed regular-season week.",
            "luck": "Actual regular-season wins minus expected wins.",
            "managerEfficiency": "Submitted starter points divided by the best legal lineup available on that roster each week.",
            "playoffOdds": "Not published until league tiebreaker rules are verified.",
        },
        "history": {
            "headline": "This week in Tatnall history",
            "items": [
                "The league enters its twelfth season with all eleven completed champions preserved in the canonical archive.",
                "The 2025 season is the first fully verified scoring era for Tatnall player value.",
            ],
        },
    }


def publish_player_intelligence(
    tables: dict[str, pd.DataFrame],
    values: pd.DataFrame,
    keepers: pd.DataFrame,
    roster_to_owner: dict[int, str],
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    owners, sleeper_owner_to_uid, _ = _owner_context()
    team_identity, _ = _team_identity_maps(owners)
    sleeper_to_uid, _, players_by_uid = _identity_maps()
    current_players = _json(RAW_PLAYERS).get("players") or {}
    current_rosters = _json(CURRENT / "rosters.json")
    draft_rows = _json(CURRENT / "drafts.json")
    draft_pick_map = _json(CURRENT / "draft_picks.json")
    draft = max(draft_rows, key=lambda row: int(row.get("created") or 0))
    draft_id = str(draft["draft_id"])
    static_picks = draft_pick_map.get(draft_id) or []
    current_owner_by_player: dict[str, str] = {}
    current_roster_id_by_player: dict[str, int] = {}
    for roster in current_rosters:
        roster_id = int(roster["roster_id"])
        owner_uid = sleeper_owner_to_uid.get(str(roster.get("owner_id")))
        for sleeper_id in roster.get("players") or []:
            uid = sleeper_to_uid.get(str(sleeper_id))
            if uid and owner_uid:
                current_owner_by_player[uid] = owner_uid
                current_roster_id_by_player[uid] = roster_id

    keeper_by_uid = {str(row.player_uid): row._asdict() for row in keepers.itertuples(index=False)}
    values_by_uid = {str(row.player_uid): row._asdict() for row in values.itertuples(index=False)}
    keeper_spend_by_roster = keepers.groupby("roster_id")["keeper_cost"].sum().astype(int).to_dict()
    keeper_count_by_roster = keepers.groupby("roster_id").size().to_dict()
    teams = []
    for roster in sorted(current_rosters, key=lambda row: int(row["roster_id"])):
        roster_id = int(roster["roster_id"])
        owner_uid = roster_to_owner.get(roster_id)
        identity = owners.get(owner_uid or "") or {
            "ownerUid": owner_uid,
            "ownerName": "Unknown owner",
            "teamName": f"Roster {roster_id}",
            "monogram": "TL",
            "accent": "#d7a928",
            "motto": "",
        }
        keeper_players = []
        counts = {position: 0 for position in FANTASY_POSITIONS}
        roster_keepers = keepers[keepers["roster_id"] == roster_id]
        for keeper_row in roster_keepers.itertuples(index=False):
            sleeper_id = str(keeper_row.sleeper_player_id)
            uid = str(keeper_row.player_uid) if pd.notna(keeper_row.player_uid) else sleeper_to_uid.get(sleeper_id)
            value = values_by_uid.get(uid or "", {})
            position = str(value.get("position") or current_players.get(sleeper_id, {}).get("position") or "")
            if position in counts:
                counts[position] += 1
            keeper = keeper_by_uid.get(uid or "", {})
            keeper_players.append(
                {
                    "playerUid": uid,
                    "sleeperId": sleeper_id,
                    "name": value.get("display_name") or current_players.get(sleeper_id, {}).get("full_name"),
                    "position": position,
                    "cost": int(keeper.get("keeper_cost") or 0),
                    "modelValue": int(value.get("recommended_value") or 1),
                    "surplus": value.get("keeper_surplus"),
                }
            )
        spend = int(keeper_spend_by_roster.get(roster_id, 0))
        open_slots = 19 - int(keeper_count_by_roster.get(roster_id, 0))
        teams.append(
            {
                **identity,
                "rosterId": roster_id,
                "keeperSpend": spend,
                "remainingBudget": 200 - spend,
                "openSlots": open_slots,
                "maximumBid": 200 - spend - max(open_slots - 1, 0),
                "positionCounts": counts,
                "keepers": keeper_players,
            }
        )

    value_rows = []
    for row in values.sort_values(["rank_overall", "display_name"]).itertuples(index=False):
        keeper = bool(row.keeper)
        inherited_owner_uid = current_owner_by_player.get(str(row.player_uid))
        owner_uid = inherited_owner_uid
        owner = owners.get(owner_uid or "")
        if (not bool(row.active) or pd.isna(row.nfl_team)) and not keeper:
            continue
        value_rows.append(
            {
                "playerUid": str(row.player_uid),
                "sleeperId": str(row.sleeper_player_id),
                "name": row.display_name,
                "position": row.position,
                "nflTeam": row.nfl_team if pd.notna(row.nfl_team) else None,
                "active": bool(row.active),
                "nflStatus": row.status if pd.notna(row.status) else None,
                "injuryStatus": row.injury_status if pd.notna(row.injury_status) else None,
                "depthChart": {
                    "position": row.depth_chart_position if pd.notna(row.depth_chart_position) else None,
                    "order": int(row.depth_chart_order) if pd.notna(row.depth_chart_order) else None,
                },
                "rank": int(row.rank_overall),
                "positionRank": int(row.rank_position),
                "draftScore": _finite(row.draft_score),
                "performanceScore": _finite(row.performance_score),
                "marketScore": _finite(row.market_score),
                "reliability": float(row.reliability),
                "confidence": row.confidence,
                "games": int(row.games) if pd.notna(row.games) else 0,
                "pointsPerGame": _finite(row.points_per_game),
                "replacementWar": _finite(row.replacement_war),
                "boomRate": _finite(row.boom_rate),
                "volatility": _finite(row.volatility),
                "scarcityTier": row.scarcity_tier,
                "recommendedValue": int(row.recommended_value),
                "inRosterDemand": bool(row.in_roster_demand),
                "availability": "kept" if keeper else ("rostered" if owner_uid else "available"),
                "keeper": keeper,
                "keeperCost": int(row.keeper_cost) if pd.notna(row.keeper_cost) else None,
                "keeperSurplus": int(row.keeper_surplus) if pd.notna(row.keeper_surplus) else None,
                "currentOwner": (
                    {"ownerUid": owner_uid, "ownerName": owner["ownerName"], "teamName": owner["teamName"], "accent": owner["accent"]}
                    if owner else None
                ),
            }
        )

    budget = {
        "leagueTotal": 1600,
        "rosterSpots": 152,
        "keeperSpend": 301,
        "keeperCount": 16,
        "auctionPool": 1299,
        "openSpots": 136,
        "minimumReserve": 136,
        "discretionaryPool": 1163,
        "recommendedAuctionTotal": sum(row["recommendedValue"] for row in value_rows if row["inRosterDemand"] and not row["keeper"]),
    }
    if budget["recommendedAuctionTotal"] != 1299:
        raise ValueError("Published auction pool does not reconcile to $1,299")
    war_room_players = [
        row
        for row in value_rows
        if row["rank"] <= 500 or row["inRosterDemand"] or row["keeper"] or row["currentOwner"] is not None
    ]
    war_room = {
        "meta": {
            "schemaVersion": "3.0.0",
            "generatedAt": generated_at,
            "modelVersion": "tatnall_draft_score_v1",
            "verifiedPerformanceSeason": 2025,
            "historicalModelCoverage": "2025-present only",
        },
        "league": {
            "season": 2026,
            "teams": 8,
            "budgetPerTeam": 200,
            "rosterSpotsPerTeam": 19,
            "lineup": {"QB": 2, "RB": 3, "WR": 3, "TE": 1, "FLEX": 2, "K": 1, "DEF": 1, "BN": 6},
        },
        "budget": budget,
        "draft": {
            "draftId": draft_id,
            "status": draft.get("status"),
            "startTime": datetime.fromtimestamp(int(draft.get("start_time") or 0) / 1000, tz=timezone.utc).isoformat() if draft.get("start_time") else None,
            "draftEndpoint": f"https://api.sleeper.app/v1/draft/{draft_id}",
            "picksEndpoint": f"https://api.sleeper.app/v1/draft/{draft_id}/picks",
            "pollingSeconds": 15,
            "backoffSeconds": [30, 60, 120],
            "staticPicks": static_picks,
        },
        "teams": teams,
        "players": war_room_players,
        "methodology": {
            "label": "Tatnall Draft Score — not a projection",
            "performance": "55% 2025 PPG percentile, 30% replacement-WAR percentile, 15% boom-rate/inverse-volatility consistency percentile, all within position.",
            "blend": "At eight verified games: 85% performance and 15% Sleeper market signal. Limited samples progressively fall back to market rank.",
            "injuries": "Injury and depth-chart context is displayed but never silently changes the score.",
            "auction": "A $1 floor is reserved for every open slot; the remaining $1,163 is allocated to positive value above positional replacement and integer-reconciled.",
        },
    }
    sizes = {"war-room/index.json": _write_json(PUBLIC / "war-room" / "index.json", war_room)}

    seasons = tables["player_seasons"]
    weeks = tables["player_weeks"]
    events = tables["ownership_events"]
    acquisitions = tables["acquisitions"]
    ids = pd.read_parquet(NORMALIZED / "player_ids.parquet")
    ids_by_uid = defaultdict(list)
    for row in ids.itertuples(index=False):
        if str(row.id_type) in {"sleeper", "espn", "gsis"}:
            ids_by_uid[str(row.player_uid)].append({"type": str(row.id_type), "value": str(row.id_value)})

    for value in value_rows:
        uid = value["playerUid"]
        player = players_by_uid.get(uid, {})
        player_seasons = seasons[seasons["player_uid"] == uid].sort_values("season", ascending=False)
        player_events = events[events["player_uid"] == uid].sort_values(["season", "week"], ascending=[False, False])
        timeline = []
        for event in player_events.to_dict("records"):
            identity = team_identity.get(str(event.get("team_season_uid")))
            timeline.append(
                {
                    "eventUid": event["event_uid"],
                    "season": int(event["season"]),
                    "week": int(event["week"]),
                    "type": event["event_type"],
                    "amount": event["amount"],
                    "team": (
                        {"ownerUid": identity["ownerUid"], "ownerName": identity["ownerName"], "teamName": identity["teamName"], "accent": identity["accent"]}
                        if identity else None
                    ),
                }
            )
        comparable_rows = sorted(
            (
                row for row in value_rows
                if row["playerUid"] != uid
                and row["position"] == value["position"]
                and row["draftScore"] is not None
                and value["draftScore"] is not None
            ),
            key=lambda row: (abs(float(row["draftScore"]) - float(value["draftScore"])), row["rank"]),
        )[:3]
        career = {
            "meta": {"schemaVersion": "3.0.0", "generatedAt": generated_at},
            "player": {
                "playerUid": uid,
                "sleeperId": value["sleeperId"],
                "name": value["name"],
                "position": value["position"],
                "nflTeam": value["nflTeam"],
                "active": value["active"],
                "nflStatus": value["nflStatus"],
                "injuryStatus": value["injuryStatus"],
                "depthChart": value["depthChart"],
                "college": player.get("college"),
                "yearsExperience": _finite(player.get("years_experience")),
                "providerIds": ids_by_uid[uid],
            },
            "current": {
                "availability": value["availability"],
                "owner": value["currentOwner"],
                "keeper": value["keeper"],
                "keeperCost": value["keeperCost"],
                "modelValue": value["recommendedValue"],
                "keeperSurplus": value["keeperSurplus"],
                "draftScore": value["draftScore"],
                "confidence": value["confidence"],
                "scarcityTier": value["scarcityTier"],
                "positionRank": value["positionRank"],
            },
            "comparables": [
                {
                    "playerUid": row["playerUid"],
                    "name": row["name"],
                    "position": row["position"],
                    "nflTeam": row["nflTeam"],
                    "modelValue": row["recommendedValue"],
                    "draftScore": row["draftScore"],
                    "confidence": row["confidence"],
                }
                for row in comparable_rows
            ],
            "career": [
                {
                    "season": int(row.season),
                    "games": int(row.games),
                    "providerPoints": row.provider_points,
                    "pointsPerGame": row.points_per_game,
                    "replacementWar": row.replacement_war,
                    "scoringEra": row.scoring_era,
                    "modelVerified": bool(row.model_verified),
                }
                for row in player_seasons.itertuples(index=False)
            ],
            "timeline": timeline,
        }
        relative = f"players/{uid}/career.json"
        sizes[relative] = _write_json(PUBLIC / relative, career)
        available_seasons = set(int(value) for value in player_seasons["season"].tolist()) | {2025}
        for season_number in sorted(available_seasons):
            player_week = weeks[(weeks["player_uid"] == uid) & (weeks["season"] == season_number)].sort_values("week")
            player_acquisitions = acquisitions[(acquisitions["player_uid"] == uid) & (acquisitions["season"] == season_number)]
            season_payload = {
                "meta": {
                    "schemaVersion": "3.0.0",
                    "generatedAt": generated_at,
                    "season": season_number,
                    "scoringEra": "verified_tatnall" if season_number >= 2025 else "provider_recorded",
                    "modelVerified": season_number >= 2025,
                },
                "playerUid": uid,
                "season": season_number,
                "weeks": [
                    {
                        "week": int(row.week),
                        "points": row.provider_points,
                        "positionalBaseline": row.positional_baseline,
                        "replacementWar": row.replacement_war,
                        "tatnallStarts": int(row.tatnall_starts),
                    }
                    for row in player_week.itertuples(index=False)
                ],
                "acquisitions": [
                    {
                        "week": int(row.week),
                        "type": row.acquisition_type,
                        "amount": row.amount,
                        "team": team_identity.get(str(row.team_season_uid)),
                    }
                    for row in player_acquisitions.itertuples(index=False)
                ],
            }
            season_relative = f"players/{uid}/{season_number}.json"
            sizes[season_relative] = _write_json(PUBLIC / season_relative, season_payload)

    safe_id = re.compile(r"^[A-Za-z0-9._-]+$")
    profile_uids = set(value["playerUid"] for value in value_rows)
    for row in ids.itertuples(index=False):
        uid = str(row.player_uid)
        provider_id = str(row.id_value)
        if uid not in profile_uids or str(row.id_type) not in {"sleeper", "espn"} or not safe_id.fullmatch(provider_id):
            continue
        _write_json(
            PUBLIC / "players" / "resolve" / f"{provider_id}.json",
            {"playerUid": uid, "canonicalUrl": f"/players/{uid}", "provider": str(row.id_type)},
        )

    editorial = _editorial_payload(tables, owners, generated_at)
    sizes["now/editorial.json"] = _write_json(PUBLIC / "now" / "editorial.json", editorial)
    oversized = {path: size for path, size in sizes.items() if size >= 500_000}
    if oversized:
        raise ValueError(f"Player intelligence resources exceed 500 KB: {oversized}")
    return {"files": len(sizes), "maxBytes": max(sizes.values()), "players": len(value_rows)}


def _update_schema(tables: dict[str, pd.DataFrame]) -> None:
    schema_path = NORMALIZED / "schema.json"
    schema = _json(schema_path)
    for name, table in tables.items():
        schema.setdefault("tables", {})[name] = {
            "path": f"data/normalized/{name}.parquet",
            "rows": len(table),
            "fields": list(table.columns),
        }
    _write_json(schema_path, schema, pretty=True)


def build(*, publish: bool = True) -> dict[str, Any]:
    tables = build_player_tables()
    values, keepers, roster_to_owner = build_valuations(tables)
    tables["keeper_costs"] = keepers
    tables["player_values"] = values
    for name, table in tables.items():
        table.to_parquet(NORMALIZED / f"{name}.parquet", index=False)
    _update_schema(tables)
    publication = publish_player_intelligence(tables, values, keepers, roster_to_owner) if publish else None
    summary = {name: len(table) for name, table in tables.items()}
    print(f"Player intelligence OK: {summary}; publication={publication}")
    return {"tables": summary, "publication": publication}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--normalize-only", action="store_true")
    args = parser.parse_args()
    build(publish=not args.normalize_only)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
