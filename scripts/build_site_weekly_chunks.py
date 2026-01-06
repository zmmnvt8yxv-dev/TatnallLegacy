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
ESPN_PLAYERS_INDEX_PATH = ROOT / "data_raw" / "espn_core" / "index" / "athletes_index_flat.csv"
ESPN_CORE_BY_ID_DIR = ROOT / "data_raw" / "espn_core" / "athletes_by_id"
ESPN_NAME_MAP_PATH = ROOT / "data_raw" / "espn_core" / "index" / "espn_name_map.json"
NFLVERSE_STATS_PATH = ROOT / "data_raw" / "nflverse_stats" / "player_stats_2015_2025.csv"

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


def _clean_text(value):
  if value is None:
    return ""
  text = str(value).strip().lower()
  if not text:
    return ""
  out = []
  for ch in text:
    if ch.isalnum() or ch.isspace() or ch in ("-", "/"):
      out.append(ch)
  return " ".join("".join(out).split())

def _is_defense_position(pos):
  p = str(pos or "").strip().upper()
  return p in ("DEF", "DST", "D/ST")

def _infer_defense_abbr(player_name, nfl_team=None):
  t = str(nfl_team or "").strip().upper()
  if t and t in ESPN_TEAM_ABBR_TO_NAME:
    return t

  name = _clean_text(player_name)
  if not name:
    return None

  if "d/st" not in name and "dst" not in name and "def" not in name:
    return None

  for abbr in ESPN_TEAM_ABBR_TO_NAME.keys():
    if abbr.lower() in name.split():
      return abbr

  nick_to_abbr = {v.lower(): k for k, v in ESPN_TEAM_ABBR_TO_NAME.items() if v}
  best = None
  best_len = 0
  for nick, abbr in nick_to_abbr.items():
    if nick and nick in name:
      if len(nick) > best_len:
        best = abbr
        best_len = len(nick)
  return best



def read_json(path: Path):
  with path.open("r", encoding="utf-8") as handle:
    return json.load(handle)

def normalize_name(value):
  if value is None:
    return ""
  text = str(value).strip().lower()
  if not text:
    return ""
  return "".join(char for char in text if char.isalnum())

def ensure_espn_name_map():
  name_map = {}
  if ESPN_NAME_MAP_PATH.exists():
    try:
      payload = read_json(ESPN_NAME_MAP_PATH)
    except Exception:
      payload = None
    if isinstance(payload, dict):
      for espn_id, display_name in payload.items():
        espn_id = normalize_numeric_id(espn_id)
        display_name = (str(display_name).strip() if display_name is not None else "")
        if espn_id and display_name:
          name_map.setdefault(espn_id, display_name)
  if ESPN_PLAYERS_INDEX_PATH.exists():
    with ESPN_PLAYERS_INDEX_PATH.open("r", encoding="utf-8") as handle:
      reader = csv.DictReader(handle)
      for row in reader:
        espn_id = normalize_numeric_id(row.get("id"))
        if not espn_id:
          continue
        display = row.get("displayName") or row.get("fullName") or row.get("shortName") or ""
        display = str(display).strip()
        if display and espn_id not in name_map:
          name_map[espn_id] = display
  if name_map:
    ESPN_NAME_MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    write_json(ESPN_NAME_MAP_PATH, name_map)
  return name_map



def load_nflverse_lookup():
  if not NFLVERSE_STATS_PATH.exists():
    return {}, {}, {}
  by_week = {}
  by_season = {}
  by_name = {}
  with NFLVERSE_STATS_PATH.open("r", encoding="utf-8") as handle:
    reader = csv.DictReader(handle)
    for row in reader:
      try:
        season = int(row.get("season") or 0)
      except ValueError:
        continue
      try:
        week = int(row.get("week") or 0)
      except ValueError:
        week = 0
      if week and not is_regular_season(week):
        continue
      name = row.get("player_display_name") or row.get("player_name") or row.get("name") or ""
      name_key = normalize_name(name)
      if not name_key:
        continue
      position = (row.get("position") or row.get("pos") or "").strip().upper()
      team = (row.get("team") or row.get("recent_team") or row.get("club") or "").strip().upper()
      if position or team:
        by_name.setdefault(name_key, {})
        if position and not by_name[name_key].get("position"):
          by_name[name_key]["position"] = position
        if team and not by_name[name_key].get("team"):
          by_name[name_key]["team"] = team
        by_season.setdefault((season, name_key), {})
        if position and not by_season[(season, name_key)].get("position"):
          by_season[(season, name_key)]["position"] = position
        if team and not by_season[(season, name_key)].get("team"):
          by_season[(season, name_key)]["team"] = team
      if week and (position or team):
        by_week[(season, week, name_key)] = {"position": position, "team": team}
  return by_week, by_season, by_name


# New helper: load_nflverse_teams_by_player
def load_nflverse_teams_by_player():
  """Return mapping of normalized player name -> {teams:[...], last_team:<abbr or None>} from nflverse stats."""
  if not NFLVERSE_STATS_PATH.exists():
    return {}
  by_player = {}
  with NFLVERSE_STATS_PATH.open("r", encoding="utf-8") as handle:
    reader = csv.DictReader(handle)
    for row in reader:
      try:
        season = int(row.get("season") or 0)
      except ValueError:
        continue
      try:
        week = int(row.get("week") or 0)
      except ValueError:
        week = 0
      if week and not is_regular_season(week):
        continue
      name = row.get("player_display_name") or row.get("player_name") or row.get("name") or ""
      name_key = normalize_name(name)
      if not name_key:
        continue
      team = (row.get("team") or row.get("recent_team") or row.get("club") or "").strip().upper()
      if not team:
        continue
      entry = by_player.get(name_key)
      if entry is None:
        entry = {"teams": set(), "last": (0, 0, None)}
        by_player[name_key] = entry
      entry["teams"].add(team)
      last_season, last_week, _ = entry["last"]
      if (season, week) >= (last_season, last_week):
        entry["last"] = (season, week, team)

  finalized = {}
  for k, v in by_player.items():
    teams = sorted(v["teams"]) if v.get("teams") else []
    last_team = v.get("last", (0, 0, None))[2]
    finalized[k] = {"teams": teams, "last_team": last_team}
  return finalized


def resolve_nflverse_meta(by_week, by_season, by_name, season, week, player_name):
  name_key = normalize_name(player_name)
  if not name_key:
    return None, None
  entry = None
  if season and week:
    entry = by_week.get((season, week, name_key))
  if entry is None and season:
    entry = by_season.get((season, name_key))
  if entry is None:
    entry = by_name.get(name_key)
  if not entry:
    return None, None
  return entry.get("position"), entry.get("team")


def load_sleeper_player_maps():
  gsis_to_sleeper = {}
  espn_to_sleeper = {}
  name_to_sleeper = {}
  espn_to_name = {}
  espn_map = ensure_espn_name_map()
  if espn_map:
    for espn_id, display_name in espn_map.items():
      if espn_id and display_name and espn_id not in espn_to_name:
        espn_to_name[espn_id] = display_name
  if SLEEPER_PLAYERS_PATH.exists():
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
  espn_index_rows = []
  if ESPN_PLAYERS_INDEX_PATH.exists():
    with ESPN_PLAYERS_INDEX_PATH.open("r", encoding="utf-8") as handle:
      espn_index_rows = list(csv.DictReader(handle))
  else:
    espn_index_parquet = ESPN_PLAYERS_INDEX_PATH.with_suffix(".parquet")
    if espn_index_parquet.exists():
      try:
        import pandas as pd  # Optional: only used when parquet is the source.
      except Exception:
        pd = None
      if pd is not None:
        try:
          espn_index_rows = pd.read_parquet(espn_index_parquet).to_dict(orient="records")
        except Exception:
          espn_index_rows = []
  if espn_index_rows:
    for row in espn_index_rows:
      espn_id = normalize_numeric_id(row.get("id") or row.get("espn_id"))
      display_name = (row.get("displayName") or row.get("fullName") or row.get("shortName") or "").strip()
      if espn_id and display_name and espn_id not in espn_to_name:
        espn_to_name[espn_id] = display_name
  if ESPN_CORE_BY_ID_DIR.exists():
    for path in ESPN_CORE_BY_ID_DIR.glob("*.json"):
      try:
        payload = read_json(path)
      except Exception:
        continue
      data = payload.get("data") if isinstance(payload, dict) else None
      if not isinstance(data, dict):
        continue
      espn_id = normalize_numeric_id(data.get("id") or data.get("playerId"))
      display_name = (data.get("displayName") or data.get("fullName") or data.get("shortName") or "").strip()
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


def normalize_espn_lineups(lineups, sleeper_maps, player_name_lookup, season=None, by_week=None, by_season=None, by_name=None):
  normalized = []
  for row in lineups or []:
    raw_id = row.get("player_id")
    espn_id = normalize_numeric_id(raw_id)
    next_row = dict(row)
    if season and not next_row.get("season"):
      next_row["season"] = season
    next_row["source"] = "espn"
    next_row["source_player_id"] = raw_id
    if espn_id:
      next_row["espn_id"] = espn_id
    defense = defense_from_espn_id(espn_id)
    if defense:
      next_row["player_id"] = defense["id"]
      next_row["player"] = defense["name"]
      next_row.setdefault("position", "D/ST")
      next_row.setdefault("nfl_team", defense["id"])
      normalized.append(next_row)
      continue
    sleeper_id = sleeper_maps.get("espn_to_sleeper", {}).get(str(espn_id)) if espn_id else None
    if sleeper_id:
      next_row["player_id"] = sleeper_id
    player_name = None
    if sleeper_id:
      player_name = player_name_lookup.get(str(sleeper_id))
    if not player_name and espn_id:
      player_name = sleeper_maps.get("espn_to_name", {}).get(str(espn_id))
    if not player_name and espn_id:
      player_name = f"ESPN Player {espn_id}"
    next_row["player"] = player_name or next_row.get("player") or "(Unknown Player)"
    if by_week is not None:
      try:
        week = int(next_row.get("week") or 0)
      except (TypeError, ValueError):
        week = 0
      position, nfl_team = resolve_nflverse_meta(by_week, by_season or {}, by_name or {}, season, week, next_row.get("player"))
      if position and not next_row.get("position"):
        next_row["position"] = position
      if nfl_team and not next_row.get("nfl_team"):
        next_row["nfl_team"] = nfl_team
    normalized.append(next_row)
  return normalized


def normalize_lineups(lineups, sleeper_maps, player_name_lookup, source="league", season=None, by_week=None, by_season=None, by_name=None):
  normalized = []
  for row in lineups or []:
    next_row = dict(row)
    raw_id = row.get("player_id")
    if season and not next_row.get("season"):
      next_row["season"] = season
    next_row["source"] = row.get("source") or source
    next_row["source_player_id"] = raw_id
    sleeper_id = None
    gsis_id = str(raw_id).strip() if raw_id else None
    if gsis_id and gsis_id in sleeper_maps.get("gsis_to_sleeper", {}):
      sleeper_id = sleeper_maps["gsis_to_sleeper"].get(gsis_id)
      next_row["gsis_id"] = gsis_id
    espn_id = normalize_numeric_id(raw_id)
    if not sleeper_id and espn_id and espn_id in sleeper_maps.get("espn_to_sleeper", {}):
      sleeper_id = sleeper_maps["espn_to_sleeper"].get(espn_id)
      next_row["espn_id"] = espn_id
    defense = defense_from_espn_id(espn_id)
    if defense:
      next_row["player_id"] = defense["id"]
      next_row["player"] = defense["name"]
      next_row.setdefault("position", "D/ST")
      next_row.setdefault("nfl_team", defense["id"])
      normalized.append(next_row)
      continue
    if sleeper_id:
      next_row["player_id"] = sleeper_id
      if not next_row.get("player"):
        next_row["player"] = player_name_lookup.get(str(sleeper_id))
    if by_week is not None:
      try:
        week = int(next_row.get("week") or 0)
      except (TypeError, ValueError):
        week = 0
      lookup_season = season or next_row.get("season")
      position, nfl_team = resolve_nflverse_meta(by_week, by_season or {}, by_name or {}, lookup_season, week, next_row.get("player"))
      if position and not next_row.get("position"):
        next_row["position"] = position
      if nfl_team and not next_row.get("nfl_team"):
        next_row["nfl_team"] = nfl_team
    normalized.append(next_row)
  return normalized


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
        gained_players = party.get("gained_players", []) or []
        sent_players = party.get("sent_players", []) or []
        gained = ", ".join([player.get("name", "Unknown") for player in gained_players])
        sent = ", ".join([player.get("name", "Unknown") for player in sent_players])
        summary = f"Received: {gained or 'None'} | Sent: {sent or 'None'}"
        players = []
        for player in gained_players:
          pid = player.get("id")
          players.append(
            {
              "id": pid,
              "name": player.get("name", "Unknown"),
              "action": "received",
              "id_type": "sleeper" if looks_like_id(pid) else "name",
            }
          )
        for player in sent_players:
          pid = player.get("id")
          players.append(
            {
              "id": pid,
              "name": player.get("name", "Unknown"),
              "action": "sent",
              "id_type": "sleeper" if looks_like_id(pid) else "name",
            }
          )
        transactions_by_season.setdefault(season, []).append(
          {
            "id": f"{trade.get('id')}-{party.get('roster_id')}",
            "trade_id": trade.get("id"),
            "season": season,
            "week": trade.get("week"),
            "type": "trade",
            "team": party.get("team"),
            "summary": summary,
            "created": trade.get("created"),
            "players": players,
            "source": "sleeper_trades",
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

    season_trade_ids = set()
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
        trade_id = txn.get("id")
        if trade_id is not None:
          season_trade_ids.add(str(trade_id))
        summary = txn.get("summary") or "Trade completed."
        transactions_by_season.setdefault(season, []).append(
          {
            "id": f"{txn.get('id')}-trade",
            "trade_id": txn.get("id"),
            "season": season,
            "week": week,
            "type": "trade",
            "team": team_name,
            "summary": summary,
            "created": created,
            "source": "sleeper_transactions",
          }
        )
        continue

      if adds:
        summary = f"Added: {format_players(adds)}"
        transactions_by_season.setdefault(season, []).append(
          {
            "id": f"{txn.get('id')}-add",
            "source": "sleeper_transactions",
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
            "source": "sleeper_transactions",
            "season": season,
            "week": week,
            "type": "drop",
            "team": team_name,
            "summary": summary,
            "created": created,
          }
        )

    if season_trade_ids:
      filtered = []
      for entry in transactions_by_season.get(season, []):
        if entry.get("type") != "trade":
          filtered.append(entry)
          continue
        if entry.get("source") == "sleeper_trades" and str(entry.get("trade_id")) in season_trade_ids:
          continue
        filtered.append(entry)
      transactions_by_season[season] = filtered

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
        settings = txn.get("settings") or {}
        amount = settings.get("waiver_bid")
        if amount is None:
          amount = settings.get("faab")
        if amount is None:
          amount = txn.get("waiver_bid") or txn.get("faab")

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
            players = []
            for pid in received:
              players.append({"id": pid, "name": resolve_player_name(pid), "action": "received", "id_type": "sleeper"})
            for pid in sent:
              players.append({"id": pid, "name": resolve_player_name(pid), "action": "sent", "id_type": "sleeper"})
            transactions_by_season.setdefault(season, []).append(
              {
                "id": f"{txn_id}-trade-{roster_id}",
                "season": season,
                "week": week,
                "type": "trade",
                "team": team_name,
                "summary": summary,
                "created": created,
                "source": "sleeper_transactions_api",
                "players": players,
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
                "source": "sleeper_transactions_api",
                "amount": amount,
                "players": [
                  {
                    "id": player_id,
                    "name": resolve_player_name(player_id),
                    "action": "add",
                    "id_type": "sleeper",
                  }
                ],
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
                "source": "sleeper_transactions_api",
                "players": [
                  {
                    "id": player_id,
                    "name": resolve_player_name(player_id),
                    "action": "drop",
                    "id_type": "sleeper",
                  }
                ],
              }
            )

      filtered = []
      for entry in transactions_by_season.get(season, []):
        if entry.get("source") == "sleeper_trades":
          continue
        filtered.append(entry)
      transactions_by_season[season] = filtered

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
            return defense["id"], defense["name"], "defense", item.get("playerId")
        sleeper_id = espn_player_id(item)
        if sleeper_id:
          name = player_name_lookup.get(str(sleeper_id)) or name
        if not sleeper_id and name:
          key = normalize_name(name)
          sleeper_id = sleeper_maps.get("name_to_sleeper", {}).get(key)
        if not name:
          raw_id = normalize_numeric_id(item.get("playerId") if item else None)
          if raw_id:
            name = sleeper_maps.get("espn_to_name", {}).get(str(raw_id)) or f"ESPN Player {raw_id}"
        if not name:
          name = "(Unknown Player)"
        id_type = "sleeper" if sleeper_id else "espn"
        return (
          sleeper_id or normalize_numeric_id(item.get("playerId") if item else None),
          name,
          id_type,
          item.get("playerId"),
        )

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
            pid, name, id_type, source_id = resolve_espn_player(item)
            if to_team is not None:
              adds_by_team.setdefault(str(to_team), []).append(
                {"id": pid, "name": name, "id_type": id_type, "source_player_id": source_id}
              )
            if from_team is not None:
              drops_by_team.setdefault(str(from_team), []).append(
                {"id": pid, "name": name, "id_type": id_type, "source_player_id": source_id}
              )
          team_ids = set(adds_by_team.keys()) | set(drops_by_team.keys())
          for team_id in team_ids:
            received_names = [row["name"] for row in adds_by_team.get(team_id, [])]
            sent_names = [row["name"] for row in drops_by_team.get(team_id, [])]
            received = ", ".join(received_names) or "None"
            sent = ", ".join(sent_names) or "None"
            players = []
            for row in adds_by_team.get(team_id, []):
              players.append(
                {
                  "id": row["id"],
                  "name": row["name"],
                  "action": "received",
                  "id_type": row.get("id_type"),
                  "source_player_id": row.get("source_player_id"),
                }
              )
            for row in drops_by_team.get(team_id, []):
              players.append(
                {
                  "id": row["id"],
                  "name": row["name"],
                  "action": "sent",
                  "id_type": row.get("id_type"),
                  "source_player_id": row.get("source_player_id"),
                }
              )
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
                "source": "espn_transactions",
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
            pid, name, id_type, source_id = resolve_espn_player(item)
            transactions_by_season.setdefault(season, []).append(
              {
                "id": f"{txn_id}-add-{team_id}-{item.get('playerId')}",
                "season": season,
                "week": week,
                "type": "add",
                "team": team_name,
                "summary": f"Added: {name}",
                "created": txn.get("proposedDate"),
                "players": [
                  {
                    "id": pid,
                    "name": name,
                    "action": "add",
                    "id_type": id_type,
                    "source_player_id": source_id,
                  }
                ],
                "source": "espn_transactions",
              }
            )
          elif item_type == "DROP":
            pid, name, id_type, source_id = resolve_espn_player(item)
            transactions_by_season.setdefault(season, []).append(
              {
                "id": f"{txn_id}-drop-{team_id}-{item.get('playerId')}",
                "season": season,
                "week": week,
                "type": "drop",
                "team": team_name,
                "summary": f"Dropped: {name}",
                "created": txn.get("proposedDate"),
                "players": [
                  {
                    "id": pid,
                    "name": name,
                    "action": "drop",
                    "id_type": id_type,
                    "source_player_id": source_id,
                  }
                ],
                "source": "espn_transactions",
              }
            )

  def dedupe_trade_entries(entries):
    source_rank = {
      "sleeper_transactions_api": 3,
      "sleeper_transactions": 2,
      "sleeper_trades": 1,
      "espn_transactions": 3,
    }
    non_trades = []
    trade_map = {}
    for entry in entries:
      if entry.get("type") != "trade":
        non_trades.append(entry)
        continue
      trade_key = entry.get("trade_id") or entry.get("id")
      summary = entry.get("summary") or ""
      key = ("trade", str(trade_key), summary)
      existing = trade_map.get(key)
      if not existing:
        trade_map[key] = entry
        continue
      existing_rank = source_rank.get(existing.get("source"), 0)
      current_rank = source_rank.get(entry.get("source"), 0)
      if current_rank > existing_rank:
        trade_map[key] = entry
    return non_trades + list(trade_map.values())

  for season, entries in transactions_by_season.items():
    entries = dedupe_trade_entries(entries)
    sources = sources_by_season.get(season, [])
    write_json(
      OUTPUT_DIR / "transactions" / f"{season}.json",
      {"season": season, "entries": entries, "sources": sources},
    )



def _clean_player_name(name):
  if not name:
    return ""
  name = str(name).strip().lower()
  name = name.replace("’", "'").replace("`", "'")
  for ch in [".", ",", "(", ")", "[", "]", "{", "}", "\""]:
    name = name.replace(ch, "")
  name = " ".join(name.split())
  return name

def _coerce_player_id(row, player_name_lookup):
  for k in ("player_id", "sleeper_id", "gsis_id", "espn_id", "playerId", "id"):
    v = row.get(k)
    if v not in (None, "", "None"):
      return str(v)
  name = row.get("player") or row.get("player_name") or row.get("display_name")
  key = _clean_player_name(name)
  if not key:
    return None
  v = player_name_lookup.get(key) or player_name_lookup.get(name) or player_name_lookup.get(str(name))
  if v not in (None, "", "None"):
    return str(v)
  return None


def _map_to_sleeper_id(sleeper_maps, pid):
  pid = str(pid or "")
  if not pid or not isinstance(sleeper_maps, dict):
    return None
  for k, v in sleeper_maps.items():
    if not isinstance(v, dict):
      continue
    lk = str(k).lower()
    if "gsis" in lk and "sleeper" in lk and pid in v:
      return str(v.get(pid))
  for k, v in sleeper_maps.items():
    if not isinstance(v, dict):
      continue
    if pid in v:
      mapped = v.get(pid)
      if mapped is None:
        continue
      mapped_s = str(mapped)
      if mapped_s.isdigit():
        return mapped_s
  return None


def _load_players_index(output_dir):
  try:
    players = read_json(output_dir / "players.json")
  except Exception:
    players = []
  by_gsis = {}
  by_sleeper = {}
  by_name = {}
  if isinstance(players, list):
    for r in players:
      if not isinstance(r, dict):
        continue
      gsis = str(r.get("gsis_id") or r.get("gsisId") or "").strip()
      sid = str(r.get("sleeper_id") or r.get("sleeperId") or r.get("player_id") or "").strip()
      name = str(r.get("full_name") or r.get("name") or r.get("player_name") or "").strip()
      if gsis:
        by_gsis[gsis] = r
      if sid and sid != "None":
        by_sleeper[sid] = r
      if name:
        by_name[name.lower()] = r
  return {"by_gsis": by_gsis, "by_sleeper": by_sleeper, "by_name": by_name}

def _enrich_career_leader(item, players_idx, nfl_teams_by_name=None):
  if not isinstance(item, dict):
    return item
  pid = str(item.get("player_id") or "").strip()
  name = str(item.get("display_name") or item.get("player_name") or "").strip()
  rec = None
  if pid and pid != "None":
    rec = players_idx["by_sleeper"].get(pid) or players_idx["by_gsis"].get(pid)
  if rec is None and name:
    rec = players_idx["by_name"].get(name.lower())
  if rec:
    pos = rec.get("position") or rec.get("pos")
    team = rec.get("team") or rec.get("nfl_team") or rec.get("nflTeam")
    if pos and not item.get("position"):
      p = str(pos).strip().upper()
      if p in ("DEF", "DST", "D/ST"):
        item["position"] = "D/ST"
      else:
        item["position"] = str(pos)
    if team and not item.get("nfl_team"):
      item["nfl_team"] = str(team)

  # Backfill team history from nflverse (all teams across years) by display name
  try:
    name_key = normalize_name(name)
  except Exception:
    name_key = ""
  nfl_teams_by_name = nfl_teams_by_name or {}
  if name_key and name_key in nfl_teams_by_name:
    meta = nfl_teams_by_name.get(name_key) or {}
    teams = meta.get("teams") or []
    last_team = meta.get("last_team")
    if teams and not item.get("nfl_teams"):
      item["nfl_teams"] = teams
    if (not item.get("nfl_team")) and last_team:
      item["nfl_team"] = last_team

  # Normalize defense position label everywhere
  pos = (item.get("position") or "").strip().upper()
  if pos in ("DEF", "DST", "D/ST"):
    item["position"] = "D/ST"
  return item

def main():
  seasons = []
  all_time_weekly = []
  season_totals = []
  sleeper_maps = load_sleeper_player_maps()
  player_name_lookup = build_player_name_lookup()
  players_idx = _load_players_index(OUTPUT_DIR)
  nfl_by_week, nfl_by_season, nfl_by_name = load_nflverse_lookup()
  nfl_teams_by_name = load_nflverse_teams_by_player()
  if sleeper_maps.get("espn_to_name"):
    write_json(OUTPUT_DIR / "espn_name_map.json", sleeper_maps["espn_to_name"])

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
    raw_lineups = [row for row in payload.get("lineups", []) if is_regular_season(row.get("week"))]
    lineups = normalize_lineups(
      raw_lineups,
      sleeper_maps,
      player_name_lookup,
      source="league",
      season=season,
      by_week=nfl_by_week,
      by_season=nfl_by_season,
      by_name=nfl_by_name,
    )
    matchups = [row for row in payload.get("matchups", []) if is_regular_season(row.get("week"))]
    teams = payload.get("teams", [])
    weeks = sorted({int(row.get("week")) for row in lineups + matchups if is_regular_season(row.get("week"))})
    effective_lineups = list(lineups)

    for week in weeks:
      week_matchups = [row for row in matchups if int(row.get("week")) == week]
      week_lineups = [row for row in lineups if int(row.get("week")) == week]
      if not week_lineups:
        espn_lineups = load_espn_lineups(season, week)
        if espn_lineups:
          week_lineups = normalize_espn_lineups(
            espn_lineups,
            sleeper_maps,
            player_name_lookup,
            season=season,
            by_week=nfl_by_week,
            by_season=nfl_by_season,
            by_name=nfl_by_name,
          )
          effective_lineups.extend(week_lineups)
      write_json(
        OUTPUT_DIR / "weekly" / str(season) / f"week-{week}.json",
        {"season": season, "week": week, "matchups": week_matchups, "lineups": week_lineups},
      )

    player_totals = {}
    for row in effective_lineups:    points = float(row.get("points") or 0)
    pid = row.get("player_id")
    player_id = None
    if pid not in (None, "", "None"):
      player_id = str(pid)

    pos = row.get("position")
    nfl_team = row.get("nfl_team")
    player_name = row.get("player") or row.get("player_name") or row.get("display_name")

    if _is_defense_position(pos):
      abbr = _infer_defense_abbr(player_name, nfl_team=nfl_team)
      if abbr:
        player_id = abbr
        pos = "D/ST"
        nfl_team = abbr
        player_name = f"{ESPN_TEAM_ABBR_TO_NAME.get(abbr, abbr).title()} D/ST"

    all_time_weekly.append(
      {
        "player_id": player_id,
        "player_name": player_name,
        "team": row.get("team"),
        "season": season,
        "week": row.get("week"),
        "started": bool(row.get("started") or row.get("starter") or row.get("is_starter")),
        "position": pos,
        "nfl_team": nfl_team,
        "points": points,
      }
    )

    if not player_id:
      continue
      if not player_id:
        continue
      current = player_totals.get(player_id, {"player_id": player_id, "points": 0.0, "games": 0})
      current["points"] += points
      current["games"] += 1
      player_totals[player_id] = current


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

  top_weekly = [row for row in all_time_weekly if float(row.get("points") or 0) >= 45]
  top_weekly = sorted(top_weekly, key=lambda item: item["points"], reverse=True)
  for row in top_weekly:
    p = str(row.get("position") or "").strip().upper()
    if p in ("DEF", "DST", "D/ST"):
      row["position"] = "D/ST"
  career_stats_path = OUTPUT_DIR / "player_stats" / "career.json"
  if career_stats_path.exists():
    career_payload = read_json(career_stats_path)
    career_rows = career_payload.get("rows", []) if isinstance(career_payload, dict) else []
    normalized = []
    for row in career_rows:
      source_pid = row.get("player_id") or row.get("sleeper_id") or row.get("gsis_id")
      if not source_pid:
        continue

      mapped_pid = _map_to_sleeper_id(sleeper_maps, source_pid) or str(source_pid)

      raw_pos = row.get("position") or row.get("pos") or row.get("player_position") or row.get("fantasy_position")
      p = str(raw_pos or "").strip().upper()
      if p in ("DEF", "DST", "D/ST"):
        p = "D/ST"

      raw_team = row.get("nfl_team") or row.get("team") or row.get("pro_team") or row.get("nflTeam")
      t = str(raw_team or "").strip().upper() or None

      normalized.append(
        {
          "player_id": mapped_pid,
          "source_player_id": str(source_pid),
          "display_name": row.get("display_name") or row.get("player_display_name") or row.get("player_name"),
          "position": p or None,
          "nfl_team": t,
          "points": float(row.get("points") or row.get("fantasy_points_custom") or 0),
          "games": int(row.get("games") or row.get("games_played") or 0),
          "seasons": int(row.get("seasons") or row.get("seasons_played") or 0),
        }
      )

    career_leaders = sorted(normalized, key=lambda item: item["points"], reverse=True)
    career_leaders = [_enrich_career_leader(dict(r), players_idx, nfl_teams_by_name=nfl_teams_by_name) for r in career_leaders]

    # Backfill/override D/ST and K career totals from weekly lineup data (league + ESPN)
    def _normalize_pos(pos):
      p = str(pos or "").strip().upper()
      if p in ("DEF", "DST", "D/ST"):
        return "D/ST"
      if p in ("PK",):
        return "K"
      return p

    def _calc_weekly_career_totals(rows, positions=("D/ST","K")):
      positions = set(positions)
      totals = {}
      for row in rows or []:
        pid = row.get("player_id")
        if pid in (None, "", "None"):
          continue
        pos = _normalize_pos(row.get("position"))
        if pos not in positions:
          continue
        season = row.get("season")
        week = row.get("week")
        try:
          pts = float(row.get("points") or 0)
        except Exception:
          pts = 0.0
        cur = totals.get(str(pid))
        if cur is None:
          cur = {
            "player_id": str(pid),
            "display_name": row.get("player_name") or row.get("player") or row.get("display_name") or str(pid),
            "position": pos,
            "nfl_team": row.get("nfl_team") or (str(pid) if pos == "D/ST" else None),
            "points": 0.0,
            "games": 0,
            "seasons_set": set(),
          }
          totals[str(pid)] = cur
        cur["points"] += pts
        cur["games"] += 1
        if season not in (None, "", "None"):
          try:
            cur["seasons_set"].add(int(season))
          except Exception:
            pass
        if (not cur.get("nfl_team")) and row.get("nfl_team"):
          cur["nfl_team"] = row.get("nfl_team")
      for cur in totals.values():
        cur["seasons"] = len(cur["seasons_set"])
        del cur["seasons_set"]
      return totals

    special_totals = _calc_weekly_career_totals(all_time_weekly, positions=("D/ST","K"))

    # index existing career leaders by player_id
    by_pid = {}
    for r in career_leaders:
      if isinstance(r, dict) and r.get("player_id") not in (None, "", "None"):
        by_pid[str(r["player_id"])] = r

    # override points/games/seasons for D/ST and K (more complete via weekly lineups)
    for pid, agg in special_totals.items():
      existing = by_pid.get(pid)
      if existing is None:
        existing = {
          "player_id": pid,
          "source_player_id": agg.get("source_player_id") or pid,
          "display_name": agg.get("display_name") or pid,
          "position": agg.get("position"),
          "nfl_team": agg.get("nfl_team"),
          "points": agg.get("points") or 0.0,
          "games": agg.get("games") or 0,
          "seasons": agg.get("seasons") or 0,
        }
        existing = _enrich_career_leader(existing, players_idx, nfl_teams_by_name=nfl_teams_by_name)
        career_leaders.append(existing)
        by_pid[pid] = existing
      else:
        pos = _normalize_pos(existing.get("position") or agg.get("position"))
        if pos in ("D/ST", "K"):
          existing["position"] = pos
          existing["points"] = float(agg.get("points") or 0.0)
          existing["games"] = int(agg.get("games") or 0)
          existing["seasons"] = int(agg.get("seasons") or 0)
          if agg.get("nfl_team"):
            existing["nfl_team"] = agg.get("nfl_team")
          existing = _enrich_career_leader(existing, players_idx, nfl_teams_by_name=nfl_teams_by_name)
          by_pid[pid] = existing

    # re-sort after overrides/inserts
    career_leaders = sorted(career_leaders, key=lambda item: float(item.get("points") or 0), reverse=True)
  else:
    career_leaders = sorted(career_totals.values(), key=lambda item: item["points"], reverse=True)
    career_leaders = [_enrich_career_leader(dict(r), players_idx, nfl_teams_by_name=nfl_teams_by_name) for r in career_leaders]

    # Backfill/override D/ST and K career totals from weekly lineup data (league + ESPN)
    def _normalize_pos(pos):
      p = str(pos or "").strip().upper()
      if p in ("DEF", "DST", "D/ST"):
        return "D/ST"
      if p in ("PK",):
        return "K"
      return p

    def _calc_weekly_career_totals(rows, positions=("D/ST","K")):
      positions = set(positions)
      totals = {}
      for row in rows or []:
        pid = row.get("player_id")
        if pid in (None, "", "None"):
          continue
        pos = _normalize_pos(row.get("position"))
        if pos not in positions:
          continue
        season = row.get("season")
        week = row.get("week")
        try:
          pts = float(row.get("points") or 0)
        except Exception:
          pts = 0.0
        cur = totals.get(str(pid))
        if cur is None:
          cur = {
            "player_id": str(pid),
            "display_name": row.get("player_name") or row.get("player") or row.get("display_name") or str(pid),
            "position": pos,
            "nfl_team": row.get("nfl_team") or (str(pid) if pos == "D/ST" else None),
            "points": 0.0,
            "games": 0,
            "seasons_set": set(),
          }
          totals[str(pid)] = cur
        cur["points"] += pts
        cur["games"] += 1
        if season not in (None, "", "None"):
          try:
            cur["seasons_set"].add(int(season))
          except Exception:
            pass
        if (not cur.get("nfl_team")) and row.get("nfl_team"):
          cur["nfl_team"] = row.get("nfl_team")
      for cur in totals.values():
        cur["seasons"] = len(cur["seasons_set"])
        del cur["seasons_set"]
      return totals

    special_totals = _calc_weekly_career_totals(all_time_weekly, positions=("D/ST","K"))

    # index existing career leaders by player_id
    by_pid = {}
    for r in career_leaders:
      if isinstance(r, dict) and r.get("player_id") not in (None, "", "None"):
        by_pid[str(r["player_id"])] = r

    # override points/games/seasons for D/ST and K (more complete via weekly lineups)
    for pid, agg in special_totals.items():
      existing = by_pid.get(pid)
      if existing is None:
        existing = {
          "player_id": pid,
          "source_player_id": agg.get("source_player_id") or pid,
          "display_name": agg.get("display_name") or pid,
          "position": agg.get("position"),
          "nfl_team": agg.get("nfl_team"),
          "points": agg.get("points") or 0.0,
          "games": agg.get("games") or 0,
          "seasons": agg.get("seasons") or 0,
        }
        existing = _enrich_career_leader(existing, players_idx, nfl_teams_by_name=nfl_teams_by_name)
        career_leaders.append(existing)
        by_pid[pid] = existing
      else:
        pos = _normalize_pos(existing.get("position") or agg.get("position"))
        if pos in ("D/ST", "K"):
          existing["position"] = pos
          existing["points"] = float(agg.get("points") or 0.0)
          existing["games"] = int(agg.get("games") or 0)
          existing["seasons"] = int(agg.get("seasons") or 0)
          if agg.get("nfl_team"):
            existing["nfl_team"] = agg.get("nfl_team")
          existing = _enrich_career_leader(existing, players_idx, nfl_teams_by_name=nfl_teams_by_name)
          by_pid[pid] = existing

    # re-sort after overrides/inserts
    career_leaders = sorted(career_leaders, key=lambda item: float(item.get("points") or 0), reverse=True)

  all_time_payload = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "topWeekly": top_weekly,
    "topSeasons": season_leaders,
    "careerLeaders": career_leaders,
  }
  write_json(OUTPUT_DIR / "all_time.json", all_time_payload)


if __name__ == "__main__":
  main()
