from __future__ import annotations

import json
from pathlib import Path

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
    assert now["draft"]["orderPublished"] is False
    assert now["draft"]["budget"] == 200
    assert now["draft"]["picks"] == []
    assert now["transactionStatus"]["recorded"] == 0
    assert now["recentTransactions"] == []
    assert now["currentWeekLineups"] == []


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
