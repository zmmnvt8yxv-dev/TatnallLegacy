from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

import pytest
import yaml

from scripts.normalize.corrections import (
    CorrectionConflictError,
    CorrectionTargetError,
    CorrectionValidationError,
    apply_corrections,
    apply_corrections_with_report,
    load_corrections,
)


ROOT = Path(__file__).resolve().parents[2]
CORRECTIONS_PATH = ROOT / "data" / "corrections" / "season_results.yml"
LEAGUE_CONFIG_PATH = ROOT / "data" / "config" / "league.yml"
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "normalized_2022_provider.json"
KING_OF_JANUARY_TEAM_SEASON_UID = "118b89cf-237b-5349-9e55-418bb3b00b19"
KING_OF_DECEMBER_TEAM_SEASON_UID = "b9cca909-47ec-521f-8898-694a89b6270c"


def load_fixture() -> dict:
    with FIXTURE_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def test_2022_league_ruling_and_initial_seeds_are_canonical() -> None:
    provider_data = load_fixture()
    original = deepcopy(provider_data)
    corrections = load_corrections(CORRECTIONS_PATH)

    corrected = apply_corrections(provider_data, corrections)

    season = corrected["seasons"][0]
    assert season["champion_team_season_uid"] == KING_OF_JANUARY_TEAM_SEASON_UID
    assert season["runner_up_team_season_uid"] == KING_OF_DECEMBER_TEAM_SEASON_UID
    assert season["champion_seed"] == 5
    assert season["runner_up_seed"] == 2

    team_seasons = {
        row["team_season_uid"]: row for row in corrected["team_seasons"]
    }
    assert team_seasons[
        KING_OF_JANUARY_TEAM_SEASON_UID
    ]["playoff_seed"] == 5
    assert team_seasons[
        KING_OF_DECEMBER_TEAM_SEASON_UID
    ]["playoff_seed"] == 2

    assert provider_data == original, "raw/normalized input must not be mutated"


def test_team_season_uids_follow_the_configured_uuid5_contract() -> None:
    with LEAGUE_CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)

    identity = config["identity"]
    namespace = uuid5(NAMESPACE_URL, identity["namespace_url"])
    assert namespace == UUID(identity["namespace_uuid"])

    key_template = identity["keys"]["team_season"]
    common = {"platform": "espn", "league_id": "1773893", "season": 2022}
    january_key = key_template.format(**common, platform_team_id=4)
    december_key = key_template.format(**common, platform_team_id=1)

    assert str(uuid5(namespace, january_key)) == KING_OF_JANUARY_TEAM_SEASON_UID
    assert str(uuid5(namespace, december_key)) == KING_OF_DECEMBER_TEAM_SEASON_UID


def test_corrections_are_idempotent_and_report_status() -> None:
    corrections = load_corrections(CORRECTIONS_PATH)
    corrected = apply_corrections(load_fixture(), corrections)

    result = apply_corrections_with_report(corrected, corrections)

    assert result.data == corrected
    assert {entry.status for entry in result.applied} == {"already_applied"}


def test_drifted_old_value_fails_instead_of_guessing() -> None:
    provider_data = load_fixture()
    provider_data["seasons"][0]["champion_seed"] = 1
    corrections = load_corrections(CORRECTIONS_PATH)

    with pytest.raises(CorrectionConflictError, match="expected 2, found 1"):
        apply_corrections(provider_data, corrections)


def test_ambiguous_target_fails() -> None:
    provider_data = load_fixture()
    provider_data["seasons"].append(deepcopy(provider_data["seasons"][0]))
    corrections = load_corrections(CORRECTIONS_PATH)

    with pytest.raises(CorrectionTargetError, match="found 2"):
        apply_corrections(provider_data, corrections)


def test_missing_field_is_not_treated_as_null() -> None:
    provider_data = load_fixture()
    del provider_data["team_seasons"][0]["playoff_seed"]
    corrections = load_corrections(CORRECTIONS_PATH)

    with pytest.raises(CorrectionConflictError, match="found <missing>"):
        apply_corrections(provider_data, corrections)


def test_old_value_is_required_by_the_correction_contract() -> None:
    correction = load_corrections(CORRECTIONS_PATH)[0]
    del correction["old_value"]

    with pytest.raises(CorrectionValidationError, match="missing fields: old_value"):
        apply_corrections(load_fixture(), [correction])
