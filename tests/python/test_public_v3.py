from __future__ import annotations

import json
from pathlib import Path

import yaml

from scripts.publish.web_data import publish


ROOT = Path(__file__).resolve().parents[2]


def test_publish_v3_exposes_canonical_history_and_current_state() -> None:
    publish()
    public = ROOT / "public/data"
    manifest = json.loads((public / "manifest.v3.json").read_text())
    season_2022 = json.loads((public / "seasons/2022/index.json").read_text())
    now = json.loads((public / "now/index.json").read_text())

    assert manifest["schemaVersion"] == "3.0.0"
    assert manifest["league"]["currentSeason"] == 2026
    assert season_2022["season"]["champion"]["ownerName"] == "Conner Malley"
    assert season_2022["season"]["champion"]["teamName"] == "King of January"
    assert season_2022["season"]["champion"]["seed"] == 5
    assert now["league"]["phase"] == "preseason"
    assert len(now["teams"]) == 8
    assert now["keeperStatus"] == {
        "maxPerTeam": 2,
        "submitted": 16,
        "expected": 16,
        "teamsComplete": 8,
    }
    assert now["draft"]["status"] == "complete"
    assert now["draft"]["orderPublished"] is True
    assert now["draft"]["budget"] == 200
    assert len(now["draft"]["picks"]) == 152
    assert now["transactionStatus"]["recorded"] >= len(now["recentTransactions"]) > 0
    assert len(now["currentWeekLineups"]) == 8

    raw_users = {
        str(user["user_id"]): user
        for user in json.loads((ROOT / "data/raw/sleeper/2026/current/users.json").read_text())
    }
    raw_rosters = json.loads((ROOT / "data/raw/sleeper/2026/current/rosters.json").read_text())
    raw_team_name_by_roster = {
        int(roster["roster_id"]): str(
            (raw_users[str(roster["owner_id"])].get("metadata") or {}).get("team_name") or ""
        ).strip()
        for roster in raw_rosters
    }
    public_team_name_by_roster = {
        int(team["rosterId"]): team["teamName"] for team in now["teams"]
    }
    branding = yaml.safe_load((ROOT / "data/config/branding.yml").read_text()) or {}
    blocked_phrases = [
        str(value).casefold()
        for value in (branding.get("public_name_policy") or {}).get("blocked_phrases") or []
    ]
    for roster_id, raw_team_name in raw_team_name_by_roster.items():
        public_team_name = public_team_name_by_roster[roster_id]
        is_safe_source_name = raw_team_name and not any(
            phrase in raw_team_name.casefold() for phrase in blocked_phrases
        )
        if is_safe_source_name:
            assert public_team_name == raw_team_name
        else:
            assert public_team_name
            assert not any(phrase in public_team_name.casefold() for phrase in blocked_phrases)


def test_public_player_directory_keeps_lamar_jackson_qb_and_cb_distinct() -> None:
    publish()
    players = json.loads((ROOT / "public/data/players/index.json").read_text())["players"]
    lamar = [row for row in players if row["name"] == "Lamar Jackson"]

    assert any(row["position"] == "QB" and row["sleeperId"] == "4881" for row in lamar)
    assert all(row["position"] != "CB" for row in lamar)


def test_generated_records_and_h2h_include_complete_2025_matchups() -> None:
    publish()
    public = ROOT / "public/data"
    records = json.loads((public / "records/index.json").read_text())
    owners = json.loads((public / "owners/index.json").read_text())["owners"]
    conner = next(row for row in owners if row["name"] == "Conner Malley")
    profile = json.loads((public / f"owners/{conner['ownerUid']}.json").read_text())

    assert records["meta"]["excludedSeasons"] == [2022]
    assert 2025 in records["meta"]["includedSeasons"]
    assert records["matchups"]["largestWin"]["season"] != 2022
    assert profile["headToHeadCoverage"]["excludedSeasons"] == [2022]


def test_2025_facts_are_chunked_and_complete() -> None:
    publish()
    root = ROOT / "public/data/seasons/2025"
    facts = json.loads((root / "facts.json").read_text())
    week_17 = json.loads((root / "lineups/17.json").read_text())
    draft = json.loads((root / "draft.json").read_text())

    assert facts["summary"]["lineups"]["teamWeeks"] == 136
    assert facts["summary"]["transactions"]["completed"] == 551
    assert len(week_17["lineups"]) == 8
    assert max(row["pickCount"] for row in draft["drafts"]) == 152
    assert all(path.stat().st_size < 500_000 for path in root.rglob("*.json"))
