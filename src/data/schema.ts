import { z } from "zod";

export const SCHEMA_VERSION = "1.0.0";

export const TeamSchema = z.object({
  team_id: z.number().int().nullable().optional(),
  team_name: z.string().default(""),
  owner: z.string().nullable().optional(),
  record: z.string().nullable().optional(),
  points_for: z.number().nullable().optional(),
  points_against: z.number().nullable().optional(),
  regular_season_rank: z.number().int().nullable().optional(),
  final_rank: z.number().int().nullable().optional(),
});

export const MatchupSchema = z.object({
  week: z.number().int().nullable().optional(),
  home_team: z.string().nullable().optional(),
  home_score: z.number().nullable().optional(),
  away_team: z.string().nullable().optional(),
  away_score: z.number().nullable().optional(),
  is_playoff: z.boolean().nullable().optional(),
});

export const TransactionEntrySchema = z.object({
  type: z.string().default(""),
  team: z.string().nullable().optional(),
  player: z.string().nullable().optional(),
  faab: z.number().nullable().optional(),
});

export const TransactionSchema = z.object({
  date: z.string().default(""),
  entries: z.array(TransactionEntrySchema).default([]),
});

export const DraftPickSchema = z.object({
  round: z.number().int().nullable().optional(),
  overall: z.number().int().nullable().optional(),
  team: z.string().nullable().optional(),
  player: z.string().nullable().optional(),
  player_nfl: z.string().nullable().optional(),
  keeper: z.boolean().nullable().optional(),
});

export const PowerRankingEntrySchema = z.object({
  week: z.number().int(),
  team: z.string(),
  rank: z.number().int(),
  record: z.string().nullable().optional(),
  points_for: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const PowerRankingsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generated_at: z.string().nullable().optional(),
  season: z.number().int().nullable().optional(),
  entries: z.array(PowerRankingEntrySchema),
});

export const WeeklyRecapEntrySchema = z.object({
  week: z.number().int(),
  title: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()).optional(),
  notable_teams: z.array(z.string()).optional(),
});

export const WeeklyRecapsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generated_at: z.string().nullable().optional(),
  season: z.number().int().nullable().optional(),
  entries: z.array(WeeklyRecapEntrySchema),
});

export const AwardSchema = z.object({
  id: z.string().default(""),
  title: z.string().default(""),
  description: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  value: z.number().nullable().optional(),
});

export const LineupSchema = z.object({
  week: z.number().int().nullable().optional(),
  team: z.string().nullable().optional(),
  player_id: z.string().nullable().optional(),
  player: z.string().nullable().optional(),
  started: z.boolean().nullable().optional(),
  points: z.number().nullable().optional(),
});

export const PlayerIndexSchema = z.object({
  full_name: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  pos: z.string().nullable().optional(),
});

export const SupplementalSchema = z.object({
  current_roster: z.record(z.array(z.string())).optional(),
  player_index: z.record(PlayerIndexSchema).optional(),
  draft_day_roster: z.record(z.array(z.string())).optional(),
  users: z.array(z.object({
    user_id: z.string(),
    display_name: z.string().nullable().optional(),
  })).optional(),
  trade_evals: z.array(z.unknown()).optional(),
  acquisitions: z.array(z.unknown()).optional(),
});

export const SeasonSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  year: z.number().int(),
  league_id: z.string().nullable().optional(),
  generated_at: z.string().nullable().optional(),
  teams: z.array(TeamSchema),
  matchups: z.array(MatchupSchema),
  transactions: z.array(TransactionSchema),
  draft: z.array(DraftPickSchema),
  awards: z.array(AwardSchema).default([]),
  lineups: z.array(LineupSchema).optional(),
  supplemental: SupplementalSchema.optional(),
});

export type Team = z.infer<typeof TeamSchema>;
export type Matchup = z.infer<typeof MatchupSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type DraftPick = z.infer<typeof DraftPickSchema>;
export type PowerRankingEntry = z.infer<typeof PowerRankingEntrySchema>;
export type PowerRankings = z.infer<typeof PowerRankingsSchema>;
export type WeeklyRecapEntry = z.infer<typeof WeeklyRecapEntrySchema>;
export type WeeklyRecaps = z.infer<typeof WeeklyRecapsSchema>;
export type Award = z.infer<typeof AwardSchema>;
export type Lineup = z.infer<typeof LineupSchema>;
export type Supplemental = z.infer<typeof SupplementalSchema>;
export type SeasonData = z.infer<typeof SeasonSchema>;
