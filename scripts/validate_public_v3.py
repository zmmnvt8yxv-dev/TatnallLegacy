#!/usr/bin/env python3
"""Validate the public manifest v3 and its required route-sized resources."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "data"


def main() -> None:
    manifest = json.loads((PUBLIC / "manifest.v3.json").read_text())
    assert manifest["schemaVersion"] == "3.0.0"
    assert manifest["league"]["currentSeason"] == 2026
    assert manifest["league"]["seasonPhase"] == "preseason"
    assert manifest["seasons"] == list(range(2015, 2026))

    required = ["current", "history", "owners", "players", "records", "search", "integrity"]
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

    integrity = json.loads((PUBLIC / "integrity/index.json").read_text())
    assert integrity["critical"] == []
    assert len(integrity["corrections"]) == 9
    print("Public manifest v3 validation passed")


if __name__ == "__main__":
    main()
