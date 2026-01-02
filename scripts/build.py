import json, os, re, sqlite3, hashlib, uuid
from datetime import datetime
from typing import Any, Optional, Tuple
import requests

API = "https://api.sleeper.app/v1"

def norm_name(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9\s\-'.]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s

def make_uid(seed: str) -> str:
    h = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]
    return f"p_{h}"

def db_connect(path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn

def fetch_json(url: str):
    r = requests.get(url, timeout=45)
    r.raise_for_status()
    return r.json()

def resolve_player_uid(conn: sqlite3.Connection, id_type: str, id_value: str) -> Optional[str]:
    row = conn.execute("SELECT player_uid FROM id_overrides WHERE id_type=? AND id_value=? LIMIT 1", (id_type, id_value)).fetchone()
    if row:
        return row["player_uid"]
    row = conn.execute("SELECT player_uid FROM player_ids WHERE id_type=? AND id_value=? LIMIT 1", (id_type, id_value)).fetchone()
    return row["player_uid"] if row else None

def upsert_player(conn: sqlite3.Connection, full_name: str, position: Optional[str], nfl_team: Optional[str], dob: Optional[str]) -> str:
    full_name_norm = norm_name(full_name)
    row = conn.execute(
        "SELECT player_uid FROM players WHERE full_name_norm=? AND COALESCE(dob,'')=COALESCE(?, '') LIMIT 1",
        (full_name_norm, dob),
    ).fetchone()
    if row:
        player_uid = row["player_uid"]
        conn.execute(
            "UPDATE players SET full_name=?, position=COALESCE(?,position), nfl_team=COALESCE(?,nfl_team), dob=COALESCE(?,dob) WHERE player_uid=?",
            (full_name, position, nfl_team, dob, player_uid),
        )
        return player_uid
    seed = full_name_norm + "|" + (dob or "") + "|" + str(uuid.uuid4())
    player_uid = make_uid(seed)
    conn.execute(
        "INSERT INTO players(player_uid, full_name, full_name_norm, position, nfl_team, dob) VALUES (?,?,?,?,?,?)",
        (player_uid, full_name, full_name_norm, position, nfl_team, dob),
    )
    return player_uid

def link_id(conn: sqlite3.Connection, player_uid: str, id_type: str, id_value: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO player_ids(player_uid, id_type, id_value) VALUES (?,?,?)",
        (player_uid, id_type, id_value),
    )

def make_team_key(platform: str, league_id: str, season: int, team_id: str) -> str:
    return f"{platform}:{league_id}:{season}:{team_id}"

def upsert_sleeper_teams(conn, league_id: str, season: int):
    users = fetch_json(f"{API}/league/{league_id}/users")
    rosters = fetch_json(f"{API}/league/{league_id}/rosters")
    user_map = {u["user_id"]: u for u in users}
    for r in rosters:
        roster_id = str(r["roster_id"])
        owner_id = r.get("owner_id")
        disp = None
        if owner_id and owner_id in user_map:
            u = user_map[owner_id]
            disp = (u.get("metadata") or {}).get("team_name") or u.get("display_name") or u.get("username")
        team_key = make_team_key("sleeper", league_id, season, roster_id)
        conn.execute(
            """INSERT INTO teams(team_key, platform, league_id, season, team_id, roster_id, owner_user_id, display_name)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(team_key) DO UPDATE SET display_name=excluded.display_name, owner_user_id=excluded.owner_user_id""",
            (team_key, "sleeper", league_id, season, roster_id, roster_id, owner_id, disp),
        )

def ingest_sleeper_matchups(conn, league_id: str, season: int, week: int):
    entries = fetch_json(f"{API}/league/{league_id}/matchups/{week}")
    by_mid = {}
    for e in entries:
        mid = str(e["matchup_id"])
        by_mid.setdefault(mid, []).append(e)
    for mid, group in by_mid.items():
        if len(group) < 2:
            continue
        a, b = group[0], group[1]
        home, away = a, b
        home_team_key = make_team_key("sleeper", league_id, season, str(home["roster_id"]))
        away_team_key = make_team_key("sleeper", league_id, season, str(away["roster_id"]))
        matchup_key = f"sleeper:{league_id}:{season}:{week}:{mid}"
        conn.execute(
            """INSERT INTO matchups(matchup_key, platform, league_id, season, week, matchup_id,
                                    home_team_key, away_team_key, home_score, away_score, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(matchup_key) DO UPDATE SET home_score=excluded.home_score, away_score=excluded.away_score""",
            (matchup_key, "sleeper", league_id, season, week, mid,
             home_team_key, away_team_key, float(home.get("points", 0) or 0), float(away.get("points", 0) or 0), "Final"),
        )
        for e in group:
            team_key = make_team_key("sleeper", league_id, season, str(e["roster_id"]))
            starters = set((e.get("starters") or []))
            players = (e.get("players") or [])
            pts_map = (e.get("players_points") or {})
            for pid in players:
                spid = str(pid)
                player_uid = resolve_player_uid(conn, "sleeper", spid)
                if not player_uid:
                    player_uid = upsert_player(conn, full_name=spid, position=None, nfl_team=None, dob=None)
                    link_id(conn, player_uid, "sleeper", spid)
                lineup_key = f"sleeper:{league_id}:{season}:{week}:{mid}:{team_key}:{spid}"
                points = pts_map.get(spid)
                is_starter = 1 if spid in starters else 0
                conn.execute(
                    """INSERT INTO lineups(lineup_key, platform, league_id, season, week, matchup_id, team_key, slot, player_uid, points, is_starter)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(lineup_key) DO UPDATE SET points=excluded.points, is_starter=excluded.is_starter""",
                    (lineup_key, "sleeper", league_id, season, week, mid, team_key, "UNK", player_uid,
                     float(points) if points is not None else None, is_starter),
                )

def export_json(conn: sqlite3.Connection, out_path: str, sql: str, params: Tuple[Any, ...] = ()):
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)

def export_all(conn, out_dir: str, season: int):
    export_json(conn, os.path.join(out_dir, "players.json"),
                "SELECT player_uid, full_name, position, nfl_team, dob FROM players")
    export_json(conn, os.path.join(out_dir, "player_ids.json"),
                "SELECT player_uid, id_type, id_value FROM player_ids")
    export_json(conn, os.path.join(out_dir, "teams.json"),
                "SELECT team_key, platform, league_id, season, team_id, roster_id, owner_user_id, display_name FROM teams")
    export_json(conn, os.path.join(out_dir, f"matchups_{season}.json"),
                """SELECT matchup_key, platform, league_id, season, week, matchup_id,
                          home_team_key, away_team_key, home_score, away_score, status, kickoff_ts
                   FROM matchups WHERE season=?""", (season,))
    export_json(conn, os.path.join(out_dir, f"lineups_{season}.json"),
                """SELECT lineup_key, platform, league_id, season, week, matchup_id, team_key, slot,
                          player_uid, points, proj_points, is_starter
                   FROM lineups WHERE season=?""", (season,))

def main():
    with open("build_config.json", "r", encoding="utf-8") as f:
        cfg = json.load(f)

    db_path = cfg["db_path"]
    out_dir = cfg["exports_dir"]
    league_id = cfg["league"]["league_id"]
    seasons = cfg["league"]["seasons"]
    weeks = cfg["league"]["weeks"]

    conn = db_connect(db_path)
    schema_sql = open("scripts/schema.sql", "r", encoding="utf-8").read()
    conn.executescript(schema_sql)

    for season in seasons:
        upsert_sleeper_teams(conn, league_id, season)
        for w in weeks:
            ingest_sleeper_matchups(conn, league_id, season, int(w))
        conn.commit()
        export_all(conn, out_dir, season)

    conn.close()

if __name__ == "__main__":
    main()
