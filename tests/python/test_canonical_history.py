from __future__ import annotations

from pathlib import Path

import pytest

from scripts.normalize.canonical_history import build_canonical_history


ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def history():
    return build_canonical_history(ROOT)


def test_every_completed_season_has_one_canonical_result(history) -> None:
    expected_champions = {
        2015: "Team Downs",
        2016: "Hello all my Peasants",
        2017: "The Champ",
        2018: "The Champ",
        2019: "Dear Lord Please",
        2020: "The King",
        2021: "Team Downs",
        2022: "King of January",
        2023: "Sniper Gang - 1800 Block",
        2024: "Team Malley",
        2025: "Insane in The Achane",
    }
    teams = {row["team_season_uid"]: row for row in history.team_seasons}

    assert len(history.seasons) == 11
    assert len(history.team_seasons) == 88
    for season in history.seasons:
        champion = teams[season["champion_team_season_uid"]]
        runner = teams[season["runner_up_team_season_uid"]]
        assert champion["team_name"].strip() == expected_champions[season["season"]]
        assert champion["champion"] is True
        assert champion["runner_up"] is False
        assert runner["runner_up"] is True
        assert champion["team_season_uid"] != runner["team_season_uid"]
        assert season["champion_seed"] == champion["playoff_seed"]
        assert season["runner_up_seed"] == runner["playoff_seed"]


def test_2022_ruling_corrects_season_matchup_and_seed_analytics(history) -> None:
    teams = {row["team_season_uid"]: row for row in history.team_seasons}
    season = next(row for row in history.seasons if row["season"] == 2022)
    championship = next(
        row
        for row in history.matchups
        if row["season"] == 2022 and row["matchup_type"] == "championship"
    )

    champion = teams[season["champion_team_season_uid"]]
    runner = teams[season["runner_up_team_season_uid"]]
    assert champion["team_name"] == "King of January"
    assert runner["team_name"].split() == ["King", "of", "December"]
    assert season["champion_seed"] == champion["playoff_seed"] == 5
    assert season["runner_up_seed"] == runner["playoff_seed"] == 2
    assert season["is_corrected"] is True
    assert championship["winner_team_season_uid"] == champion["team_season_uid"]
    assert championship["loser_team_season_uid"] == runner["team_season_uid"]
    assert championship["is_corrected"] is True
    assert championship["home_points"] > championship["away_points"], (
        "raw provider scores remain evidence and are not rewritten"
    )


def test_canonical_matchups_exclude_provider_bye_placeholders(history) -> None:
    matchup_uids = [row["matchup_uid"] for row in history.matchups]
    assert len(matchup_uids) == len(set(matchup_uids)) == 710
    assert all(
        row["home_team_season_uid"] != row["away_team_season_uid"]
        for row in history.matchups
    )
    assert all(
        row["home_team_season_uid"] and row["away_team_season_uid"]
        for row in history.matchups
    )


def test_owner_and_franchise_histories_are_explicit(history) -> None:
    owners = {row["canonical_name"]: row for row in history.owners}
    assert owners["Conner Malley"]["first_season"] == 2015
    assert owners["Conner Malley"]["last_season"] == 2025
    assert owners["Conner Malley"]["active"] is True
    assert owners["Max Hardin"]["last_season"] == 2017
    assert len(history.franchises) == 8
    assert all(row["first_season"] == 2015 for row in history.franchises)
    assert all(row["last_season"] == 2025 for row in history.franchises)


def test_missing_data_is_status_not_zero(history) -> None:
    seasons = {row["season"]: row for row in history.seasons}
    assert seasons[2015]["data_completeness"]["lineups"] == "unavailable"
    assert seasons[2022]["data_completeness"]["lineups"] == "partial"
    assert seasons[2025]["data_completeness"]["draft"] == "partial"
    assert history.verification["status"] == "warning"
    assert history.verification["critical"] == []


def test_html_uses_the_github_pages_base_for_the_only_favicon() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'href="%BASE_URL%favicon.svg"' in html
    assert "favicon.ico" not in html
