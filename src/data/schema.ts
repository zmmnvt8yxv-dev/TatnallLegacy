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
  title: z.string().optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  notable_teams: z.array(z.string()).optional(),
  markdown: z.string().optional(),
  content: z.unknown().optional(),
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

export const NflRosterEntrySchema = z
  .object({
    season: z.number().int().nullable().optional(),
    team: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    depth_chart_position: z.string().nullable().optional(),
    full_name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    jersey_number: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
    gsis_id: z.string().nullable().optional(),
    sleeper_id: z.string().nullable().optional(),
    espn_id: z.string().nullable().optional(),
    headshot_url: z.string().nullable().optional(),
  })
  .passthrough();

export const NflRosterSchema = z.array(NflRosterEntrySchema);

export const NflScheduleEntrySchema = z
  .object({
    game_id: z.string(),
    season: z.number().int().nullable().optional(),
    game_type: z.string().nullable().optional(),
    week: z.number().int().nullable().optional(),
    gameday: z.string().nullable().optional(),
    weekday: z.string().nullable().optional(),
    gametime: z.string().nullable().optional(),
    away_team: z.string().nullable().optional(),
    away_score: z.number().nullable().optional(),
    home_team: z.string().nullable().optional(),
    home_score: z.number().nullable().optional(),
    location: z.string().nullable().optional(),
    stadium: z.string().nullable().optional(),
  })
  .passthrough();

export const NflScheduleSchema = z.array(NflScheduleEntrySchema);

export const NflTeamSchema = z
  .object({
    team_abbr: z.string(),
    team_name: z.string().nullable().optional(),
    team_id: z.number().nullable().optional(),
    team_nick: z.string().nullable().optional(),
    team_conf: z.string().nullable().optional(),
    team_division: z.string().nullable().optional(),
    team_color: z.string().nullable().optional(),
    team_color2: z.string().nullable().optional(),
    team_color3: z.string().nullable().optional(),
    team_color4: z.string().nullable().optional(),
    team_logo_wikipedia: z.string().nullable().optional(),
    team_logo_espn: z.string().nullable().optional(),
    team_wordmark: z.string().nullable().optional(),
  })
  .passthrough();

export const NflTeamsSchema = z.array(NflTeamSchema);

export const PlayerIndexSchema = z.object({
  full_name: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  pos: z.string().nullable().optional(),
});

export const TradePlayerSchema = z.object({
  id: z.string().default(""),
  name: z.string().default(""),
  pos: z.string().nullable().optional(),
  nfl: z.string().nullable().optional(),
});

export const TradePickSchema = z.object({
  season: z.number().int().nullable().optional(),
  round: z.number().int().nullable().optional(),
  original_team: z.string().nullable().optional(),
});

export const TradePartySchema = z.object({
  roster_id: z.number().int().nullable().optional(),
  team: z.string().default(""),
  gained_players: z.array(TradePlayerSchema).default([]),
  sent_players: z.array(TradePlayerSchema).default([]),
  gained_picks: z.array(TradePickSchema).default([]),
  sent_picks: z.array(TradePickSchema).default([]),
  net_points: z.number().nullable().optional(),
  score: z.number().nullable().optional(),
});

export const TradeSchema = z.object({
  id: z.string().default(""),
  week: z.number().int().nullable().optional(),
  status: z.string().nullable().optional(),
  created: z.number().nullable().optional(),
  executed: z.number().nullable().optional(),
  parties: z.array(TradePartySchema).default([]),
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
  trades: z.array(TradeSchema).optional(),
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
  lineups: z.array(LineupSchema).default([]),
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
export type TradePlayer = z.infer<typeof TradePlayerSchema>;
export type TradePick = z.infer<typeof TradePickSchema>;
export type TradeParty = z.infer<typeof TradePartySchema>;
export type Trade = z.infer<typeof TradeSchema>;
export type Supplemental = z.infer<typeof SupplementalSchema>;
export type SeasonData = z.infer<typeof SeasonSchema>;
