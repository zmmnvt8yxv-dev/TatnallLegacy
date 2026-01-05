import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DATA = ROOT / "public" / "data"


def read_json(path: Path):
  with path.open("r", encoding="utf-8") as handle:
    return json.load(handle)


def write_json(path: Path, payload):
  with path.open("w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)

def all_exist(paths):
  return all(path.exists() for path in paths)

def include_if_exists(paths, template):
  if all_exist(paths):
    return template
  return None

def season_paths_exist(template, seasons):
  missing = []
  for season in seasons:
    path = PUBLIC_DATA / template.format(season=season)
    if not path.exists():
      missing.append(path)
  return len(missing) == 0

def weekly_paths_exist(template, seasons, weeks_by_season):
  missing = []
  for season in seasons:
    weeks = weeks_by_season.get(str(season), [])
    for week in weeks:
      path = PUBLIC_DATA / template.format(season=season, week=week)
      if not path.exists():
        missing.append(path)
  return len(missing) == 0


def main():
  seasons = []
  weeks_by_season = {}
  counts = {"seasonSummary": {}, "weekly": {}}

  for season_path in (PUBLIC_DATA / "season").glob("*.json"):
    try:
      season = int(season_path.stem)
    except ValueError:
      continue
    payload = read_json(season_path)
    seasons.append(season)
    weeks = payload.get("weeks", [])
    weeks_by_season[str(season)] = weeks
    counts["seasonSummary"][str(season)] = payload.get("totals", {})
    weekly_counts = {}
    for week in weeks:
      week_path = PUBLIC_DATA / "weekly" / str(season) / f"week-{week}.json"
      if not week_path.exists():
        continue
      week_payload = read_json(week_path)
      weekly_counts[str(week)] = {
        "matchups": len(week_payload.get("matchups", [])),
        "lineups": len(week_payload.get("lineups", [])),
      }
    counts["weekly"][str(season)] = weekly_counts

  seasons = sorted(seasons)
  paths = {}

  players_path = PUBLIC_DATA / "players.json"
  player_ids_path = PUBLIC_DATA / "player_ids.json"
  teams_path = PUBLIC_DATA / "teams.json"
  all_time_path = PUBLIC_DATA / "all_time.json"
  espn_name_map_path = PUBLIC_DATA / "espn_name_map.json"

  if players_path.exists():
    paths["players"] = "data/players.json"
  if player_ids_path.exists():
    paths["playerIds"] = "data/player_ids.json"
  if teams_path.exists():
    paths["teams"] = "data/teams.json"

  if seasons:
    if season_paths_exist("season/{season}.json", seasons):
      paths["seasonSummary"] = "data/season/{season}.json"
    if weekly_paths_exist("weekly/{season}/week-{week}.json", seasons, weeks_by_season):
      paths["weeklyChunk"] = "data/weekly/{season}/week-{week}.json"
    if season_paths_exist("transactions/{season}.json", seasons):
      paths["transactions"] = "data/transactions/{season}.json"

  if all_time_path.exists():
    paths["allTime"] = "data/all_time.json"
  if espn_name_map_path.exists():
    paths["espnNameMap"] = "data/espn_name_map.json"

  if season_paths_exist("player_stats/weekly/{season}.json", seasons):
    paths["playerStatsWeekly"] = "data/player_stats/weekly/{season}.json"
  if season_paths_exist("player_stats/full/{season}.json", seasons):
    paths["playerStatsFull"] = "data/player_stats/full/{season}.json"
  if season_paths_exist("player_stats/season/{season}.json", seasons):
    paths["playerStatsSeason"] = "data/player_stats/season/{season}.json"
  if (PUBLIC_DATA / "player_stats" / "career.json").exists():
    paths["playerStatsCareer"] = "data/player_stats/career.json"

  if (PUBLIC_DATA / "player_metrics" / "summary.json").exists():
    paths["metricsSummary"] = "data/player_metrics/summary.json"
  if season_paths_exist("player_metrics/weekly/{season}.json", seasons):
    paths["playerMetricsWeekly"] = "data/player_metrics/weekly/{season}.json"
  if season_paths_exist("player_metrics/season/{season}.json", seasons):
    paths["playerMetricsSeason"] = "data/player_metrics/season/{season}.json"
  if (PUBLIC_DATA / "player_metrics" / "career.json").exists():
    paths["playerMetricsCareer"] = "data/player_metrics/career.json"
  if (PUBLIC_DATA / "player_metrics" / "boom_bust.json").exists():
    paths["playerMetricsBoomBust"] = "data/player_metrics/boom_bust.json"

  manifest = {
    "schemaVersion": "2.0.0",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "seasons": seasons,
    "weeksBySeason": weeks_by_season,
    "paths": paths,
    "counts": counts,
  }
  write_json(PUBLIC_DATA / "manifest.json", manifest)


if __name__ == "__main__":
  main()
