-- ============================================================================
-- UNIFIED LEAGUE DATA SCHEMA
-- ============================================================================
-- This schema implements Layer 4 (League-Specific Data) of the unified data
-- silo architecture. It provides normalized storage for transactions, lineups,
-- and matchups from multiple fantasy platforms (ESPN, Sleeper).
--
-- Key features:
--   - All player references use player_uid from the identity database
--   - Source tracking for audit and provenance
--   - Support for trade grouping and transaction history
--   - Lineup data with consistent position slot naming
--   - Matchup history with head-to-head records
--
-- Depends on: schema.sql (players table), stats_schema.sql (nfl_games)
--
-- Version: 1.0.0
-- Date: 2026-01-26
-- ============================================================================

PRAGMA foreign_keys = ON;

-- Update schema version
INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('league_schema_version', '1.0.0');
INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('league_schema_created_at', datetime('now'));

-- ----------------------------------------------------------------------------
-- FANTASY_TEAMS TABLE: Fantasy team reference data
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fantasy_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Team identification
    team_id TEXT NOT NULL,  -- Platform-specific team/roster ID
    season INTEGER NOT NULL,

    -- Team info
    team_name TEXT NOT NULL,
    owner_name TEXT,
    owner_id TEXT,  -- Platform owner ID

    -- Source tracking
    source TEXT NOT NULL CHECK(source IN ('espn', 'sleeper')),
    source_league_id TEXT,

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(source, season, team_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_teams_season ON fantasy_teams(season);
CREATE INDEX IF NOT EXISTS idx_fantasy_teams_source ON fantasy_teams(source);
CREATE INDEX IF NOT EXISTS idx_fantasy_teams_owner ON fantasy_teams(owner_name);

-- ----------------------------------------------------------------------------
-- UNIFIED_TRANSACTIONS TABLE: Normalized transaction records
-- ----------------------------------------------------------------------------
-- Stores all transaction types (add, drop, trade, waiver) from all platforms
-- with normalized structure and player_uid references.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unified_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Transaction identification
    transaction_id TEXT NOT NULL,  -- Original transaction ID from source

    -- Context
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,

    -- Transaction type (normalized across platforms)
    transaction_type TEXT NOT NULL CHECK(transaction_type IN (
        'add',        -- Free agent add
        'drop',       -- Player drop
        'waiver',     -- Waiver claim (add + optional drop)
        'trade',      -- Trade between teams
        'trade_add',  -- Player received in trade (individual record)
        'trade_drop', -- Player sent in trade (individual record)
        'ir',         -- Move to/from IR
        'taxi',       -- Move to/from taxi squad (dynasty)
        'commissioner' -- Commissioner action
    )),

    -- Transaction status
    status TEXT NOT NULL DEFAULT 'complete' CHECK(status IN (
        'complete',   -- Successfully processed
        'failed',     -- Failed (e.g., waiver claim lost)
        'vetoed',     -- Vetoed by league
        'pending',    -- Awaiting processing
        'cancelled'   -- Cancelled before completion
    )),

    -- Team involved
    team_id TEXT NOT NULL,  -- Fantasy team ID
    team_name TEXT,

    -- Player involved (unified)
    player_uid TEXT,  -- FK to players table (may be NULL if unresolved)

    -- Action (what happened to the player for this team)
    action TEXT NOT NULL CHECK(action IN (
        'added',      -- Player added to roster
        'dropped'     -- Player dropped from roster
    )),

    -- Trade grouping (for multi-party trades)
    trade_group_id TEXT,  -- Groups all parts of the same trade
    trade_partner_team_id TEXT,  -- Other team in trade

    -- Waiver details
    waiver_bid INTEGER,  -- FAAB bid amount
    waiver_priority INTEGER,  -- Waiver priority/order

    -- Draft pick movements (for dynasty trades)
    draft_picks_json TEXT,  -- JSON array of draft picks involved

    -- Timestamps
    transaction_timestamp INTEGER,  -- Unix timestamp from source
    processed_at TEXT,  -- When the transaction was processed

    -- Source tracking and audit
    source TEXT NOT NULL CHECK(source IN ('espn', 'sleeper')),
    source_league_id TEXT,
    source_transaction_id TEXT,  -- Original ID from source
    source_data_json TEXT,  -- Original source record for audit

    -- Resolution tracking
    source_player_id TEXT,  -- Original player ID before resolution
    resolution_confidence REAL,  -- Confidence of player_uid match
    resolution_method TEXT,  -- How player was resolved

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_transactions_season_week ON unified_transactions(season, week);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON unified_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_team ON unified_transactions(team_id);
CREATE INDEX IF NOT EXISTS idx_transactions_player ON unified_transactions(player_uid);
CREATE INDEX IF NOT EXISTS idx_transactions_trade_group ON unified_transactions(trade_group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON unified_transactions(source);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON unified_transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON unified_transactions(transaction_timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_source_id
    ON unified_transactions(source, source_transaction_id, team_id, player_uid);

-- ----------------------------------------------------------------------------
-- UNIFIED_LINEUPS TABLE: Normalized lineup records
-- ----------------------------------------------------------------------------
-- Stores weekly lineup data with consistent position slots across platforms.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unified_lineups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Context
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,

    -- Team
    team_id TEXT NOT NULL,  -- Fantasy team ID
    team_name TEXT,
    matchup_id INTEGER,  -- Links to unified_matchups

    -- Player (unified)
    player_uid TEXT,  -- FK to players table

    -- Position information
    slot TEXT NOT NULL,  -- Normalized slot: QB, RB1, RB2, WR1, WR2, TE, FLEX, K, DEF, BN1-BN6, IR
    slot_index INTEGER,  -- Order within slot type (e.g., BN position 1, 2, 3)
    is_starter INTEGER NOT NULL DEFAULT 0,  -- 1 if in starting lineup

    -- Points
    points_actual REAL,  -- Actual points scored
    points_projected REAL,  -- Projected points (if available)

    -- Source tracking
    source TEXT NOT NULL CHECK(source IN ('espn', 'sleeper')),
    source_player_id TEXT,  -- Original player ID
    source_slot_id TEXT,  -- Original slot ID from platform

    -- Resolution tracking
    resolution_confidence REAL,
    resolution_method TEXT,

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Ensure one entry per player per team per week
    UNIQUE(source, season, week, team_id, player_uid)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_lineups_season_week ON unified_lineups(season, week);
CREATE INDEX IF NOT EXISTS idx_lineups_team ON unified_lineups(team_id);
CREATE INDEX IF NOT EXISTS idx_lineups_player ON unified_lineups(player_uid);
CREATE INDEX IF NOT EXISTS idx_lineups_starter ON unified_lineups(is_starter);
CREATE INDEX IF NOT EXISTS idx_lineups_source ON unified_lineups(source);
CREATE INDEX IF NOT EXISTS idx_lineups_matchup ON unified_lineups(matchup_id);

-- ----------------------------------------------------------------------------
-- UNIFIED_MATCHUPS TABLE: Fantasy matchup records
-- ----------------------------------------------------------------------------
-- Stores weekly matchup results between fantasy teams.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unified_matchups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Context
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,

    -- Matchup type
    matchup_type TEXT NOT NULL DEFAULT 'regular' CHECK(matchup_type IN (
        'regular',    -- Regular season
        'playoff',    -- Playoff game
        'consolation', -- Consolation bracket
        'championship', -- Championship game
        'toilet_bowl'  -- Last place game
    )),

    -- Teams
    home_team_id TEXT NOT NULL,
    home_team_name TEXT,
    away_team_id TEXT NOT NULL,
    away_team_name TEXT,

    -- Scores
    home_score REAL,
    away_score REAL,

    -- Margin and result
    margin REAL,  -- home_score - away_score (positive = home win)
    winner_team_id TEXT,

    -- NFL context (linked to nfl_games for context)
    nfl_week_info TEXT,  -- JSON with bye weeks, notable games, etc.

    -- Playoff implications
    playoff_seed_home INTEGER,
    playoff_seed_away INTEGER,
    elimination_game INTEGER DEFAULT 0,  -- 1 if loser is eliminated

    -- Source tracking
    source TEXT NOT NULL CHECK(source IN ('espn', 'sleeper', 'manual')),
    source_matchup_id TEXT,

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(source, season, week, home_team_id, away_team_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_matchups_season_week ON unified_matchups(season, week);
CREATE INDEX IF NOT EXISTS idx_matchups_home_team ON unified_matchups(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matchups_away_team ON unified_matchups(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matchups_type ON unified_matchups(matchup_type);
CREATE INDEX IF NOT EXISTS idx_matchups_winner ON unified_matchups(winner_team_id);

-- ----------------------------------------------------------------------------
-- HEAD_TO_HEAD TABLE: Historical head-to-head records
-- ----------------------------------------------------------------------------
-- Pre-computed head-to-head records between teams for quick lookup.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS head_to_head (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Teams (ordered alphabetically by team_id to avoid duplicates)
    team_a_id TEXT NOT NULL,
    team_a_name TEXT,
    team_b_id TEXT NOT NULL,
    team_b_name TEXT,

    -- Record
    team_a_wins INTEGER NOT NULL DEFAULT 0,
    team_b_wins INTEGER NOT NULL DEFAULT 0,
    ties INTEGER NOT NULL DEFAULT 0,

    -- Points
    team_a_total_points REAL DEFAULT 0,
    team_b_total_points REAL DEFAULT 0,
    team_a_avg_points REAL,
    team_b_avg_points REAL,

    -- Streaks
    current_streak_team TEXT,  -- Which team has current streak
    current_streak_count INTEGER DEFAULT 0,
    longest_streak_team TEXT,
    longest_streak_count INTEGER DEFAULT 0,

    -- Context
    first_matchup_season INTEGER,
    last_matchup_season INTEGER,
    total_matchups INTEGER DEFAULT 0,

    -- Matchup details (JSON array of individual matchups)
    matchups_json TEXT,

    -- Metadata
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(team_a_id, team_b_id)
);

CREATE INDEX IF NOT EXISTS idx_h2h_team_a ON head_to_head(team_a_id);
CREATE INDEX IF NOT EXISTS idx_h2h_team_b ON head_to_head(team_b_id);

-- ----------------------------------------------------------------------------
-- SEASON_STANDINGS TABLE: End-of-season standings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS season_standings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    season INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    team_name TEXT,
    owner_name TEXT,

    -- Regular season record
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    ties INTEGER NOT NULL DEFAULT 0,

    -- Points
    points_for REAL DEFAULT 0,
    points_against REAL DEFAULT 0,
    points_diff REAL,  -- points_for - points_against

    -- Rankings
    regular_season_rank INTEGER,
    final_rank INTEGER,
    playoff_seed INTEGER,

    -- Achievements
    made_playoffs INTEGER DEFAULT 0,
    won_championship INTEGER DEFAULT 0,

    -- Source tracking
    source TEXT NOT NULL CHECK(source IN ('espn', 'sleeper', 'manual')),

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(source, season, team_id)
);

CREATE INDEX IF NOT EXISTS idx_standings_season ON season_standings(season);
CREATE INDEX IF NOT EXISTS idx_standings_team ON season_standings(team_id);
CREATE INDEX IF NOT EXISTS idx_standings_rank ON season_standings(final_rank);

-- ----------------------------------------------------------------------------
-- TRANSACTION_IMPORT_LOG TABLE: Track transaction imports
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_import_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    source TEXT NOT NULL,
    season INTEGER NOT NULL,

    -- Results
    transactions_processed INTEGER DEFAULT 0,
    transactions_inserted INTEGER DEFAULT 0,
    transactions_updated INTEGER DEFAULT 0,
    transactions_skipped INTEGER DEFAULT 0,
    players_resolved INTEGER DEFAULT 0,
    players_unresolved INTEGER DEFAULT 0,

    -- Timing
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    duration_seconds REAL,

    -- Error tracking
    errors_count INTEGER DEFAULT 0,
    errors_json TEXT,

    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_tx_import_source ON transaction_import_log(source);
CREATE INDEX IF NOT EXISTS idx_tx_import_season ON transaction_import_log(season);

-- ----------------------------------------------------------------------------
-- TRIGGERS: Automatic data maintenance
-- ----------------------------------------------------------------------------

-- Update unified_transactions.updated_at on change
CREATE TRIGGER IF NOT EXISTS trg_transactions_updated_at
AFTER UPDATE ON unified_transactions
FOR EACH ROW
BEGIN
    UPDATE unified_transactions SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Update head_to_head.updated_at on change
CREATE TRIGGER IF NOT EXISTS trg_h2h_updated_at
AFTER UPDATE ON head_to_head
FOR EACH ROW
BEGIN
    UPDATE head_to_head SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- ----------------------------------------------------------------------------
-- VIEWS: Convenient data access patterns
-- ----------------------------------------------------------------------------

-- View: Transaction summary by season
CREATE VIEW IF NOT EXISTS v_transaction_summary AS
SELECT
    season,
    source,
    transaction_type,
    status,
    COUNT(*) as count
FROM unified_transactions
GROUP BY season, source, transaction_type, status
ORDER BY season DESC, source, transaction_type;

-- View: Recent trades with player names
CREATE VIEW IF NOT EXISTS v_recent_trades AS
SELECT
    ut.season,
    ut.week,
    ut.team_name,
    ut.action,
    p.canonical_name as player_name,
    ut.trade_partner_team_id,
    ut.transaction_timestamp,
    ut.source
FROM unified_transactions ut
LEFT JOIN players p ON ut.player_uid = p.player_uid
WHERE ut.transaction_type IN ('trade', 'trade_add', 'trade_drop')
ORDER BY ut.transaction_timestamp DESC
LIMIT 100;

-- View: Team lineup performance by week
CREATE VIEW IF NOT EXISTS v_team_weekly_performance AS
SELECT
    ul.season,
    ul.week,
    ul.team_name,
    SUM(CASE WHEN ul.is_starter = 1 THEN ul.points_actual ELSE 0 END) as starter_points,
    SUM(CASE WHEN ul.is_starter = 0 THEN ul.points_actual ELSE 0 END) as bench_points,
    COUNT(CASE WHEN ul.is_starter = 1 THEN 1 END) as starter_count,
    COUNT(CASE WHEN ul.is_starter = 0 THEN 1 END) as bench_count
FROM unified_lineups ul
GROUP BY ul.season, ul.week, ul.team_id
ORDER BY ul.season DESC, ul.week DESC;

-- View: Head-to-head leaderboard
CREATE VIEW IF NOT EXISTS v_h2h_leaderboard AS
SELECT
    team_a_name,
    team_b_name,
    team_a_wins,
    team_b_wins,
    ties,
    total_matchups,
    ROUND(team_a_avg_points, 2) as team_a_avg,
    ROUND(team_b_avg_points, 2) as team_b_avg,
    current_streak_team,
    current_streak_count
FROM head_to_head
ORDER BY total_matchups DESC;

-- View: Season champions
CREATE VIEW IF NOT EXISTS v_season_champions AS
SELECT
    season,
    team_name,
    owner_name,
    wins,
    losses,
    points_for,
    source
FROM season_standings
WHERE won_championship = 1
ORDER BY season DESC;
