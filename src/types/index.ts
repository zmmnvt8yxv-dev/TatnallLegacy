/**
 * Shared TypeScript type definitions
 *
 * This file contains types that are used across the application.
 * Types derived from Zod schemas are exported from src/schemas/index.ts
 */

// Re-export all types from schemas for convenience
export type {
  NflTeam,
  Position,
  Manifest,
  ManifestPaths,
  Player,
  PlayerIdentifiers,
  PlayerId,
  PlayerSearchEntry,
  PlayerSearch,
  Team,
  Matchup,
  LineupEntry,
  WeeklyChunk,
  SeasonTeam,
  StandingsEntry,
  SeasonSummary,
  Transaction,
  Transactions,
  PlayerStatsRow,
  PlayerStats,
  PlayerMetricsRow,
  PlayerMetrics,
  AllTime,
  EspnNameMap,
  CoreData,
  LoosePlayer,
  LooseMatchup,
  ValidationResult,
  ValidationError,
} from "../schemas/index";

// =============================================================================
// PLAYER INDEX TYPES
// =============================================================================

/** Player lookup by various ID types */
export interface PlayerIndex {
  gsis_id: Map<string, Player>;
  sleeper_id: Map<string, Player>;
  espn_id: Map<string, Player>;
  player_id: Map<string, Player>;
}

/** Player lookup result with optional fields */
export interface PlayerLookupResult {
  sleeper_id?: string;
  player_id?: string;
  gsis_id?: string;
  espn_id?: string;
  name?: string;
  display_name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string;
  nfl_team?: string;
  headshot_url?: string;
  headshotUrl?: string;
  headshot?: string;
  player_uid?: string;
  [key: string]: unknown;
}

/** Player display information */
export interface PlayerDisplay {
  name: string;
  headshotUrl: string | null;
  position: string;
  team: string;
}

/** ID entry for player lookup */
export interface IdEntry {
  key: string;
  value: string | undefined | null;
}

// =============================================================================
// DATA CONTEXT TYPES
// =============================================================================

import type { Player, Manifest, Team, PlayerSearchEntry, PlayerId, EspnNameMap } from "../schemas/index";

/** Player ID lookup structure */
export interface PlayerIdLookup {
  bySleeper: Map<string, string>;
  byEspn: Map<string, string>;
  byUid: Map<string, Player>;
}

/** Data context value */
export interface DataContextValue {
  manifest: Manifest | undefined;
  players: Player[];
  playerIds: PlayerId[];
  teams: Team[];
  espnNameMap: EspnNameMap;
  playerSearch: PlayerSearchEntry[];
  playerIdLookup: PlayerIdLookup;
  playerIndex: PlayerIndex;
  loading: boolean;
  error: string;
}

// =============================================================================
// LOADER TYPES
// =============================================================================

/** Fetch options for JSON requests */
export interface FetchJsonOptions {
  optional?: boolean;
  retries?: number;
  retryDelay?: number;
}

/** Generic data with metadata */
export interface DataWithMeta<T> {
  data: T;
  __meta?: { path: string };
}

// =============================================================================
// OWNER TYPES
// =============================================================================

/** Owner input can be various types */
export type OwnerInput = string | {
  name?: string;
  nickname?: string;
  display_name?: string;
  team_name?: string;
  owner?: string;
} | null | undefined;

/** Roster entry for owner resolution */
export interface RosterEntry {
  owner_id?: string;
  ownerId?: string;
  user_id?: string;
  userId?: string;
  owner?: string;
  username?: string;
}

/** User entry for owner resolution */
export interface UserEntry {
  display_name?: string;
  username?: string;
  name?: string;
  email?: string;
}

/** Users by ID lookup */
export type UsersById = Map<string, UserEntry> | Record<string, UserEntry>;

// =============================================================================
// ROW TYPES (for data processing)
// =============================================================================

/** Generic row with player information */
export interface PlayerRow {
  sleeper_id?: string;
  gsis_id?: string;
  espn_id?: string;
  player_id?: string;
  display_name?: string;
  player_display_name?: string;
  player_name?: string;
  player?: string;
  name?: string;
  id?: string;
  id_type?: string;
  source?: string;
  source_player_id?: string;
  position?: string;
  nfl_team?: string;
  [key: string]: unknown;
}

// =============================================================================
// METRICS TYPES
// =============================================================================

/** Metrics summary data */
export interface MetricsSummary {
  generatedAt?: string;
  rows?: Array<{
    player_id?: string;
    player_uid?: string;
    player?: string;
    name?: string;
    season?: number;
    position?: string;
    war?: number | null;
    z_score?: number | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** NFL profile data */
export interface NflProfile {
  player_id?: string;
  name?: string;
  position?: string;
  team?: string;
  [key: string]: unknown;
}

/** NFL silo metadata */
export interface NflSiloMeta {
  [key: string]: unknown;
}
