-- ============================================================================
-- UNIFIED PLAYER IDENTITY SCHEMA
-- ============================================================================
-- This schema implements the "Golden Player Identity" layer of the unified
-- data silo architecture. It provides a single source of truth for player
-- identity resolution across multiple data sources (Sleeper, ESPN, NFLverse,
-- Sportradar, Yahoo, etc.)
--
-- Key features:
--   - UUID-based player_uid as primary key
--   - Multi-source identifier mapping with confidence scores
--   - Player aliases for name variations
--   - Name history tracking for trades/changes
--   - Comprehensive audit logging for debugging
--
-- Version: 1.0.0
-- Date: 2026-01-26
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- META TABLE: Schema versioning and metadata
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert schema version
INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_version', '1.0.0');
INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('created_at', datetime('now'));

-- ----------------------------------------------------------------------------
-- PLAYERS TABLE: Core player identity records
-- ----------------------------------------------------------------------------
-- This is the canonical source of truth for player identities.
-- Each record represents a unique real-world person who plays or has played
-- in the NFL and may appear in fantasy football leagues.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
    -- Primary identifier: UUID v4 format (36 chars with hyphens)
    -- Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    player_uid TEXT PRIMARY KEY CHECK(length(player_uid) = 36),

    -- Canonical name: The "official" name used for display
    -- This should be the most commonly used/recognized version
    canonical_name TEXT NOT NULL,

    -- Normalized name: Lowercase, no punctuation, for matching
    -- Generated automatically via trigger
    canonical_name_norm TEXT NOT NULL,

    -- Position groupings
    position TEXT CHECK(position IN (
        'QB', 'RB', 'WR', 'TE', 'K', 'DEF',  -- Fantasy-relevant
        'FB', 'OL', 'OT', 'OG', 'C',          -- Offensive line
        'DL', 'DE', 'DT', 'NT',               -- Defensive line
        'LB', 'ILB', 'OLB', 'MLB',            -- Linebackers
        'DB', 'CB', 'S', 'FS', 'SS',          -- Secondary
        'LS', 'P',                             -- Special teams
        NULL                                   -- Unknown/unspecified
    )),

    -- Biographical data
    birth_date TEXT,  -- ISO 8601 format: YYYY-MM-DD
    college TEXT,

    -- NFL career data
    nfl_debut_year INTEGER CHECK(nfl_debut_year >= 1920 AND nfl_debut_year <= 2100),
    nfl_final_year INTEGER CHECK(nfl_final_year >= 1920 AND nfl_final_year <= 2100),

    -- Physical attributes (optional)
    height_inches INTEGER CHECK(height_inches > 0 AND height_inches < 100),
    weight_lbs INTEGER CHECK(weight_lbs > 0 AND weight_lbs < 500),

    -- Current NFL team (NULL if retired/unsigned)
    -- Uses standard 2-3 character abbreviations (KC, SF, NE, JAX, etc.)
    current_nfl_team TEXT,

    -- Player status
    status TEXT DEFAULT 'active' CHECK(status IN (
        'active',     -- Currently on an NFL roster
        'practice',   -- Practice squad
        'injured',    -- IR or PUP
        'suspended',  -- League suspension
        'retired',    -- Officially retired
        'unsigned',   -- Not on a roster but not retired
        'unknown'     -- Status not determined
    )),

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Constraints
    CHECK(nfl_final_year IS NULL OR nfl_debut_year IS NULL OR nfl_final_year >= nfl_debut_year)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_players_canonical_name_norm ON players(canonical_name_norm);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_current_team ON players(current_nfl_team);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
CREATE INDEX IF NOT EXISTS idx_players_birth_date ON players(birth_date);
CREATE INDEX IF NOT EXISTS idx_players_debut_year ON players(nfl_debut_year);

-- Composite indexes for common combined queries
CREATE INDEX IF NOT EXISTS idx_players_pos_team ON players(position, current_nfl_team);
CREATE INDEX IF NOT EXISTS idx_players_name_dob ON players(canonical_name_norm, birth_date);

-- ----------------------------------------------------------------------------
-- PLAYER_IDENTIFIERS TABLE: External ID mappings with confidence
-- ----------------------------------------------------------------------------
-- Maps external platform IDs to our canonical player_uid.
-- Includes confidence scores and match method for quality tracking.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_identifiers (
    -- Auto-incrementing surrogate key for this mapping record
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Foreign key to players table
    player_uid TEXT NOT NULL,

    -- Source platform identifier
    -- Supported sources: sleeper, espn, gsis, sportradar, yahoo, pfr, rotowire
    source TEXT NOT NULL CHECK(source IN (
        'sleeper',      -- Sleeper.app player ID
        'espn',         -- ESPN player ID
        'gsis',         -- NFL Game Statistics & Information System ID
        'sportradar',   -- Sportradar player UUID
        'yahoo',        -- Yahoo Fantasy player ID
        'pfr',          -- Pro Football Reference player ID
        'rotowire',     -- Rotowire player ID
        'nflverse',     -- NFLverse player ID (usually same as gsis)
        'fantasy_data', -- FantasyData player ID
        'cbs',          -- CBS Sports player ID
        'fleaflicker',  -- Fleaflicker player ID
        'mfl'           -- MyFantasyLeague player ID
    )),

    -- The external ID value from that source
    external_id TEXT NOT NULL,

    -- Match confidence score (0.0 to 1.0)
    -- 1.0 = Perfect match (exact ID from authoritative source)
    -- 0.95+ = High confidence (exact name + DOB match)
    -- 0.85-0.95 = Medium confidence (fuzzy name + DOB match)
    -- 0.70-0.85 = Low confidence (fuzzy name only)
    -- < 0.70 = Very low confidence (manual review recommended)
    confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence >= 0.0 AND confidence <= 1.0),

    -- Method used to establish this mapping
    match_method TEXT NOT NULL DEFAULT 'exact' CHECK(match_method IN (
        'exact',        -- Direct ID mapping from authoritative source
        'crosswalk',    -- Mapped via another trusted source's crosswalk
        'name_dob',     -- Matched on normalized name + date of birth
        'name_only',    -- Matched on normalized name only (less reliable)
        'fuzzy',        -- Fuzzy string matching algorithm
        'manual',       -- Manually verified and assigned
        'inferred'      -- Inferred from context (e.g., roster position)
    )),

    -- Verification tracking
    verified_at TEXT,  -- When this mapping was last verified
    verified_by TEXT,  -- Who/what verified it ('system', 'user:name', 'script:name')

    -- For tracking match quality over time
    last_seen_at TEXT,  -- Last time this ID was encountered in source data
    match_attempts INTEGER DEFAULT 1,  -- Number of times we've tried to match

    -- Optional notes for debugging
    notes TEXT,

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Constraints
    FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE,

    -- Each source+external_id combination should map to exactly one player
    UNIQUE (source, external_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_identifiers_player_uid ON player_identifiers(player_uid);
CREATE INDEX IF NOT EXISTS idx_identifiers_source ON player_identifiers(source);
CREATE INDEX IF NOT EXISTS idx_identifiers_external_id ON player_identifiers(external_id);
CREATE INDEX IF NOT EXISTS idx_identifiers_confidence ON player_identifiers(confidence);
CREATE INDEX IF NOT EXISTS idx_identifiers_method ON player_identifiers(match_method);
CREATE INDEX IF NOT EXISTS idx_identifiers_verified ON player_identifiers(verified_at);

-- Composite index for common lookup pattern
CREATE INDEX IF NOT EXISTS idx_identifiers_source_ext ON player_identifiers(source, external_id);

-- ----------------------------------------------------------------------------
-- PLAYER_ALIASES TABLE: Name variations
-- ----------------------------------------------------------------------------
-- Stores alternative names/spellings for players to improve matching.
-- Examples: "Pat Mahomes" for "Patrick Mahomes", "AJ Brown" for "A.J. Brown"
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_aliases (
    -- Auto-incrementing surrogate key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Foreign key to players table
    player_uid TEXT NOT NULL,

    -- The alias (alternative name)
    alias TEXT NOT NULL,

    -- Normalized version for matching
    alias_norm TEXT NOT NULL,

    -- Where this alias was observed
    source TEXT,  -- 'sleeper', 'espn', 'manual', etc.

    -- Alias type for categorization
    alias_type TEXT DEFAULT 'variation' CHECK(alias_type IN (
        'variation',    -- Common variation (Pat vs Patrick)
        'nickname',     -- Nickname (The Freezer)
        'maiden',       -- Maiden name (if applicable)
        'misspelling',  -- Common misspelling
        'abbreviation', -- Abbreviated form (T.J. vs TJ)
        'legal',        -- Legal name if different from display
        'broadcast'     -- Name used in broadcasts
    )),

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Constraints
    FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE
);

-- Indexes for alias lookups
CREATE INDEX IF NOT EXISTS idx_aliases_player_uid ON player_aliases(player_uid);
CREATE INDEX IF NOT EXISTS idx_aliases_alias_norm ON player_aliases(alias_norm);
CREATE INDEX IF NOT EXISTS idx_aliases_source ON player_aliases(source);

-- Unique constraint: same player shouldn't have duplicate aliases
CREATE UNIQUE INDEX IF NOT EXISTS uq_aliases_player_alias ON player_aliases(player_uid, alias_norm);

-- ----------------------------------------------------------------------------
-- PLAYER_NAME_HISTORY TABLE: Historical name tracking
-- ----------------------------------------------------------------------------
-- Tracks name changes over time (legal name changes, trade-related changes,
-- or corrections to database records).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_name_history (
    -- Auto-incrementing surrogate key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Foreign key to players table
    player_uid TEXT NOT NULL,

    -- The name during this period
    name TEXT NOT NULL,

    -- Normalized version
    name_norm TEXT NOT NULL,

    -- When this name was in use
    start_date TEXT,  -- ISO 8601 format: YYYY-MM-DD (NULL = unknown start)
    end_date TEXT,    -- ISO 8601 format: YYYY-MM-DD (NULL = still current)

    -- Reason for the name record
    reason TEXT CHECK(reason IN (
        'initial',      -- First recorded name
        'legal_change', -- Legal name change
        'correction',   -- Database correction
        'marriage',     -- Name change due to marriage
        'preference',   -- Player preference change
        'other'         -- Other reason
    )),

    -- Optional notes
    notes TEXT,

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Constraints
    FOREIGN KEY (player_uid) REFERENCES players(player_uid) ON DELETE CASCADE,
    CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- Indexes for name history queries
CREATE INDEX IF NOT EXISTS idx_name_history_player_uid ON player_name_history(player_uid);
CREATE INDEX IF NOT EXISTS idx_name_history_name_norm ON player_name_history(name_norm);
CREATE INDEX IF NOT EXISTS idx_name_history_dates ON player_name_history(start_date, end_date);

-- ----------------------------------------------------------------------------
-- MATCH_AUDIT_LOG TABLE: Debug logging for ID resolution
-- ----------------------------------------------------------------------------
-- Comprehensive audit trail for all identity resolution decisions.
-- Essential for debugging matching issues and tracking data quality.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_audit_log (
    -- Auto-incrementing log entry ID
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- When this event occurred
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),

    -- Session/batch identifier for grouping related events
    session_id TEXT,

    -- Type of action being logged
    action TEXT NOT NULL CHECK(action IN (
        'create_player',     -- New player record created
        'update_player',     -- Player record updated
        'delete_player',     -- Player record deleted
        'merge_players',     -- Two player records merged
        'split_player',      -- Player record split into two
        'add_identifier',    -- New external ID added
        'update_identifier', -- External ID mapping updated
        'remove_identifier', -- External ID mapping removed
        'add_alias',         -- New alias added
        'match_attempt',     -- Attempted to match an external ID
        'match_success',     -- Successfully matched external ID
        'match_failure',     -- Failed to match external ID
        'match_conflict',    -- Multiple potential matches found
        'manual_override',   -- Manual intervention applied
        'verification',      -- Identity verified
        'import_batch',      -- Bulk import operation
        'quality_check'      -- Data quality check performed
    )),

    -- Reference to the player(s) involved (may be NULL for match_failure)
    player_uid TEXT,
    secondary_player_uid TEXT,  -- For merge/split operations

    -- Source and ID being processed
    source TEXT,
    external_id TEXT,

    -- Match quality information
    confidence REAL,
    match_method TEXT,

    -- For match attempts: candidate info
    candidate_count INTEGER,  -- Number of potential matches found
    best_score REAL,          -- Best match score
    runner_up_score REAL,     -- Second-best score (for margin calculation)

    -- Detailed context as JSON
    -- May include: input data, match candidates, scoring details, etc.
    context_json TEXT,

    -- Result/outcome description
    result TEXT,

    -- Error information if applicable
    error_message TEXT,
    error_code TEXT,

    -- Who/what triggered this event
    triggered_by TEXT,  -- 'system', 'user:name', 'script:name', 'cron'

    -- Processing time in milliseconds (for performance tracking)
    duration_ms INTEGER
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON match_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_session ON match_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON match_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_player ON match_audit_log(player_uid);
CREATE INDEX IF NOT EXISTS idx_audit_source_ext ON match_audit_log(source, external_id);
CREATE INDEX IF NOT EXISTS idx_audit_confidence ON match_audit_log(confidence);
CREATE INDEX IF NOT EXISTS idx_audit_triggered_by ON match_audit_log(triggered_by);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_action_time ON match_audit_log(action, timestamp);

-- ----------------------------------------------------------------------------
-- ID_RESOLUTION_QUEUE TABLE: Pending matches needing review
-- ----------------------------------------------------------------------------
-- Queue of external IDs that couldn't be confidently matched and need
-- manual review or additional processing.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS id_resolution_queue (
    -- Auto-incrementing queue entry ID
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- External identifier to resolve
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,

    -- Data from the source that may help with matching
    source_name TEXT,
    source_name_norm TEXT,
    source_position TEXT,
    source_team TEXT,
    source_dob TEXT,
    source_college TEXT,
    source_data_json TEXT,  -- Full source record as JSON

    -- Current best match candidate (if any)
    best_candidate_uid TEXT,
    best_candidate_score REAL,

    -- All candidates as JSON array
    candidates_json TEXT,

    -- Queue status
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'pending',      -- Awaiting review
        'in_progress',  -- Being reviewed
        'resolved',     -- Successfully resolved
        'rejected',     -- Determined to not be a real match
        'deferred',     -- Deferred for later processing
        'error'         -- Error during processing
    )),

    -- Priority (higher = more urgent)
    priority INTEGER DEFAULT 0,

    -- Assignment
    assigned_to TEXT,

    -- Resolution details
    resolution_uid TEXT,  -- player_uid if resolved
    resolution_method TEXT,
    resolution_notes TEXT,
    resolved_at TEXT,
    resolved_by TEXT,

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Constraints
    FOREIGN KEY (best_candidate_uid) REFERENCES players(player_uid) ON DELETE SET NULL,
    FOREIGN KEY (resolution_uid) REFERENCES players(player_uid) ON DELETE SET NULL
);

-- Indexes for queue management
CREATE INDEX IF NOT EXISTS idx_queue_status ON id_resolution_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON id_resolution_queue(priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_queue_source ON id_resolution_queue(source, external_id);
CREATE INDEX IF NOT EXISTS idx_queue_assigned ON id_resolution_queue(assigned_to);
CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_source_ext ON id_resolution_queue(source, external_id) WHERE status != 'resolved';

-- ----------------------------------------------------------------------------
-- TRIGGERS: Automatic data maintenance
-- ----------------------------------------------------------------------------

-- Update players.updated_at on any change
CREATE TRIGGER IF NOT EXISTS trg_players_updated_at
AFTER UPDATE ON players
FOR EACH ROW
BEGIN
    UPDATE players SET updated_at = datetime('now') WHERE player_uid = OLD.player_uid;
END;

-- Update player_identifiers.updated_at on any change
CREATE TRIGGER IF NOT EXISTS trg_identifiers_updated_at
AFTER UPDATE ON player_identifiers
FOR EACH ROW
BEGIN
    UPDATE player_identifiers SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- Update id_resolution_queue.updated_at on any change
CREATE TRIGGER IF NOT EXISTS trg_queue_updated_at
AFTER UPDATE ON id_resolution_queue
FOR EACH ROW
BEGIN
    UPDATE id_resolution_queue SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- ----------------------------------------------------------------------------
-- VIEWS: Convenient data access patterns
-- ----------------------------------------------------------------------------

-- View: All player identifiers flattened
CREATE VIEW IF NOT EXISTS v_player_all_ids AS
SELECT
    p.player_uid,
    p.canonical_name,
    p.position,
    p.current_nfl_team,
    p.birth_date,
    pi.source,
    pi.external_id,
    pi.confidence,
    pi.match_method,
    pi.verified_at
FROM players p
LEFT JOIN player_identifiers pi ON p.player_uid = pi.player_uid
ORDER BY p.canonical_name, pi.source;

-- View: Players with all their identifiers as JSON
CREATE VIEW IF NOT EXISTS v_player_identity_summary AS
SELECT
    p.player_uid,
    p.canonical_name,
    p.position,
    p.current_nfl_team,
    p.birth_date,
    p.status,
    (
        SELECT json_group_object(pi.source, pi.external_id)
        FROM player_identifiers pi
        WHERE pi.player_uid = p.player_uid
    ) AS identifiers_json,
    (
        SELECT MIN(pi.confidence)
        FROM player_identifiers pi
        WHERE pi.player_uid = p.player_uid
    ) AS min_confidence,
    (
        SELECT COUNT(*)
        FROM player_identifiers pi
        WHERE pi.player_uid = p.player_uid
    ) AS identifier_count
FROM players p;

-- View: Low confidence matches needing review
CREATE VIEW IF NOT EXISTS v_low_confidence_matches AS
SELECT
    p.player_uid,
    p.canonical_name,
    p.position,
    pi.source,
    pi.external_id,
    pi.confidence,
    pi.match_method,
    pi.verified_at,
    pi.notes
FROM players p
JOIN player_identifiers pi ON p.player_uid = pi.player_uid
WHERE pi.confidence < 0.85
ORDER BY pi.confidence ASC, p.canonical_name;

-- View: Players missing expected identifiers
CREATE VIEW IF NOT EXISTS v_missing_identifiers AS
SELECT
    p.player_uid,
    p.canonical_name,
    p.position,
    p.current_nfl_team,
    CASE WHEN MAX(CASE WHEN pi.source = 'sleeper' THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END AS missing_sleeper,
    CASE WHEN MAX(CASE WHEN pi.source = 'espn' THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END AS missing_espn,
    CASE WHEN MAX(CASE WHEN pi.source = 'gsis' THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END AS missing_gsis
FROM players p
LEFT JOIN player_identifiers pi ON p.player_uid = pi.player_uid
WHERE p.status = 'active'
GROUP BY p.player_uid
HAVING missing_sleeper = 1 OR missing_espn = 1 OR missing_gsis = 1;

-- View: Recent audit activity
CREATE VIEW IF NOT EXISTS v_recent_audit AS
SELECT *
FROM match_audit_log
WHERE timestamp >= datetime('now', '-7 days')
ORDER BY timestamp DESC
LIMIT 1000;

-- View: Match success rate by source
CREATE VIEW IF NOT EXISTS v_match_stats_by_source AS
SELECT
    source,
    COUNT(*) AS total_attempts,
    SUM(CASE WHEN action = 'match_success' THEN 1 ELSE 0 END) AS successes,
    SUM(CASE WHEN action = 'match_failure' THEN 1 ELSE 0 END) AS failures,
    ROUND(
        100.0 * SUM(CASE WHEN action = 'match_success' THEN 1 ELSE 0 END) / COUNT(*),
        2
    ) AS success_rate_pct,
    ROUND(AVG(confidence), 3) AS avg_confidence
FROM match_audit_log
WHERE action IN ('match_success', 'match_failure')
GROUP BY source
ORDER BY total_attempts DESC;
