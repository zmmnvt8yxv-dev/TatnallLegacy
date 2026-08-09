from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from scripts.normalize.player_intelligence import (
    confidence_level,
    draft_score,
    reconcile_integer_pool,
)


ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public" / "data"


def test_draft_score_formula_and_confidence_are_deterministic() -> None:
    score, reliability = draft_score(0.8, 0.6, 8)
    assert reliability == 1.0
    assert score == 0.85 * 0.8 + 0.15 * 0.6
    limited, reliability = draft_score(0.8, 0.6, 4)
    assert reliability == 0.5
    assert limited == 0.5 * (0.85 * 0.8 + 0.15 * 0.6) + 0.5 * 0.6
    assert confidence_level(8, True) == "high"
    assert confidence_level(7, True) == "medium"
    assert confidence_level(3, True) == "low"
    assert confidence_level(10, False) == "medium"


def test_integer_pool_reconciles_exactly_with_stable_ties() -> None:
    first = reconcile_integer_pool({"b": 1, "a": 1, "c": 2}, 11)
    second = reconcile_integer_pool({"c": 2, "a": 1, "b": 1}, 11)
    assert first == second
    assert sum(first.values()) == 11
    assert first == {"b": 3, "a": 3, "c": 5}


def test_war_room_reconciles_budget_and_keeper_rules() -> None:
    room = json.loads((PUBLIC / "war-room/index.json").read_text())
    assert room["budget"] == {
        "leagueTotal": 1600,
        "rosterSpots": 152,
        "keeperSpend": 301,
        "keeperCount": 16,
        "auctionPool": 1299,
        "openSpots": 136,
        "minimumReserve": 136,
        "discretionaryPool": 1163,
        "recommendedAuctionTotal": 1299,
    }
    keepers = [keeper for team in room["teams"] for keeper in team["keepers"]]
    assert len(keepers) == 16
    assert sum(row["cost"] for row in keepers) == 301
    luther = next(row for row in keepers if row["name"] == "Luther Burden")
    assert luther["cost"] == 7
    assert all(player["availability"] == "kept" for player in room["players"] if player["keeper"])
    available_demand = [player for player in room["players"] if player["inRosterDemand"] and not player["keeper"]]
    assert len(available_demand) == 136
    assert sum(player["recommendedValue"] for player in available_demand) == 1299


def test_historical_points_never_claim_verified_model_coverage() -> None:
    resolver = json.loads((PUBLIC / "players/resolve/4881.json").read_text())
    career = json.loads((PUBLIC / f"players/{resolver['playerUid']}/career.json").read_text())
    historical = [row for row in career["career"] if row["season"] < 2025]
    assert historical
    assert all(row["scoringEra"] == "provider_recorded" for row in historical)
    assert all(row["modelVerified"] is False for row in historical)
    assert all(row["replacementWar"] is None for row in historical)
    assert resolver["canonicalUrl"] == f"/players/{resolver['playerUid']}"


def test_2025_auction_replay_is_chronological_and_complete() -> None:
    picks = pd.read_parquet(ROOT / "data/normalized/draft_picks.parquet")
    picks = picks[picks["season"] == 2025].sort_values("pick_no")
    assert picks["pick_no"].astype(int).tolist() == list(range(1, 153))
    assert picks["draft_pick_uid"].is_unique
    assert picks["player_uid"].is_unique
    assert int(picks["amount"].sum()) == 1593


def test_new_public_resources_are_route_sized_and_public_names_are_safe() -> None:
    required = [
        PUBLIC / "war-room/index.json",
        PUBLIC / "now/editorial.json",
        PUBLIC / "now/index.json",
        PUBLIC / "search/index.json",
    ]
    assert all(path.stat().st_size < 500_000 for path in required)
    combined = "\n".join(path.read_text().lower() for path in required)
    assert "only i can say" not in combined
    assert "n-word" not in combined
    assert "team duncan" in combined
