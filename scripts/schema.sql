PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  player_uid TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  full_name_norm TEXT NOT NULL,
  position TEXT,
  nfl_team TEXT,
  dob TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_players_name_norm ON players(full_name_norm);
CREATE INDEX IF NOT EXISTS idx_players_pos_team ON players(position, nfl_team);

CREATE TABLE IF NOT EXISTS player_ids (
  player_uid TEXT NOT NULL,
  id_type TEXT NOT NULL,
  id_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (id_type, id_value),
  FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_ids_uid ON player_ids(player_uid);

CREATE TABLE IF NOT EXISTS player_seasons (
  player_uid TEXT NOT NULL,
  season INTEGER NOT NULL,
  position TEXT,
  nfl_team TEXT,
  PRIMARY KEY (player_uid, season),
  FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_seasons_team ON player_seasons(season, nfl_team);

CREATE TABLE IF NOT EXISTS teams (
  team_key TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  league_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  roster_id TEXT,
  owner_user_id TEXT,
  display_name TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_platform_league_season_team
ON teams(platform, league_id, season, team_id);

CREATE TABLE IF NOT EXISTS matchups (
  matchup_key TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  league_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  matchup_id TEXT NOT NULL,
  home_team_key TEXT NOT NULL,
  away_team_key TEXT NOT NULL,
  home_score REAL,
  away_score REAL,
  status TEXT,
  kickoff_ts TEXT,
  FOREIGN KEY (home_team_key) REFERENCES teams(team_key) ON DELETE CASCADE,
  FOREIGN KEY (away_team_key) REFERENCES teams(team_key) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_matchups_platform_league_season_week_matchupid
ON matchups(platform, league_id, season, week, matchup_id);

CREATE INDEX IF NOT EXISTS idx_matchups_week ON matchups(platform, league_id, season, week);

CREATE TABLE IF NOT EXISTS lineups (
  lineup_key TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  league_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  matchup_id TEXT NOT NULL,
  team_key TEXT NOT NULL,
  slot TEXT NOT NULL,
  player_uid TEXT NOT NULL,
  points REAL,
  proj_points REAL,
  is_starter INTEGER,
  FOREIGN KEY (team_key) REFERENCES teams(team_key) ON DELETE CASCADE,
  FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lineups_matchup ON lineups(platform, league_id, season, week, matchup_id);
CREATE INDEX IF NOT EXISTS idx_lineups_player_week ON lineups(player_uid, season, week);

CREATE TABLE IF NOT EXISTS player_week_stats (
  player_uid TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  source TEXT NOT NULL,
  team TEXT,
  position TEXT,
  stats_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_uid, season, week, source),
  FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pws_source_season_week ON player_week_stats(source, season, week);

CREATE TABLE IF NOT EXISTS id_overrides (
  id_type TEXT NOT NULL,
  id_value TEXT NOT NULL,
  player_uid TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (id_type, id_value),
  FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS link_audit (
  event_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  id_type TEXT,
  id_value TEXT,
  player_uid TEXT,
  confidence REAL,
  detail_json TEXT
);

CREATE TRIGGER IF NOT EXISTS trg_players_updated_at
AFTER UPDATE ON players
FOR EACH ROW
BEGIN
  UPDATE players SET updated_at = datetime('now') WHERE player_uid = OLD.player_uid;
END;
