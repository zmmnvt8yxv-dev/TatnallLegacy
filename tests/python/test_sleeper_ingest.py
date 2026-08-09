from __future__ import annotations

import json
from pathlib import Path

import yaml

from scripts.ingest.pull_sleeper_season import pull_season
from scripts.ingest.resolve_sleeper_league import load_yaml, resolve_league


ROOT = Path(__file__).resolve().parents[2]
LEAGUE_ID_2025 = "1262418074540195841"
LEAGUE_ID_2026 = "1389343653058609152"


class FakeSleeperClient:
    def league(self, league_id: str):
        assert league_id == LEAGUE_ID_2026
        return {
            "league_id": LEAGUE_ID_2026,
            "previous_league_id": LEAGUE_ID_2025,
            "season": "2026",
            "status": "pre_draft",
            "name": "Tatnall Class of 2018",
            "total_rosters": 8,
        }

    def user_leagues(self, user_id: str, season: int):
        assert season == 2026
        return [self.league(LEAGUE_ID_2026)]

    def get(self, path: str, *, params=None, optional=False):
        if path == "state/nfl":
            return {"season": "2026", "season_type": "pre", "week": 1}
        if path.endswith("/users"):
            return [{"user_id": "1"}]
        if path.endswith("/rosters"):
            return [{"roster_id": 1}]
        if path.endswith("/drafts") or path.endswith("/traded_picks"):
            return []
        if path.endswith("/winners_bracket") or path.endswith("/losers_bracket"):
            return []
        if "/matchups/" in path or "/transactions/" in path:
            return []
        raise AssertionError(f"Unexpected fake Sleeper path: {path}")


def test_configured_2026_league_is_validated_against_the_chain() -> None:
    league_config = load_yaml(ROOT / "data" / "config" / "league.yml")
    owner_config = load_yaml(ROOT / "data" / "config" / "owners.yml")
    result = resolve_league(2026, league_config, owner_config, FakeSleeperClient())

    assert result.league_id == LEAGUE_ID_2026
    assert result.previous_league_id == LEAGUE_ID_2025
    assert result.status == "pre_draft"
    assert result.strategy == "configured_and_validated"


def test_unconfigured_season_resolves_from_previous_league_and_active_users() -> None:
    league_config = {
        "platforms": {
            "sleeper": {"league_ids": {"2025": LEAGUE_ID_2025}}
        }
    }
    owner_config = {
        "owners": [
            {
                "active": True,
                "aliases": {"sleeper_user_ids": ["1262431325780979712"]},
            }
        ]
    }
    result = resolve_league(2026, league_config, owner_config, FakeSleeperClient())

    assert result.league_id == LEAGUE_ID_2026
    assert result.strategy == "previous_league_match"


def test_preseason_snapshot_is_small_and_manifested(tmp_path) -> None:
    output = tmp_path / "current"
    manifest = pull_season(2026, output, client=FakeSleeperClient())

    assert manifest["season_phase"] == "pre"
    assert manifest["current_week"] == 1
    assert manifest["resources"]["matchups"]["records"] == 0
    assert manifest["resources"]["transactions"]["records"] == 0
    assert json.loads((output / "league.json").read_text())["league_id"] == LEAGUE_ID_2026
    assert (output / "manifest.json").exists()


def test_current_scoring_config_matches_official_snapshot() -> None:
    config = yaml.safe_load((ROOT / "data/config/scoring.yml").read_text())
    era = next(row for row in config["eras"] if row["era_id"] == "sleeper-2025-present")
    snapshot = json.loads((ROOT / "data/raw/sleeper/2026/current/league.json").read_text())

    assert era["settings"] == snapshot["scoring_settings"]
    assert snapshot["league_id"] in era["source_league_ids"]
