import csv
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUTPUT_DIR = ROOT / "public" / "data"
PLAYER_DATA_DIR = ROOT / "public" / "data"
SLEEPER_PLAYERS_PATH = ROOT / "data_raw" / "sleeper" / "players_flat.csv"
MASTER_PLAYERS_PATH = ROOT / "data_raw" / "master" / "players_master_nflverse_espn_sleeper.csv"
ESPN_PLAYERS_INDEX_PATH = ROOT / "data_raw" / "espn_players_index.csv"

ESPN_TEAM_ID_TO_ABBR = {
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WSH",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
}

ESPN_TEAM_ABBR_TO_NAME = {
  "ARI": "CARDINALS",
  "ATL": "FALCONS",
  "BAL": "RAVENS",
  "BUF": "BILLS",
  "CAR": "PANTHERS",
  "CHI": "BEARS",
  "CIN": "BENGALS",
  "CLE": "BROWNS",
  "DAL": "COWBOYS",
  "DEN": "BRONCOS",
  "DET": "LIONS",
  "GB": "PACKERS",
  "HOU": "TEXANS",
  "IND": "COLTS",
  "JAX": "JAGUARS",
  "KC": "CHIEFS",
  "LAC": "CHARGERS",
  "LAR": "RAMS",
  "LV": "RAIDERS",
  "MIA": "DOLPHINS",
  "MIN": "VIKINGS",
  "NE": "PATRIOTS",
  "NO": "SAINTS",
  "NYG": "GIANTS",
  "NYJ": "JETS",
  "PHI": "EAGLES",
  "PIT": "STEELERS",
  "SEA": "SEAHAWKS",
  "SF": "49ERS",
  "TB": "BUCCANEERS",
  "TEN": "TITANS",
  "WSH": "COMMANDERS",
}


def read_json(path: Path):
  with path.open("r", encoding="utf-8") as handle:
    return json.load(handle)

def load_sleeper_player_maps():
  gsis_to_sleeper = {}
  espn_to_sleeper = {}
  name_to_sleeper = {}
  espn_to_name = {}
  if not SLEEPER_PLAYERS_PATH.exists():
    return {
      "gsis_to_sleeper": gsis_to_sleeper,
      "espn_to_sleeper": espn_to_sleeper,
      "name_to_sleeper": name_to_sleeper,
      "espn_to_name": espn_to_name,
    }
  with SLEEPER_PLAYERS_PATH.open("r", encoding="utf-8") as handle:
    reader = csv.DictReader(handle)
    for row in reader:
      sleeper_id = row.get("player_id")
      gsis_id = (row.get("gsis_id") or "").strip()
      espn_id = normalize_numeric_id(row.get("espn_id"))
      full_name = row.get("full_name") or f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip()
      if gsis_id and sleeper_id:
        gsis_to_sleeper[str(gsis_id)] = str(sleeper_id)
      if espn_id and sleeper_id:
        espn_to_sleeper[str(espn_id)] = str(sleeper_id)
      name_norm = (row.get("name_norm") or "").strip()
      if name_norm and sleeper_id and name_norm not in name_to_sleeper:
        name_to_sleeper[name_norm] = str(sleeper_id)
      if full_name and sleeper_id:
        key = normalize_name(full_name)
        if key and key not in name_to_sleeper:
          name_to_sleeper[key] = str(sleeper_id)
  if MASTER_PLAYERS_PATH.exists():
    with MASTER_PLAYERS_PATH.open("r", encoding="utf-8") as handle:
      reader = csv.DictReader(handle)
      for row in reader:
        sleeper_id = (row.get("sleeper_id") or row.get("sleeper_player_id") or "").strip()
        if not sleeper_id:
          continue
        espn_id = (
          row.get("espn_id_str")
          or row.get("espn_id_y")
          or row.get("espn_id_x")
          or row.get("espn_id")
        )
        espn_id = normalize_numeric_id(espn_id)
        if espn_id and espn_id not in espn_to_sleeper:
          espn_to_sleeper[espn_id] = sleeper_id
        name_norm = (row.get("sleeper_name_norm") or "").strip()
        if not name_norm:
          name_norm = normalize_name(row.get("sleeper_full_name") or row.get("display_name") or "")
        if name_norm and name_norm not in name_to_sleeper:
          name_to_sleeper[name_norm] = sleeper_id
  if ESPN_PLAYERS_INDEX_PATH.exists():
    with ESPN_PLAYERS_INDEX_PATH.open("r", encoding="utf-8") as handle:
      reader = csv.DictReader(handle)
      for row in reader:
        espn_id = normalize_numeric_id(row.get("espn_id"))
        display_name = (row.get("display_name") or "").strip()
        if espn_id and display_name and espn_id not in espn_to_name:
          espn_to_name[espn_id] = display_name
  return {
    "gsis_to_sleeper": gsis_to_sleeper,
    "espn_to_sleeper": espn_to_sleeper,
    "name_to_sleeper": name_to_sleeper,
    "espn_to_name": espn_to_name,
  }

def normalize_name(value):
  if value is None:
    return ""
  text = str(value).strip().lower()
  if not text:
    return ""
  cleaned = []
  for ch in text:
    if ch.isalnum() or ch.isspace():
      cleaned.append(ch)
  return " ".join("".join(cleaned).split())

def normalize_numeric_id(value):
  if value is None:
    return None
  text = str(value).strip()
  if not text:
    return None
  if text.endswith(".0") and text.replace(".", "", 1).isdigit():
    return text[:-2]
  return text

def defense_from_espn_id(value):
  text = normalize_numeric_id(value)
  if not text or not str(text).lstrip("-").isdigit():
    return None
  try:
    num = int(text)
  except ValueError:
    return None
  if num >= 0:
    return None
  team_id = abs(num) - 16000
  abbr = ESPN_TEAM_ID_TO_ABBR.get(team_id)
  if not abbr:
    return None
  return {"id": abbr, "name": ESPN_TEAM_ABBR_TO_NAME.get(abbr, abbr)}


def write_json(path: Path, payload):
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open("w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)


def load_espn_lineups(season, week):
  candidate = ROOT / "data_raw" / "espn_lineups" / str(season) / f"week-{week}.json"
  if not candidate.exists():
    return []
  payload = read_json(candidate)
  return payload.get("lineups", []) or []


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
  if text.lstrip("-").isdigit():
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


def build_player_name_lookup():
  players_path = PLAYER_DATA_DIR / "players.json"
  player_ids_path = PLAYER_DATA_DIR / "player_ids.json"
  if not players_path.exists() or not player_ids_path.exists():
    return {}
  players = read_json(players_path)
  player_ids = read_json(player_ids_path)
  by_uid = {}
  for player in players:
    if player.get("player_uid"):
      by_uid[str(player["player_uid"])] = player
  sleeper_to_uid = {}
  for entry in player_ids:
    if entry.get("id_type") == "sleeper" and entry.get("id_value") and entry.get("player_uid"):
      sleeper_to_uid[str(entry["id_value"])] = str(entry["player_uid"])
  sleeper_to_name = {}
  for sleeper_id, uid in sleeper_to_uid.items():
    player = by_uid.get(uid)
    if player and player.get("full_name"):
      sleeper_to_name[sleeper_id] = player["full_name"]
  return sleeper_to_name


def build_transactions(seasons, sleeper_maps=None):
  player_name_lookup = build_player_name_lookup()
  sources_by_season = {season: [] for season in seasons}
  transactions_by_season = {season: [] for season in seasons}
  sleeper_maps = sleeper_maps or {
    "gsis_to_sleeper": {},
    "espn_to_sleeper": {},
    "name_to_sleeper": {},
    "espn_to_name": {},
  }
  for trades_path in DATA_DIR.glob("trades-*.json"):
    season_str = trades_path.stem.replace("trades-", "")
    try:
      season = int(season_str)
    except ValueError:
      continue
    sources_by_season.setdefault(season, []).append(trades_path.name)
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

    sleeper_txn_path = DATA_DIR / f"transactions-{season}.json"
    if sleeper_txn_path.exists():
      sources_by_season.setdefault(season, []).append(sleeper_txn_path.name)
      sleeper_payload = read_json(sleeper_txn_path)
      for txn in sleeper_payload.get("transactions", []) or []:
        week = txn.get("week")
        if not is_regular_season(week):
          continue
        roster_ids = txn.get("roster_ids") or []
        adds = txn.get("adds") or {}
        drops = txn.get("drops") or {}
        txn_id = txn.get("transaction_id") or txn.get("id") or f"{season}-{week}"
        created = txn.get("created") or txn.get("created_at")
        txn_type = (txn.get("type") or "").lower()

        def resolve_player_name(player_id):
          if not player_id:
            return "(Unknown Player)"
          if looks_like_id(player_id):
            return player_name_lookup.get(str(player_id)) or "(Unknown Player)"
          return str(player_id)

        def format_player_ids(ids):
          names = [resolve_player_name(pid) for pid in ids]
          return ", ".join([name for name in names if name]) if names else "(Unknown Player)"

        if txn_type == "trade":
          for roster_id in roster_ids:
            team_name = roster_name_by_id.get(str(roster_id), f"Roster {roster_id}")
            received = [pid for pid, rid in adds.items() if str(rid) == str(roster_id)]
            sent = [pid for pid, rid in drops.items() if str(rid) == str(roster_id)]
            summary = f"Received: {format_player_ids(received)} | Sent: {format_player_ids(sent)}"
            transactions_by_season.setdefault(season, []).append(
              {
                "id": f"{txn_id}-trade-{roster_id}",
                "season": season,
                "week": week,
                "type": "trade",
                "team": team_name,
                "summary": summary,
                "created": created,
              }
            )
        else:
          for player_id, roster_id in adds.items():
            team_name = roster_name_by_id.get(str(roster_id), f"Roster {roster_id}")
            summary = f"Added: {resolve_player_name(player_id)}"
            transactions_by_season.setdefault(season, []).append(
              {
                "id": f"{txn_id}-add-{roster_id}-{player_id}",
                "season": season,
                "week": week,
                "type": "add",
                "team": team_name,
                "summary": summary,
                "created": created,
              }
            )
          for player_id, roster_id in drops.items():
            team_name = roster_name_by_id.get(str(roster_id), f"Roster {roster_id}")
            summary = f"Dropped: {resolve_player_name(player_id)}"
            transactions_by_season.setdefault(season, []).append(
              {
                "id": f"{txn_id}-drop-{roster_id}-{player_id}",
                "season": season,
                "week": week,
                "type": "drop",
                "team": team_name,
                "summary": summary,
                "created": created,
              }
            )

    espn_txn_path = DATA_DIR / f"espn-transactions-{season}.json"
    espn_raw_path = ROOT / "data_raw" / "espn_transactions" / f"transactions_{season}.json"
    espn_payload = None
    if espn_raw_path.exists():
      sources_by_season.setdefault(season, []).append(f"data_raw/espn_transactions/{espn_raw_path.name}")
      espn_payload = read_json(espn_raw_path)
    elif espn_txn_path.exists():
      sources_by_season.setdefault(season, []).append(espn_txn_path.name)
      espn_payload = read_json(espn_txn_path)

    if espn_payload:
      teams = espn_payload.get("teams", [])
      members = espn_payload.get("members", [])
      member_by_id = {member.get("id"): member for member in members if member.get("id")}
      espn_team_name_by_id = {}
      for team in teams:
        team_id = team.get("id")
        if team_id is None:
          continue
        name = team.get("name")
        if not name:
          location = team.get("location") or ""
          nickname = team.get("nickname") or ""
          name = f"{location} {nickname}".strip()
        if not name:
          owners = team.get("owners") or []
          if owners:
            owner = member_by_id.get(owners[0], {})
            name = owner.get("displayName") or owner.get("firstName")
        if not name:
          name = f"Team {team_id}"
        espn_team_name_by_id[str(team_id)] = name

      def espn_player_id(item):
        player = item.get("playerPoolEntry", {}).get("player", {}) if item else {}
        espn_id = player.get("id") or player.get("playerId") or item.get("playerId")
        espn_id = normalize_numeric_id(espn_id)
        if espn_id is not None:
          espn_key = str(espn_id)
          sleeper_id = sleeper_maps.get("espn_to_sleeper", {}).get(espn_key)
          if sleeper_id:
            return sleeper_id
          if espn_key.lstrip("-").isdigit():
            normalized = str(abs(int(espn_key)))
            sleeper_id = sleeper_maps.get("espn_to_sleeper", {}).get(normalized)
            if sleeper_id:
              return sleeper_id
        gsis_id = player.get("gsisId") or player.get("gsis_id") or item.get("playerId")
        gsis_id = (str(gsis_id).strip() if gsis_id else None)
        sleeper_id = sleeper_maps.get("gsis_to_sleeper", {}).get(str(gsis_id)) if gsis_id else None
        if sleeper_id:
          return sleeper_id
        name = player.get("fullName") or player.get("displayName")
        if not name:
          first = player.get("firstName") or ""
          last = player.get("lastName") or ""
          name = f"{first} {last}".strip() or None
        if not name:
          return None
        key = normalize_name(name)
        return sleeper_maps.get("name_to_sleeper", {}).get(key)

      def resolve_espn_player(item):
        player = item.get("playerPoolEntry", {}).get("player", {}) if item else {}
        name = player.get("fullName") or player.get("displayName")
        if not name:
          first = player.get("firstName") or ""
          last = player.get("lastName") or ""
          name = f"{first} {last}".strip() or None
        if not name:
          raw_id = normalize_numeric_id(item.get("playerId") if item else None)
          if raw_id:
            name = sleeper_maps.get("espn_to_name", {}).get(str(raw_id))
        if not name:
          defense = defense_from_espn_id(item.get("playerId") if item else None)
          if defense:
            return defense["id"], defense["name"]
        sleeper_id = espn_player_id(item)
        if sleeper_id:
          name = player_name_lookup.get(str(sleeper_id)) or name
        if not sleeper_id and name:
          key = normalize_name(name)
          sleeper_id = sleeper_maps.get("name_to_sleeper", {}).get(key)
        if not name:
          name = "(Unknown Player)"
        return sleeper_id, name

      for txn in espn_payload.get("transactions", []) or []:
        week = txn.get("scoringPeriodId") or txn.get("matchupPeriodId") or txn.get("week")
        if not is_regular_season(week):
          continue
        txn_type = str(txn.get("type") or "").upper()
        txn_id = txn.get("id") or f"espn-{season}-{week}"
        items = txn.get("items") or []

        if txn_type.startswith("TRADE"):
          adds_by_team = {}
          drops_by_team = {}
          for item in items:
            item_type = str(item.get("type") or "").upper()
            to_team = item.get("toTeamId")
            from_team = item.get("fromTeamId")
            pid, name = resolve_espn_player(item)
            if to_team is not None:
              adds_by_team.setdefault(str(to_team), []).append({"id": pid, "name": name})
            if from_team is not None:
              drops_by_team.setdefault(str(from_team), []).append({"id": pid, "name": name})
          team_ids = set(adds_by_team.keys()) | set(drops_by_team.keys())
          for team_id in team_ids:
            received_names = [row["name"] for row in adds_by_team.get(team_id, [])]
            sent_names = [row["name"] for row in drops_by_team.get(team_id, [])]
            received = ", ".join(received_names) or "None"
            sent = ", ".join(sent_names) or "None"
            players = []
            for row in adds_by_team.get(team_id, []):
              players.append({"id": row["id"], "name": row["name"], "action": "received"})
            for row in drops_by_team.get(team_id, []):
              players.append({"id": row["id"], "name": row["name"], "action": "sent"})
            transactions_by_season.setdefault(season, []).append(
              {
                "id": f"{txn_id}-trade-{team_id}",
                "season": season,
                "week": week,
                "type": "trade",
                "team": espn_team_name_by_id.get(team_id, f"Team {team_id}"),
                "summary": f"Received: {received} | Sent: {sent}",
                "created": txn.get("proposedDate"),
                "players": players,
              }
            )
          continue

        for item in items:
          item_type = str(item.get("type") or "").upper()
          team_id = item.get("teamId") or item.get("toTeamId") or item.get("fromTeamId")
          if team_id is None:
            continue
          team_name = espn_team_name_by_id.get(str(team_id), f"Team {team_id}")
          if item_type == "ADD":
            pid, name = resolve_espn_player(item)
            transactions_by_season.setdefault(season, []).append(
              {
                "id": f"{txn_id}-add-{team_id}-{item.get('playerId')}",
                "season": season,
                "week": week,
                "type": "add",
                "team": team_name,
                "summary": f"Added: {name}",
                "created": txn.get("proposedDate"),
                "players": [{"id": pid, "name": name, "action": "add"}],
              }
            )
          elif item_type == "DROP":
            pid, name = resolve_espn_player(item)
            transactions_by_season.setdefault(season, []).append(
              {
                "id": f"{txn_id}-drop-{team_id}-{item.get('playerId')}",
                "season": season,
                "week": week,
                "type": "drop",
                "team": team_name,
                "summary": f"Dropped: {name}",
                "created": txn.get("proposedDate"),
                "players": [{"id": pid, "name": name, "action": "drop"}],
              }
            )

  for season, entries in transactions_by_season.items():
    sources = sources_by_season.get(season, [])
    write_json(
      OUTPUT_DIR / "transactions" / f"{season}.json",
      {"season": season, "entries": entries, "sources": sources},
    )


def main():
  seasons = []
  all_time_weekly = []
  season_totals = []
  sleeper_maps = load_sleeper_player_maps()

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
      if not week_lineups:
        espn_lineups = load_espn_lineups(season, week)
        if espn_lineups:
          week_lineups = espn_lineups
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
  build_transactions(seasons, sleeper_maps=sleeper_maps)

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
  career_stats_path = OUTPUT_DIR / "player_stats" / "career.json"
  if career_stats_path.exists():
    career_payload = read_json(career_stats_path)
    career_rows = career_payload.get("rows", []) if isinstance(career_payload, dict) else []
    normalized = []
    for row in career_rows:
      player_id = row.get("player_id") or row.get("sleeper_id") or row.get("gsis_id")
      if not player_id:
        continue
      normalized.append(
        {
          "player_id": str(player_id),
          "display_name": row.get("display_name") or row.get("player_display_name") or row.get("player_name"),
          "points": float(row.get("points") or row.get("fantasy_points_custom") or 0),
          "games": int(row.get("games") or row.get("games_played") or 0),
          "seasons": int(row.get("seasons") or row.get("seasons_played") or 0),
        }
      )
    career_leaders = sorted(normalized, key=lambda item: item["points"], reverse=True)[:25]
  else:
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
