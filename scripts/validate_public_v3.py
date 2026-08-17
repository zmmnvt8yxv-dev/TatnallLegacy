#!/usr/bin/env python3
"""Validate the public manifest v3 and its required route-sized resources."""

from __future__ import annotations

import json
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "data"


def main() -> None:
    manifest = json.loads((PUBLIC / "manifest.v3.json").read_text())
    assert manifest["schemaVersion"] == "3.0.0"
    assert manifest["league"]["currentSeason"] == 2026
    assert manifest["league"]["seasonPhase"] == "preseason"
    assert manifest["seasons"] == list(range(2015, 2026))

    required = ["current", "seasonHub", "history", "owners", "players", "warRoom", "editorial", "records", "search", "integrity"]
    for name in required:
        path = manifest["paths"][name]
        assert "{" not in path
        target = ROOT / "public" / path
        assert target.exists(), f"Missing manifest v3 resource: {target}"
        json.loads(target.read_text())

    for season in manifest["seasons"]:
        season_path = manifest["paths"]["season"].format(season=season)
        payload = json.loads((ROOT / "public" / season_path).read_text())
        assert payload["season"]["season"] == season
        assert payload["season"]["champion"]["ownerUid"]
        assert payload["season"]["runnerUp"]["ownerUid"]

    season_2022 = json.loads((PUBLIC / "seasons/2022/index.json").read_text())
    assert season_2022["season"]["champion"]["teamName"] == "King of January"
    assert season_2022["season"]["champion"]["ownerName"] == "Conner Malley"
    assert season_2022["season"]["champion"]["seed"] == 5
    assert season_2022["season"]["runnerUp"]["seed"] == 2
    assert season_2022["season"]["corrected"] is True

    owners = json.loads((PUBLIC / "owners/index.json").read_text())["owners"]
    conner = next(row for row in owners if row["name"] == "Conner Malley")
    assert conner["championships"] == 2
    assert conner["runnerUps"] == 2

    now = json.loads((PUBLIC / "now/index.json").read_text())
    assert now["league"]["leagueId"] == "1389343653058609152"
    assert len(now["teams"]) == 8
    assert now["defendingChampion"]["ownerName"] == "Samuel Kirby"
    assert now["keeperStatus"] == {
        "maxPerTeam": 2,
        "submitted": 16,
        "expected": 16,
        "teamsComplete": 8,
    }
    assert now["draft"]["draftId"] == "1389343653058609153"
    assert now["draft"]["status"] == "complete"
    assert now["draft"]["orderPublished"] is True
    assert now["draft"]["pickCount"] == 152
    assert now["draft"]["budget"] == 200
    assert now["transactionStatus"]["recorded"] >= 1
    assert len(now["currentWeekLineups"]) == 8
    raw_users = {
        str(user["user_id"]): user
        for user in json.loads((ROOT / "data/raw/sleeper/2026/current/users.json").read_text())
    }
    raw_rosters = json.loads((ROOT / "data/raw/sleeper/2026/current/rosters.json").read_text())
    branding = yaml.safe_load((ROOT / "data/config/branding.yml").read_text()) or {}
    blocked_phrases = [
        str(value).casefold()
        for value in (branding.get("public_name_policy") or {}).get("blocked_phrases") or []
    ]
    public_team_name_by_roster = {
        int(team["rosterId"]): team["teamName"] for team in now["teams"]
    }
    for roster in raw_rosters:
        roster_id = int(roster["roster_id"])
        raw_team_name = str(
            (raw_users[str(roster["owner_id"])].get("metadata") or {}).get("team_name") or ""
        ).strip()
        public_team_name = public_team_name_by_roster[roster_id]
        if raw_team_name and not any(
            phrase in raw_team_name.casefold() for phrase in blocked_phrases
        ):
            assert public_team_name == raw_team_name
        else:
            assert public_team_name
            assert not any(phrase in public_team_name.casefold() for phrase in blocked_phrases)

    hub = json.loads((PUBLIC / "now/season-hub.json").read_text())
    assert hub["meta"]["status"] == "post_draft"
    assert hub["draft"]["pickCount"] == 152
    assert hub["draft"]["totalSpend"] == 1577
    assert hub["regularSeason"] == {
        "startWeek": 1,
        "endWeek": 14,
        "scheduleSource": "Sleeper league matchup endpoints",
        "matchupCount": 56,
    }
    assert len(hub["teams"]) == 8
    assert sorted(team["analysis"]["projectionRank"] for team in hub["teams"]) == list(range(1, 9))
    assert all(
        len(team["analysis"]["weekOneLineup"]) + len(team["analysis"]["openLineupSlots"]) == 13
        for team in hub["teams"]
    )
    assert len(hub["schedule"]) == 14
    assert all(len(week["matchups"]) == 4 for week in hub["schedule"])
    assert (PUBLIC / "now/season-hub.json").stat().st_size < 500_000

    war_room = json.loads((PUBLIC / "war-room/index.json").read_text())
    assert war_room["budget"]["recommendedAuctionTotal"] == 1299
    assert sum(team["keeperSpend"] for team in war_room["teams"]) == 301
    assert len([keeper for team in war_room["teams"] for keeper in team["keepers"]]) == 16
    assert all(
        player["availability"] == "kept"
        for player in war_room["players"]
        if player["keeper"]
    )
    assert (PUBLIC / "players/resolve/4881.json").exists()

    season_2025 = json.loads((PUBLIC / "seasons/2025/index.json").read_text())
    assert season_2025["meta"]["completeness"] == {
        "matchups": "complete",
        "lineups": "complete",
        "transactions": "complete",
        "draft": "complete",
    }
    facts_2025_root = PUBLIC / "seasons/2025"
    facts_2025 = json.loads((facts_2025_root / "facts.json").read_text())
    draft_2025 = json.loads((facts_2025_root / "draft.json").read_text())
    assert facts_2025["summary"]["lineups"]["teamWeeks"] == 136
    assert facts_2025["summary"]["transactions"]["completed"] == 551
    assert max(row["pickCount"] for row in draft_2025["drafts"]) == 152
    assert all(path.stat().st_size < 500_000 for path in facts_2025_root.rglob("*.json"))

    records = json.loads((PUBLIC / "records/index.json").read_text())
    assert records["meta"]["excludedSeasons"] == [2022]
    assert 2025 in records["meta"]["includedSeasons"]

    integrity = json.loads((PUBLIC / "integrity/index.json").read_text())
    assert integrity["critical"] == []
    assert len(integrity["corrections"]) == 9
    print("Public manifest v3 validation passed")


if __name__ == "__main__":
    main()
