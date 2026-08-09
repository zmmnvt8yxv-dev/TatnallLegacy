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


def test_public_player_directory_keeps_lamar_jackson_qb_and_cb_distinct() -> None:
    publish()
    players = json.loads((ROOT / "public/data/players/index.json").read_text())["players"]
    lamar = [row for row in players if row["name"] == "Lamar Jackson"]

    assert any(row["position"] == "QB" and row["sleeperId"] == "4881" for row in lamar)
    assert all(row["position"] != "CB" for row in lamar)


def test_generated_records_and_h2h_exclude_partial_matchup_seasons() -> None:
    publish()
    public = ROOT / "public/data"
    records = json.loads((public / "records/index.json").read_text())
    owners = json.loads((public / "owners/index.json").read_text())["owners"]
    conner = next(row for row in owners if row["name"] == "Conner Malley")
    profile = json.loads((public / f"owners/{conner['ownerUid']}.json").read_text())

    assert records["meta"]["excludedSeasons"] == [2022, 2025]
    assert records["matchups"]["largestWin"]["season"] not in {2022, 2025}
    assert profile["headToHeadCoverage"]["excludedSeasons"] == [2022, 2025]
