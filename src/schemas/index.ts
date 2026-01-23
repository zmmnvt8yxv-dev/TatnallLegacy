/**
 * Zod schemas for runtime data validation
 *
 * These schemas validate JSON data loaded from the public/data/ directory.
 * They help catch data integrity issues early and provide meaningful error messages.
 */
import { z, type ZodSchema, type ZodError } from "zod";

// =============================================================================
// SHARED/PRIMITIVE SCHEMAS
// =============================================================================

/** NFL team abbreviations */
export const NflTeamSchema = z.string().max(4);

/** Player position codes */
export const PositionSchema = z.string();

/** Nullable string (many fields can be null or empty) */
const nullableString = z.string().nullable().optional();

/** Nullable number */
const nullableNumber = z.number().nullable().optional();

// =============================================================================
// MANIFEST SCHEMA
// =============================================================================

/** Season counts (matchups/lineups per season) */
const SeasonCountSchema = z.object({
  matchups: z.number(),
  lineups: z.number(),
});

/** Weekly counts (matchups/lineups per week) */
const WeeklyCountSchema = z.record(z.string(), SeasonCountSchema);

/** Manifest paths configuration */
const ManifestPathsSchema = z.object({
  players: z.string().optional(),
  playerIds: z.string().optional(),
  teams: z.string().optional(),
  seasonSummary: z.string().optional(),
  weeklyChunk: z.string().optional(),
  transactions: z.string().optional(),
  allTime: z.string().optional(),
  espnNameMap: z.string().optional(),
  playerSearch: z.string().optional(),
  playerStatsWeekly: z.string().optional(),
  playerStatsFull: z.string().optional(),
  playerStatsSeason: z.string().optional(),
  playerStatsCareer: z.string().optional(),
  metricsSummary: z.string().optional(),
  playerMetricsWeekly: z.string().optional(),
  playerMetricsSeason: z.string().optional(),
  playerMetricsCareer: z.string().optional(),
  playerMetricsBoomBust: z.string().optional(),
}).passthrough(); // Allow additional paths

/** Main manifest schema */
export const ManifestSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  seasons: z.array(z.number()),
  weeksBySeason: z.record(z.string(), z.array(z.number())),
  paths: ManifestPathsSchema,
  counts: z.object({
    seasonSummary: z.record(z.string(), SeasonCountSchema).optional(),
    weekly: z.record(z.string(), WeeklyCountSchema).optional(),
  }).passthrough().optional(),
});

// =============================================================================
// PLAYER SCHEMAS
// =============================================================================

/** Player identifiers (sleeper_id, espn_id, gsis_id) */
const PlayerIdentifiersSchema = z.object({
  sleeper_id: nullableString,
  espn_id: nullableString,
  gsis_id: nullableString,
}).passthrough();

/** Individual player from players.json */
export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: PositionSchema,
  team: z.string(),
  identifiers: PlayerIdentifiersSchema.optional(),
  height: nullableString,
  weight: nullableString,
  college: nullableString,
  age: z.union([z.string(), z.number()]).nullable().optional(),
  years_exp: z.union([z.string(), z.number()]).nullable().optional(),
  birth_date: nullableString,
}).passthrough();

/** Players array schema */
export const PlayersArraySchema = z.array(PlayerSchema);

/** Player ID mapping entry from player_ids.json */
export const PlayerIdSchema = z.object({
  player_uid: z.string(),
  id_type: z.string(),
  id_value: z.string(),
});

/** Player IDs array schema */
export const PlayerIdsArraySchema = z.array(PlayerIdSchema);

/** Player search entry */
export const PlayerSearchEntrySchema = z.object({
  id: z.string(),
  id_type: z.string().optional(),
  name: z.string(),
  position: PositionSchema.optional(),
  team: z.string().optional(),
});

/** Player search data (with rows wrapper) */
export const PlayerSearchSchema = z.object({
  generatedAt: z.string().optional(),
  rows: z.array(PlayerSearchEntrySchema),
});

// =============================================================================
// TEAM SCHEMAS
// =============================================================================

/** Team entry from teams.json */
export const TeamSchema = z.object({
  team_key: z.string(),
  platform: z.string(),
  league_id: z.string(),
  season: z.number(),
  team_id: z.string().optional(),
  roster_id: z.string().optional(),
  owner_user_id: z.string().optional(),
  display_name: z.string(),
}).passthrough();

/** Teams array schema */
export const TeamsArraySchema = z.array(TeamSchema);

// =============================================================================
// MATCHUP & LINEUP SCHEMAS
// =============================================================================

/** Individual matchup */
export const MatchupSchema = z.object({
  week: z.number(),
  home_team: z.string(),
  home_score: z.number(),
  away_team: z.string(),
  away_score: z.number(),
  is_playoff: z.boolean().optional(),
  matchup_id: z.union([z.string(), z.number()]).optional(),
}).passthrough();

/** Individual lineup entry */
export const LineupEntrySchema = z.object({
  week: z.number(),
  team: z.string(),
  player: z.string(),
  points: z.number(),
  started: z.boolean(),
  season: z.number(),
  source: z.string().optional(),
  player_id: z.string().optional(),
  sleeper_id: z.string().optional(),
  espn_id: z.string().optional(),
  gsis_id: z.string().nullable().optional(),
  position: PositionSchema.optional(),
  nfl_team: NflTeamSchema.optional(),
}).passthrough();

/** Weekly chunk data (matchups + lineups for a week) */
export const WeeklyChunkSchema = z.object({
  season: z.number(),
  week: z.number(),
  matchups: z.array(MatchupSchema),
  lineups: z.array(LineupEntrySchema),
});

// =============================================================================
// SEASON SUMMARY SCHEMAS
// =============================================================================

/** Team summary in season data */
export const SeasonTeamSchema = z.object({
  team_name: z.string(),
  owner: z.string(),
  record: z.string(),
  points_for: z.number(),
  points_against: z.number(),
  regular_season_rank: z.number().optional(),
  final_rank: z.number().optional(),
}).passthrough();

/** Standings entry */
export const StandingsEntrySchema = z.object({
  team: z.string(),
  wins: z.number(),
  losses: z.number(),
  ties: z.number().optional(),
  points_for: z.number(),
  points_against: z.number(),
  rank: z.number().optional(),
}).passthrough();

/** Season summary data */
export const SeasonSummarySchema = z.object({
  season: z.number(),
  teams: z.array(SeasonTeamSchema),
  standings: z.array(StandingsEntrySchema).optional(),
  matchups: z.array(MatchupSchema).optional(),
  lineups: z.array(LineupEntrySchema).optional(),
}).passthrough();

// =============================================================================
// TRANSACTION SCHEMAS
// =============================================================================

/** Transaction entry */
export const TransactionSchema = z.object({
  season: z.number().optional(),
  week: z.number().optional(),
  type: z.string().optional(),
  team: z.string().optional(),
  player: z.string().optional(),
  player_id: z.string().optional(),
  adds: z.array(z.unknown()).optional(),
  drops: z.array(z.unknown()).optional(),
  trades: z.array(z.unknown()).optional(),
}).passthrough();

/** Transactions data for a season */
export const TransactionsSchema = z.object({
  season: z.number(),
  entries: z.array(TransactionSchema).optional(),
  __meta: z.object({ path: z.string() }).optional(),
}).passthrough();

// =============================================================================
// PLAYER STATS SCHEMAS
// =============================================================================

/** Player stats row (generic, works for weekly/season/career) */
export const PlayerStatsRowSchema = z.object({
  player_id: z.string().optional(),
  player_uid: z.string().optional(),
  player: z.string().optional(),
  name: z.string().optional(),
  season: z.number().optional(),
  week: z.number().optional(),
  position: PositionSchema.optional(),
  team: z.string().optional(),
  points: z.number().optional(),
  games: z.number().optional(),
  ppg: z.number().optional(),
}).passthrough();

/** Player stats with rows wrapper */
export const PlayerStatsSchema = z.object({
  season: z.number().optional(),
  generatedAt: z.string().optional(),
  rows: z.array(PlayerStatsRowSchema),
}).passthrough();

// =============================================================================
// PLAYER METRICS SCHEMAS
// =============================================================================

/** Player metrics row */
export const PlayerMetricsRowSchema = z.object({
  player_id: z.string().optional(),
  player_uid: z.string().optional(),
  player: z.string().optional(),
  name: z.string().optional(),
  season: z.number().optional(),
  position: PositionSchema.optional(),
  war: nullableNumber,
  z_score: nullableNumber,
  boom_rate: nullableNumber,
  bust_rate: nullableNumber,
  consistency: nullableNumber,
  consistency_label: nullableString,
}).passthrough();

/** Player metrics with rows wrapper */
export const PlayerMetricsSchema = z.object({
  season: z.number().optional(),
  generatedAt: z.string().optional(),
  rows: z.array(PlayerMetricsRowSchema).optional(),
}).passthrough();

// =============================================================================
// ALL-TIME / RECORDS SCHEMAS
// =============================================================================

/** All-time records data */
export const AllTimeSchema = z.object({
  topWeekly: z.array(z.unknown()).optional(),
  topSeasons: z.array(z.unknown()).optional(),
  careerLeaders: z.array(z.unknown()).optional(),
}).passthrough();

// =============================================================================
// ESPN NAME MAP SCHEMA
// =============================================================================

/** ESPN name map (espn_id -> name mapping) */
export const EspnNameMapSchema = z.record(z.string(), z.string());

// =============================================================================
// CORE DATA BUNDLE (returned by loadCoreData)
// =============================================================================

export const CoreDataSchema = z.object({
  players: z.array(PlayerSchema),
  playerIds: z.array(PlayerIdSchema),
  teams: z.array(TeamSchema),
  espnNameMap: z.record(z.string(), z.string()),
  playerSearch: z.array(PlayerSearchEntrySchema),
});

// =============================================================================
// TYPE EXPORTS (inferred from Zod schemas)
// =============================================================================

export type NflTeam = z.infer<typeof NflTeamSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestPaths = z.infer<typeof ManifestPathsSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type PlayerIdentifiers = z.infer<typeof PlayerIdentifiersSchema>;
export type PlayerId = z.infer<typeof PlayerIdSchema>;
export type PlayerSearchEntry = z.infer<typeof PlayerSearchEntrySchema>;
export type PlayerSearch = z.infer<typeof PlayerSearchSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Matchup = z.infer<typeof MatchupSchema>;
export type LineupEntry = z.infer<typeof LineupEntrySchema>;
export type WeeklyChunk = z.infer<typeof WeeklyChunkSchema>;
export type SeasonTeam = z.infer<typeof SeasonTeamSchema>;
export type StandingsEntry = z.infer<typeof StandingsEntrySchema>;
export type SeasonSummary = z.infer<typeof SeasonSummarySchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type Transactions = z.infer<typeof TransactionsSchema>;
export type PlayerStatsRow = z.infer<typeof PlayerStatsRowSchema>;
export type PlayerStats = z.infer<typeof PlayerStatsSchema>;
export type PlayerMetricsRow = z.infer<typeof PlayerMetricsRowSchema>;
export type PlayerMetrics = z.infer<typeof PlayerMetricsSchema>;
export type AllTime = z.infer<typeof AllTimeSchema>;
export type EspnNameMap = z.infer<typeof EspnNameMapSchema>;
export type CoreData = z.infer<typeof CoreDataSchema>;

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/** Validation result type */
export interface ValidationResult<T> {
  success: boolean;
  data: T | null;
  error: ZodError | null;
  issues: string[];
}

/**
 * Validates data against a schema and returns a structured result
 */
export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context: string = "data"
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      error: null,
      issues: [],
    };
  }

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `[${context}] ${path}: ${issue.message}`;
  });

  return {
    success: false,
    data: null,
    error: result.error,
    issues,
  };
}

/**
 * Validates data and logs warnings in development, but always returns data
 * This is a "soft" validation that warns but doesn't break the app
 */
export function validateWithWarnings<T>(
  schema: ZodSchema<T>,
  data: T,
  context: string = "data",
  isDev: boolean = false
): T {
  const result = validate(schema, data, context);

  if (!result.success && isDev) {
    console.warn(`VALIDATION_WARNING [${context}]:`, result.issues.slice(0, 5));
    if (result.issues.length > 5) {
      console.warn(`  ... and ${result.issues.length - 5} more issues`);
    }
  }

  return data;
}

/** Error type with validation issues */
export interface ValidationError extends Error {
  validationIssues?: string[];
}

/**
 * Validates data and throws if invalid (for critical paths)
 */
export function validateOrThrow<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context: string = "data"
): T {
  const result = validate(schema, data, context);

  if (!result.success) {
    const message = `Data validation failed for ${context}: ${result.issues.slice(0, 3).join("; ")}`;
    const error = new Error(message) as ValidationError;
    error.validationIssues = result.issues;
    throw error;
  }

  return result.data!;
}

// =============================================================================
// PARTIAL/LOOSE SCHEMAS (for optional data that may have extra fields)
// =============================================================================

/** Loose player schema that accepts partial data */
export const LoosePlayerSchema = PlayerSchema.partial().extend({
  id: z.string(),
  name: z.string(),
});

/** Loose matchup schema */
export const LooseMatchupSchema = MatchupSchema.partial().extend({
  home_team: z.string(),
  away_team: z.string(),
});

export type LoosePlayer = z.infer<typeof LoosePlayerSchema>;
export type LooseMatchup = z.infer<typeof LooseMatchupSchema>;
