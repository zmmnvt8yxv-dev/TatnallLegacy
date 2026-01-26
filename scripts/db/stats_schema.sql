-- ============================================================================
-- UNIFIED STATS DATABASE SCHEMA
-- ============================================================================
-- This schema implements Layer 3 (Unified Stats & Metrics) of the data silo
-- architecture. It provides unified storage for all player statistics with
-- source tracking and audit capabilities.
--
-- Key features:
--   - NFL games reference table with full schedule data
--   - Game-level player stats with JSONB for flexibility
--   - Season and career aggregations
--   - Source tracking for data provenance
--   - Support for stat corrections/updates
--
-- Depends on: schema.sql (players table with player_uid)
--
-- Version: 1.0.0
-- Date: 2026-01-26
-- ============================================================================

PRAGMA foreign_keys = ON;

-- Update schema version
INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('stats_schema_version', '1.0.0');
INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('stats_schema_created_at', datetime('now'));

-- ----------------------------------------------------------------------------
-- NFL_GAMES TABLE: Game reference data
-- ----------------------------------------------------------------------------
-- Stores NFL game metadata for joining player stats to game context.
-- This is the authoritative source for game information.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nfl_games (
    -- Primary identifier: Unique game ID (typically format: YYYY_WW_AWAY_HOME)
    game_id TEXT PRIMARY KEY,

    -- Season/week context
    season INTEGER NOT NULL CHECK(season >= 2000 AND season <= 2100),
    week INTEGER NOT NULL CHECK(week >= 0 AND week <= 22),  -- 0 for preseason, 18+ for playoffs
    season_type TEXT NOT NULL DEFAULT 'REG' CHECK(season_type IN ('PRE', 'REG', 'POST')),

    -- Teams
    home_team TEXT NOT NULL,  -- Team abbreviation (KC, SF, etc.)
    away_team TEXT NOT NULL,  -- Team abbreviation
    home_score INTEGER,
    away_score INTEGER,

    -- Game timing
    game_date TEXT,  -- ISO 8601 format: YYYY-MM-DD
    game_time TEXT,  -- HH:MM format (Eastern time)
    game_datetime TEXT,  -- Full ISO 8601 datetime with timezone

    -- Game status
    status TEXT DEFAULT 'scheduled' CHECK(status IN (
        'scheduled',   -- Game not yet played
        'in_progress', -- Game currently in progress
        'final',       -- Game completed
        'postponed',   -- Game postponed
        'cancelled'    -- Game cancelled
    )),

    -- Venue information
    stadium TEXT,
    location TEXT,  -- City, State
    roof_type TEXT CHECK(roof_type IN ('dome', 'open', 'retractable', NULL)),
    surface TEXT CHECK(surface IN ('grass', 'turf', NULL)),

    -- Weather (for outdoor games)
    weather_temp INTEGER,  -- Fahrenheit
    weather_wind INTEGER,  -- MPH
    weather_condition TEXT,  -- Clear, Rain, Snow, etc.

    -- Betting/context data (optional)
    spread_line REAL,  -- Home team spread
    over_under REAL,

    -- Source tracking
    source TEXT DEFAULT 'nflverse',  -- Where this data came from
    source_game_id TEXT,  -- Original ID from source

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Ensure unique game per season/week/matchup
    UNIQUE(season, week, home_team, away_team)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_games_season ON nfl_games(season);
CREATE INDEX IF NOT EXISTS idx_games_season_week ON nfl_games(season, week);
CREATE INDEX IF NOT EXISTS idx_games_date ON nfl_games(game_date);
CREATE INDEX IF NOT EXISTS idx_games_home_team ON nfl_games(home_team);
CREATE INDEX IF NOT EXISTS idx_games_away_team ON nfl_games(away_team);
CREATE INDEX IF NOT EXISTS idx_games_status ON nfl_games(status);
CREATE INDEX IF NOT EXISTS idx_games_season_type ON nfl_games(season_type);

-- ----------------------------------------------------------------------------
-- PLAYER_GAME_STATS TABLE: Individual game statistics
-- ----------------------------------------------------------------------------
-- Stores detailed player statistics for each game. Stats are stored as JSON
-- for flexibility across different stat types and sources.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_game_stats (
    -- Auto-incrementing surrogate key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Player reference (FK to players table from schema.sql)
    player_uid TEXT NOT NULL,

    -- Game reference
    game_id TEXT NOT NULL,

    -- Context
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    team TEXT,  -- Team player was on for this game
    opponent TEXT,  -- Opposing team
    is_home INTEGER DEFAULT 0,  -- 1 if home game, 0 if away

    -- Position context (may differ from player's primary position)
    position TEXT,

    -- Game participation
    played INTEGER DEFAULT 1,  -- 1 if player participated
    started INTEGER,  -- 1 if player started
    snap_count INTEGER,
    snap_pct REAL,

    -- Statistics stored as JSON for flexibility
    -- Contains all raw stats (passing_yards, rushing_tds, etc.)
    stats JSON NOT NULL,

    -- Calculated fantasy points (pre-computed for common systems)
    fantasy_points_ppr REAL,     -- PPR scoring
    fantasy_points_half REAL,    -- Half-PPR scoring
    fantasy_points_std REAL,     -- Standard scoring
    fantasy_points_custom REAL,  -- Custom league scoring

    -- Source tracking
    source TEXT NOT NULL DEFAULT 'nflverse',  -- nflverse, espn, sportradar, etc.
    source_player_id TEXT,  -- Original player ID from source
    source_game_id TEXT,  -- Original game ID from source

    -- Version tracking for corrections
    version INTEGER NOT NULL DEFAULT 1,
    is_current INTEGER NOT NULL DEFAULT 1,  -- 1 for current version, 0 for superseded
    superseded_by INTEGER,  -- ID of newer version if corrected
    correction_reason TEXT,  -- Reason for correction if version > 1

    -- Metadata
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Foreign key constraints
    FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES nfl_games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (superseded_by) REFERENCES player_game_stats(id),

    -- Ensure one current record per player/game/source
    UNIQUE(player_uid, game_id, source, is_current)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_game_stats_player ON player_game_stats(player_uid);
CREATE INDEX IF NOT EXISTS idx_game_stats_game ON player_game_stats(game_id);
CREATE INDEX IF NOT EXISTS idx_game_stats_season_week ON player_game_stats(season, week);
CREATE INDEX IF NOT EXISTS idx_game_stats_team ON player_game_stats(team);
CREATE INDEX IF NOT EXISTS idx_game_stats_position ON player_game_stats(position);
CREATE INDEX IF NOT EXISTS idx_game_stats_source ON player_game_stats(source);
CREATE INDEX IF NOT EXISTS idx_game_stats_current ON player_game_stats(is_current);
CREATE INDEX IF NOT EXISTS idx_game_stats_player_season ON player_game_stats(player_uid, season);
CREATE INDEX IF NOT EXISTS idx_game_stats_fantasy_ppr ON player_game_stats(fantasy_points_ppr DESC);

-- Composite index for common lookup pattern
CREATE INDEX IF NOT EXISTS idx_game_stats_player_game_source
    ON player_game_stats(player_uid, game_id, source);

-- ----------------------------------------------------------------------------
-- PLAYER_SEASON_STATS TABLE: Season-level aggregations
-- ----------------------------------------------------------------------------
-- Stores aggregated statistics for each player-season combination.
-- Can be computed from player_game_stats or imported directly.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_season_stats (
    -- Auto-incrementing surrogate key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Player reference
    player_uid TEXT NOT NULL,

    -- Season context
    season INTEGER NOT NULL,
    season_type TEXT NOT NULL DEFAULT 'REG' CHECK(season_type IN ('REG', 'POST', 'ALL')),

    -- Team (primary team for season, may have multiple)
    team TEXT,
    teams_played_for TEXT,  -- Comma-separated if traded mid-season

    -- Position context
    position TEXT,

    -- Games summary
    games_played INTEGER DEFAULT 0,
    games_started INTEGER DEFAULT 0,
    total_snaps INTEGER,
    avg_snap_pct REAL,

    -- Aggregated statistics as JSON
    stats JSON NOT NULL,

    -- Calculated fantasy totals
    fantasy_points_ppr REAL,
    fantasy_points_half REAL,
    fantasy_points_std REAL,
    fantasy_points_custom REAL,

    -- Per-game averages
    fantasy_ppg_ppr REAL,
    fantasy_ppg_half REAL,
    fantasy_ppg_std REAL,

    -- Advanced metrics
    metrics JSON,  -- WAR, z-scores, consistency, etc.

    -- Source tracking
    source TEXT NOT NULL DEFAULT 'computed',  -- 'computed' or original source
    computation_method TEXT,  -- How stats were aggregated

    -- Metadata
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Foreign key constraints
    FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE,

    -- Ensure one record per player/season/type/source
    UNIQUE(player_uid, season, season_type, source)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_season_stats_player ON player_season_stats(player_uid);
CREATE INDEX IF NOT EXISTS idx_season_stats_season ON player_season_stats(season);
CREATE INDEX IF NOT EXISTS idx_season_stats_position ON player_season_stats(position);
CREATE INDEX IF NOT EXISTS idx_season_stats_team ON player_season_stats(team);
CREATE INDEX IF NOT EXISTS idx_season_stats_fantasy ON player_season_stats(fantasy_points_ppr DESC);

-- ----------------------------------------------------------------------------
-- PLAYER_CAREER_STATS TABLE: Career-level aggregations
-- ----------------------------------------------------------------------------
-- Stores lifetime aggregated statistics for each player.
-- Updated incrementally as new seasons complete.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_career_stats (
    -- Player reference (single record per player)
    player_uid TEXT PRIMARY KEY,

    -- Career span
    first_season INTEGER,
    last_season INTEGER,
    seasons_played INTEGER DEFAULT 0,

    -- Position history
    primary_position TEXT,
    positions_played TEXT,  -- Comma-separated

    -- Team history
    teams_played_for TEXT,  -- Comma-separated in order
    current_team TEXT,

    -- Games summary
    games_played INTEGER DEFAULT 0,
    games_started INTEGER DEFAULT 0,

    -- Aggregated statistics as JSON
    stats JSON NOT NULL,

    -- Career fantasy totals
    fantasy_points_ppr REAL,
    fantasy_points_half REAL,
    fantasy_points_std REAL,
    fantasy_points_custom REAL,

    -- Career per-game averages
    fantasy_ppg_ppr REAL,
    fantasy_ppg_half REAL,
    fantasy_ppg_std REAL,

    -- Career advanced metrics
    metrics JSON,  -- Career WAR, peak seasons, etc.

    -- Source tracking
    source TEXT NOT NULL DEFAULT 'computed',
    computation_method TEXT,

    -- Metadata
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Foreign key constraints
    FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_career_stats_position ON player_career_stats(primary_position);
CREATE INDEX IF NOT EXISTS idx_career_stats_fantasy ON player_career_stats(fantasy_points_ppr DESC);
CREATE INDEX IF NOT EXISTS idx_career_stats_seasons ON player_career_stats(seasons_played DESC);

-- ----------------------------------------------------------------------------
-- STAT_CORRECTIONS TABLE: Track stat corrections/adjustments
-- ----------------------------------------------------------------------------
-- Audit trail for all stat corrections applied to the database.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stat_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- What was corrected
    player_uid TEXT NOT NULL,
    game_id TEXT,
    season INTEGER,

    -- Correction details
    stat_field TEXT NOT NULL,  -- Which stat was corrected
    old_value TEXT,
    new_value TEXT,
    correction_type TEXT CHECK(correction_type IN (
        'official',   -- NFL official correction
        'source',     -- Source data updated
        'manual',     -- Manual correction
        'computed'    -- Recomputation correction
    )),

    -- Source
    source TEXT,
    source_reference TEXT,  -- URL or reference to correction source

    -- Metadata
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    applied_by TEXT,  -- 'system', 'script:name', 'user:name'
    notes TEXT,

    FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES nfl_games(game_id) ON DELETE SET NULL
);

-- Index for finding corrections
CREATE INDEX IF NOT EXISTS idx_corrections_player ON stat_corrections(player_uid);
CREATE INDEX IF NOT EXISTS idx_corrections_game ON stat_corrections(game_id);
CREATE INDEX IF NOT EXISTS idx_corrections_date ON stat_corrections(applied_at);

-- ----------------------------------------------------------------------------
-- STATS_IMPORT_LOG TABLE: Track data imports
-- ----------------------------------------------------------------------------
-- Audit trail for all stats data imports.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stats_import_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Import details
    import_type TEXT NOT NULL CHECK(import_type IN (
        'weekly',     -- Weekly game stats
        'season',     -- Season aggregates
        'career',     -- Career aggregates
        'games',      -- Game schedule data
        'corrections' -- Stat corrections
    )),

    source TEXT NOT NULL,  -- nflverse, espn, sportradar, etc.
    season INTEGER,
    week INTEGER,

    -- Results
    records_processed INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,

    -- Timing
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    duration_seconds REAL,

    -- Error details
    errors_json TEXT,  -- JSON array of error details

    -- Metadata
    triggered_by TEXT,  -- 'script:name', 'cron', 'manual'
    notes TEXT
);

-- Index for finding recent imports
CREATE INDEX IF NOT EXISTS idx_import_log_type ON stats_import_log(import_type);
CREATE INDEX IF NOT EXISTS idx_import_log_source ON stats_import_log(source);
CREATE INDEX IF NOT EXISTS idx_import_log_season ON stats_import_log(season, week);
CREATE INDEX IF NOT EXISTS idx_import_log_date ON stats_import_log(started_at);

-- ----------------------------------------------------------------------------
-- TRIGGERS: Automatic data maintenance
-- ----------------------------------------------------------------------------

-- Update nfl_games.updated_at on change
CREATE TRIGGER IF NOT EXISTS trg_games_updated_at
AFTER UPDATE ON nfl_games
FOR EACH ROW
BEGIN
    UPDATE nfl_games SET updated_at = datetime('now') WHERE game_id = OLD.game_id;
END;

-- Update player_game_stats.updated_at on change
CREATE TRIGGER IF NOT EXISTS trg_game_stats_updated_at
AFTER UPDATE ON player_game_stats
FOR EACH ROW
BEGIN
    UPDATE player_game_stats SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Update player_season_stats.updated_at on change
CREATE TRIGGER IF NOT EXISTS trg_season_stats_updated_at
AFTER UPDATE ON player_season_stats
FOR EACH ROW
BEGIN
    UPDATE player_season_stats SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Update player_career_stats.updated_at on change
CREATE TRIGGER IF NOT EXISTS trg_career_stats_updated_at
AFTER UPDATE ON player_career_stats
FOR EACH ROW
BEGIN
    UPDATE player_career_stats SET updated_at = datetime('now') WHERE player_uid = OLD.player_uid;
END;

-- ----------------------------------------------------------------------------
-- VIEWS: Convenient data access patterns
-- ----------------------------------------------------------------------------

-- View: Current week player stats (excludes superseded corrections)
CREATE VIEW IF NOT EXISTS v_current_game_stats AS
SELECT
    pgs.*,
    p.canonical_name,
    g.game_date,
    g.home_team,
    g.away_team,
    g.home_score,
    g.away_score
FROM player_game_stats pgs
JOIN players p ON pgs.player_uid = p.player_uid
JOIN nfl_games g ON pgs.game_id = g.game_id
WHERE pgs.is_current = 1;

-- View: Season fantasy leaders
CREATE VIEW IF NOT EXISTS v_season_fantasy_leaders AS
SELECT
    pss.player_uid,
    p.canonical_name,
    pss.season,
    pss.position,
    pss.team,
    pss.games_played,
    pss.fantasy_points_ppr,
    pss.fantasy_ppg_ppr,
    RANK() OVER (PARTITION BY pss.season, pss.position ORDER BY pss.fantasy_points_ppr DESC) as position_rank,
    RANK() OVER (PARTITION BY pss.season ORDER BY pss.fantasy_points_ppr DESC) as overall_rank
FROM player_season_stats pss
JOIN players p ON pss.player_uid = p.player_uid
WHERE pss.season_type = 'REG'
  AND pss.source = 'computed'
ORDER BY pss.season DESC, pss.fantasy_points_ppr DESC;

-- View: Player weekly history
CREATE VIEW IF NOT EXISTS v_player_weekly_history AS
SELECT
    p.canonical_name,
    pgs.player_uid,
    pgs.season,
    pgs.week,
    pgs.team,
    pgs.opponent,
    pgs.is_home,
    pgs.position,
    pgs.fantasy_points_ppr,
    pgs.fantasy_points_half,
    pgs.fantasy_points_std,
    pgs.stats
FROM player_game_stats pgs
JOIN players p ON pgs.player_uid = p.player_uid
WHERE pgs.is_current = 1
ORDER BY pgs.player_uid, pgs.season, pgs.week;

-- View: Games with team performance summary
CREATE VIEW IF NOT EXISTS v_game_summary AS
SELECT
    g.game_id,
    g.season,
    g.week,
    g.game_date,
    g.home_team,
    g.away_team,
    g.home_score,
    g.away_score,
    g.status,
    (SELECT COUNT(DISTINCT player_uid)
     FROM player_game_stats pgs
     WHERE pgs.game_id = g.game_id AND pgs.is_current = 1) as players_recorded,
    (SELECT SUM(fantasy_points_ppr)
     FROM player_game_stats pgs
     WHERE pgs.game_id = g.game_id AND pgs.team = g.home_team AND pgs.is_current = 1) as home_fantasy_total,
    (SELECT SUM(fantasy_points_ppr)
     FROM player_game_stats pgs
     WHERE pgs.game_id = g.game_id AND pgs.team = g.away_team AND pgs.is_current = 1) as away_fantasy_total
FROM nfl_games g
ORDER BY g.season DESC, g.week DESC;

-- View: Recent imports summary
CREATE VIEW IF NOT EXISTS v_recent_imports AS
SELECT
    import_type,
    source,
    season,
    week,
    records_processed,
    records_inserted,
    records_updated,
    errors_count,
    started_at,
    duration_seconds
FROM stats_import_log
ORDER BY started_at DESC
LIMIT 100;

-- View: Stats coverage by season
CREATE VIEW IF NOT EXISTS v_stats_coverage AS
SELECT
    season,
    COUNT(DISTINCT game_id) as games_with_stats,
    COUNT(DISTINCT player_uid) as unique_players,
    COUNT(*) as total_stat_records,
    SUM(CASE WHEN source = 'nflverse' THEN 1 ELSE 0 END) as nflverse_records,
    SUM(CASE WHEN source = 'espn' THEN 1 ELSE 0 END) as espn_records,
    MIN(week) as first_week,
    MAX(week) as last_week
FROM player_game_stats
WHERE is_current = 1
GROUP BY season
ORDER BY season DESC;
