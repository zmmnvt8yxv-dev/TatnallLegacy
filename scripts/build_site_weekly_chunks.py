import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUTPUT_DIR = ROOT / "public" / "data"


def read_json(path: Path):
  with path.open("r", encoding="utf-8") as handle:
    return json.load(handle)


def write_json(path: Path, payload):
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open("w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)


def is_regular_season(week):
  try:
    week_num = int(week)
  except (TypeError, ValueError):
    return False
  return 1 <= week_num <= 18


def looks_like_id(value):
  if value is None:
    return False
  text = str(value).strip()
  if not text:
    return False
  if text.isdigit():
    return True
  if text.startswith("00-") and text.replace("-", "").isdigit():
    return True
  return False


def build_standings(matchups):
  standings = {}
  for matchup in matchups:
    home_team = matchup.get("home_team") or "Home"
    away_team = matchup.get("away_team") or "Away"
    home_score = matchup.get("home_score")
    away_score = matchup.get("away_score")
    for team in (home_team, away_team):
      if team not in standings:
        standings[team] = {
          "team": team,
          "wins": 0,
          "losses": 0,
          "ties": 0,
          "points_for": 0.0,
          "points_against": 0.0,
        }

    if home_score is None or away_score is None:
      continue

    standings[home_team]["points_for"] += float(home_score)
    standings[home_team]["points_against"] += float(away_score)
    standings[away_team]["points_for"] += float(away_score)
    standings[away_team]["points_against"] += float(home_score)

    if home_score > away_score:
      standings[home_team]["wins"] += 1
      standings[away_team]["losses"] += 1
    elif away_score > home_score:
      standings[away_team]["wins"] += 1
      standings[home_team]["losses"] += 1
    else:
      standings[home_team]["ties"] += 1
      standings[away_team]["ties"] += 1
  return sorted(standings.values(), key=lambda row: (-row["wins"], row["losses"]))


def build_transactions(seasons):
  transactions_by_season = {season: [] for season in seasons}
  for trades_path in DATA_DIR.glob("trades-*.json"):
    season_str = trades_path.stem.replace("trades-", "")
    try:
      season = int(season_str)
    except ValueError:
      continue
    payload = read_json(trades_path)
    for trade in payload.get("trades", []):
      for party in trade.get("parties", []):
        gained = ", ".join([player.get("name", "Unknown") for player in party.get("gained_players", [])])
        sent = ", ".join([player.get("name", "Unknown") for player in party.get("sent_players", [])])
        summary = f"Received: {gained or 'None'} | Sent: {sent or 'None'}"
        transactions_by_season.setdefault(season, []).append(
          {
            "id": f"{trade.get('id')}-{party.get('roster_id')}",
            "season": season,
            "week": trade.get("week"),
            "type": "trade",
            "team": party.get("team"),
            "summary": summary,
            "created": trade.get("created"),
          }
        )

  for season in seasons:
    season_path = DATA_DIR / f"{season}.json"
    if not season_path.exists():
      continue
    payload = read_json(season_path)
    teams = payload.get("teams", [])
    roster_name_by_id = {}
    for team in teams:
      roster_id = team.get("roster_id") or team.get("team_id")
      if roster_id is None:
        continue
      name = team.get("display_name") or team.get("team_name") or team.get("name")
      if name:
        roster_name_by_id[str(roster_id)] = name

    for txn in payload.get("transactions", []) or []:
      week = txn.get("week")
      if not is_regular_season(week):
        continue
      roster_id = txn.get("roster_id") or txn.get("rosterId") or txn.get("team_id")
      team_name = roster_name_by_id.get(str(roster_id)) if roster_id is not None else None
      team_name = team_name or txn.get("team") or txn.get("owner") or "Unknown"
      created = txn.get("created") or txn.get("created_at") or txn.get("status_updated")

      def normalize_player_list(value):
        if not value:
          return []
        if isinstance(value, dict):
          return [str(item) for item in value.values()]
        if isinstance(value, list):
          return [str(item) for item in value]
        return [str(value)]

      def format_players(value):
        players = []
        for name in normalize_player_list(value):
          if not name:
            continue
          if looks_like_id(name):
            players.append("(Unknown Player)")
          else:
            players.append(name)
        return ", ".join(players) if players else "(Unknown Player)"

      txn_type = (txn.get("type") or txn.get("transaction_type") or "").lower()
      adds = txn.get("adds") or txn.get("add")
      drops = txn.get("drops") or txn.get("drop")
      if txn_type == "trade":
        summary = txn.get("summary") or "Trade completed."
        transactions_by_season.setdefault(season, []).append(
          {
            "id": f"{txn.get('id')}-trade",
            "season": season,
            "week": week,
            "type": "trade",
            "team": team_name,
            "summary": summary,
            "created": created,
          }
        )
        continue

      if adds:
        summary = f"Added: {format_players(adds)}"
        transactions_by_season.setdefault(season, []).append(
          {
            "id": f"{txn.get('id')}-add",
            "season": season,
            "week": week,
            "type": "add",
            "team": team_name,
            "summary": summary,
            "created": created,
          }
        )
      if drops:
        summary = f"Dropped: {format_players(drops)}"
        transactions_by_season.setdefault(season, []).append(
          {
            "id": f"{txn.get('id')}-drop",
            "season": season,
            "week": week,
            "type": "drop",
            "team": team_name,
            "summary": summary,
            "created": created,
          }
        )

  for season, entries in transactions_by_season.items():
    write_json(OUTPUT_DIR / "transactions" / f"{season}.json", {"season": season, "entries": entries})


def main():
  seasons = []
  all_time_weekly = []
  season_totals = []

  for season_path in DATA_DIR.glob("20*.json"):
    payload = read_json(season_path)
    if not isinstance(payload, dict):
      continue
    season_value = payload.get("season") or payload.get("year")
    if season_value is None:
      try:
        season_value = int(season_path.stem)
      except ValueError:
        continue
    season = int(season_value)
    seasons.append(season)
    lineups = [row for row in payload.get("lineups", []) if is_regular_season(row.get("week"))]
    matchups = [row for row in payload.get("matchups", []) if is_regular_season(row.get("week"))]
    teams = payload.get("teams", [])
    weeks = sorted({int(row.get("week")) for row in lineups + matchups if is_regular_season(row.get("week"))})

    for week in weeks:
      week_matchups = [row for row in matchups if int(row.get("week")) == week]
      week_lineups = [row for row in lineups if int(row.get("week")) == week]
      write_json(
        OUTPUT_DIR / "weekly" / str(season) / f"week-{week}.json",
        {"season": season, "week": week, "matchups": week_matchups, "lineups": week_lineups},
      )

    player_totals = {}
    for row in lineups:
      player_id = str(row.get("player_id"))
      if not player_id or player_id == "None":
        continue
      current = player_totals.get(player_id, {"player_id": player_id, "points": 0.0, "games": 0})
      current["points"] += float(row.get("points") or 0)
      current["games"] += 1
      player_totals[player_id] = current
      all_time_weekly.append(
        {
          "player_id": player_id,
          "player_name": row.get("player"),
          "team": row.get("team"),
          "season": season,
          "week": row.get("week"),
          "points": float(row.get("points") or 0),
        }
      )
    season_totals.append({"season": season, "player_totals": list(player_totals.values())})

    season_summary = {
      "season": season,
      "teams": teams,
      "weeks": weeks,
      "standings": build_standings(matchups),
      "playerSeasonTotals": list(player_totals.values()),
      "totals": {"matchups": len(matchups), "lineups": len(lineups)},
    }
    write_json(OUTPUT_DIR / "season" / f"{season}.json", season_summary)

  seasons = sorted(set(seasons))
  build_transactions(seasons)

  career_totals = {}
  season_leaders = []
  for season_payload in season_totals:
    season = season_payload["season"]
    for row in season_payload["player_totals"]:
      player_id = row["player_id"]
      current = career_totals.get(player_id, {"player_id": player_id, "points": 0.0, "games": 0, "seasons": 0})
      current["points"] += row["points"]
      current["games"] += row["games"]
      current["seasons"] += 1
      career_totals[player_id] = current
    season_top = sorted(season_payload["player_totals"], key=lambda item: item["points"], reverse=True)[:10]
    for row in season_top:
      season_leaders.append(
        {
          "season": season,
          "player_id": row["player_id"],
          "points": row["points"],
          "games": row["games"],
        }
      )

  top_weekly = sorted(all_time_weekly, key=lambda item: item["points"], reverse=True)[:10]
  career_leaders = sorted(career_totals.values(), key=lambda item: item["points"], reverse=True)[:25]

  all_time_payload = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "topWeekly": top_weekly,
    "topSeasons": season_leaders,
    "careerLeaders": career_leaders,
  }
  write_json(OUTPUT_DIR / "all_time.json", all_time_payload)


if __name__ == "__main__":
  main()
