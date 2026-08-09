from __future__ import annotations

from pathlib import Path
from uuid import UUID

import pytest

from scripts.normalize.player_identity import build_canonical_players


ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def players():
    return build_canonical_players(ROOT)


def test_lamar_jackson_identities_are_distinct_and_correct(players) -> None:
    lamars = [row for row in players.players if row["display_name"] == "Lamar Jackson"]
    assert {(row["position"], row["active"]) for row in lamars} == {
        ("QB", True),
        ("CB", False),
    }
    by_position = {row["position"]: row for row in lamars}
    ids_by_player = {
        row["player_uid"]: {
            item["id_type"]: item["id_value"]
            for item in players.player_ids
            if item["player_uid"] == row["player_uid"]
        }
        for row in lamars
    }
    assert ids_by_player[by_position["QB"]["player_uid"]]["sleeper"] == "4881"
    assert ids_by_player[by_position["QB"]["player_uid"]]["espn"] == "3916387"
    assert ids_by_player[by_position["CB"]["player_uid"]]["sleeper"] == "6994"
    assert ids_by_player[by_position["CB"]["player_uid"]]["espn"] == "4034849"
    assert players.name_fallbacks[0]["player_uid"] == by_position["QB"]["player_uid"]


def test_provider_ids_are_unique_or_quarantined(players) -> None:
    claims = [(row["id_type"], row["id_value"]) for row in players.player_ids]
    assert len(claims) == len(set(claims))
    quarantined = {
        (row["id_type"], row["id_value"]) for row in players.report["conflicts"]
    }
    assert quarantined.isdisjoint(claims)
    assert players.report["summary"]["quarantined_provider_id_collisions"] > 0


def test_every_player_uses_a_canonical_uuid(players) -> None:
    assert len(players.players) == len({row["player_uid"] for row in players.players})
    for row in players.players:
        assert str(UUID(row["player_uid"])) == row["player_uid"]


def test_current_sleeper_snapshot_enriches_active_fantasy_players(players) -> None:
    qb = next(
        row
        for row in players.players
        if row["display_name"] == "Lamar Jackson" and row["position"] == "QB"
    )
    assert qb["nfl_team"] == "BAL"
    assert qb["college"] == "Louisville"
    assert qb["active"] is True
    assert players.report["summary"]["authoritative_current_records"] >= 3000
