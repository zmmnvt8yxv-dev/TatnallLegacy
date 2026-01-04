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

  manifest = {
    "schemaVersion": "2.0.0",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "seasons": sorted(seasons),
    "weeksBySeason": weeks_by_season,
    "paths": {
      "players": "data/players.json",
      "playerIds": "data/player_ids.json",
      "teams": "data/teams.json",
      "seasonSummary": "data/season/{season}.json",
      "weeklyChunk": "data/weekly/{season}/week-{week}.json",
      "transactions": "data/transactions/{season}.json",
      "allTime": "data/all_time.json",
      "playerStatsWeekly": "data/player_stats/weekly/{season}.json",
      "playerStatsFull": "data/player_stats/full/{season}.json",
      "playerStatsSeason": "data/player_stats/season/{season}.json",
      "playerStatsCareer": "data/player_stats/career.json",
      "metricsSummary": "data/player_metrics/summary.json",
      "playerMetricsWeekly": "data/player_metrics/weekly/{season}.json",
      "playerMetricsSeason": "data/player_metrics/season/{season}.json",
      "playerMetricsCareer": "data/player_metrics/career.json",
      "playerMetricsBoomBust": "data/player_metrics/boom_bust.json",
    },
    "counts": counts,
  }
  write_json(PUBLIC_DATA / "manifest.json", manifest)


if __name__ == "__main__":
  main()
