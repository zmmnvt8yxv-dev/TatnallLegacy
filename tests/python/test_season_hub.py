from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from scripts.publish.season_hub import optimize_lineup


ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "sleeper" / "2026" / "current"
PUBLIC = ROOT / "public" / "data"


def load(path: Path):
    return json.loads(path.read_text())


def test_lineup_optimizer_is_legal_and_deterministic() -> None:
    positions = ["QB"] * 3 + ["RB"] * 6 + ["WR"] * 6 + ["TE"] * 3 + ["K"] * 2 + ["DEF"] * 2
    players = [
        {"sleeperId": str(index), "name": f"Player {index:02d}", "position": position}
        for index, position in enumerate(positions, start=1)
    ]
    projections = {player["sleeperId"]: float(100 - index) for index, player in enumerate(players)}
    first = optimize_lineup(players, projections)
    second = optimize_lineup(list(reversed(players)), projections)
    assert first == second
    assert len(first) == 13
    slots = Counter("".join(filter(str.isalpha, row["slot"])) for row in first)
    assert slots == {"QB": 2, "RB": 3, "WR": 3, "TE": 1, "FLEX": 2, "K": 1, "DEF": 1}
    assert all(row["position"] in {"RB", "WR", "TE"} for row in first if row["slot"].startswith("FLEX"))


def test_hub_uses_final_sleeper_draft_and_route_sized_payload() -> None:
    hub = load(PUBLIC / "now/season-hub.json")
    assert hub["meta"]["status"] == "post_draft"
    assert hub["draft"]["status"] == "complete"
    assert hub["draft"]["pickCount"] == 152
    assert hub["draft"]["totalSpend"] == 1577
    assert hub["draft"]["unspent"] == 23
    assert len(hub["teams"]) == 8
    assert sorted(team["analysis"]["projectionRank"] for team in hub["teams"]) == list(range(1, 9))
    assert all(sum(team["analysis"]["projectedRecord"].values()) == 14 for team in hub["teams"])
    assert (PUBLIC / "now/season-hub.json").stat().st_size < 500_000


def test_public_schedule_exactly_matches_sleeper_regular_season_pairs() -> None:
    hub = load(PUBLIC / "now/season-hub.json")
    raw = load(RAW / "matchups.json")
    assert len(hub["schedule"]) == 14
    for week in hub["schedule"]:
        expected = {
            tuple(sorted(int(row["roster_id"]) for row in raw[str(week["week"])] if row["matchup_id"] == matchup_id))
            for matchup_id in {int(row["matchup_id"]) for row in raw[str(week["week"])]}
        }
        actual = {
            tuple(sorted((matchup["teamA"]["rosterId"], matchup["teamB"]["rosterId"])))
            for matchup in week["matchups"]
        }
        assert actual == expected
        assert len(actual) == 4


def test_public_player_values_are_unchanged_sleeper_projections() -> None:
    hub = load(PUBLIC / "now/season-hub.json")
    raw = load(RAW / "projections.json")
    week_one = {str(row["player_id"]): row.get("pts_half_ppr") for row in raw["weeks"]["1"]}
    for team in hub["teams"]:
        for player in team["players"]:
            expected = float(week_one.get(player["sleeperId"]) or 0.0)
            assert player["weekOneProjection"] == round(expected, 2)
        lineup = team["analysis"]["weekOneLineup"]
        assert len(lineup) + len(team["analysis"]["openLineupSlots"]) == 13
        assert len({row["sleeperId"] for row in lineup}) == len(lineup)
        assert round(sum(row["projectedPoints"] for row in lineup), 2) > 0
    assert hub["projectionSource"]["label"] == "Sleeper weekly projections"
    assert hub["projectionSource"]["provider"] == "rotowire"
    assert hub["projectionSource"]["scoringField"] == "pts_half_ppr"


def test_public_hub_enforces_alias_policy() -> None:
    text = (PUBLIC / "now/season-hub.json").read_text().lower()
    assert "only i can say" not in text
    assert "n-word" not in text
    assert "team duncan" in text
