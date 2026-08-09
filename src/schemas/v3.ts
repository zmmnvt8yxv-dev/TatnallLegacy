import { z } from "zod";

export const CompletenessSchema = z.record(
  z.string(),
  z.enum(["complete", "partial", "unavailable", "unknown", "not_applicable"]),
);

export const TeamRefSchema = z.object({
  teamSeasonUid: z.string().nullable().optional(),
  teamName: z.string(),
  ownerUid: z.string().nullable(),
  ownerName: z.string(),
  franchiseUid: z.string().nullable().optional(),
  seed: z.number().nullable().optional(),
});

export const HistorySeasonSchema = z.object({
  season: z.number(),
  platform: z.string(),
  champion: TeamRefSchema,
  runnerUp: TeamRefSchema,
  teamCount: z.number(),
  corrected: z.boolean(),
  completeness: CompletenessSchema,
});

export const ManifestV3Schema = z.object({
  schemaVersion: z.literal("3.0.0"),
  generatedAt: z.string(),
  league: z.object({
    name: z.string(),
    firstSeason: z.number(),
    currentSeason: z.number(),
    currentWeek: z.number(),
    seasonPhase: z.string(),
    leaguePlatform: z.string(),
    leagueId: z.string(),
  }),
  seasons: z.array(z.number()),
  coverage: z.record(z.string(), CompletenessSchema),
  paths: z.record(z.string(), z.string()),
});

export const NowSchema = z.object({
  meta: z.object({
    schemaVersion: z.literal("3.0.0"),
    generatedAt: z.string(),
    sourceUpdatedAt: z.record(z.string(), z.string()),
    completeness: CompletenessSchema,
  }),
  league: z.object({
    name: z.string(),
    platformName: z.string().nullable().optional(),
    season: z.number(),
    week: z.number(),
    phase: z.string(),
    status: z.string().nullable().optional(),
    teamCount: z.number(),
    leagueId: z.string(),
  }),
  defendingChampion: TeamRefSchema,
  lastFinal: z.object({
    season: z.number(),
    champion: TeamRefSchema,
    runnerUp: TeamRefSchema,
  }),
  teams: z.array(
    z.object({
      rosterId: z.number(),
      ownerUid: z.string().nullable(),
      ownerName: z.string(),
      franchiseUid: z.string().nullable(),
      teamName: z.string(),
      avatar: z.string().nullable().optional(),
      division: z.number().nullable().optional(),
      wins: z.number(),
      losses: z.number(),
      ties: z.number(),
      waiverPosition: z.number().nullable().optional(),
      players: z.array(
        z.object({
          playerUid: z.string().nullable(),
          sleeperId: z.string(),
          name: z.string(),
          position: z.string().nullable(),
          nflTeam: z.string().nullable(),
          starter: z.boolean(),
          keeper: z.boolean(),
        }),
      ),
      keepers: z.array(
        z.object({
          playerUid: z.string().nullable(),
          sleeperId: z.string(),
          name: z.string(),
          position: z.string().nullable(),
          nflTeam: z.string().nullable(),
          starter: z.boolean(),
          keeper: z.boolean(),
        }),
      ),
    }),
  ),
  keeperStatus: z.object({
    maxPerTeam: z.number(),
    submitted: z.number(),
    expected: z.number(),
    teamsComplete: z.number(),
  }),
  draft: z
    .object({
      draftId: z.string(),
      status: z.string(),
      type: z.string(),
      startTime: z.string().nullable(),
      teamCount: z.number(),
      rounds: z.number(),
      budget: z.number(),
      nominationSeconds: z.number(),
      pickSeconds: z.number(),
      orderPublished: z.boolean(),
      order: z.array(
        z.object({
          slot: z.number(),
          userId: z.string(),
          ownerName: z.string(),
          teamName: z.string(),
        }),
      ),
      pickCount: z.number(),
      picks: z.array(
        z.object({
          pickNo: z.number(),
          round: z.number(),
          team: z.object({
            rosterId: z.number(),
            ownerUid: z.string().nullable(),
            ownerName: z.string(),
            teamName: z.string(),
          }).nullable(),
          playerUid: z.string().nullable(),
          sleeperId: z.string(),
          name: z.string(),
          position: z.string().nullable(),
          nflTeam: z.string().nullable(),
          amount: z.number().nullable(),
          keeper: z.boolean(),
        }),
      ),
      sleeperUrl: z.string(),
    })
    .nullable(),
  transactionStatus: z.object({
    recorded: z.number(),
    completed: z.number(),
    asOf: z.string(),
  }),
  recentTransactions: z.array(
    z.object({
      transactionId: z.string(),
      week: z.number(),
      type: z.string(),
      createdAt: z.string(),
      waiverBid: z.number().nullable(),
      assets: z.array(
        z.object({
          playerUid: z.string().nullable(),
          sleeperId: z.string(),
          name: z.string(),
          position: z.string().nullable(),
          from: z.object({ rosterId: z.number(), ownerUid: z.string().nullable(), ownerName: z.string(), teamName: z.string() }).nullable(),
          to: z.object({ rosterId: z.number(), ownerUid: z.string().nullable(), ownerName: z.string(), teamName: z.string() }).nullable(),
        }),
      ),
    }),
  ),
  currentWeekLineups: z.array(
    z.object({
      rosterId: z.number(),
      team: z.object({ rosterId: z.number(), ownerUid: z.string().nullable(), ownerName: z.string(), teamName: z.string() }).nullable(),
      matchupId: z.number().nullable(),
      points: z.number().nullable(),
      starters: z.array(
        z.object({
          playerUid: z.string().nullable(),
          sleeperId: z.string(),
          name: z.string(),
          position: z.string().nullable(),
          nflTeam: z.string().nullable(),
          points: z.number().nullable(),
        }),
      ),
    }),
  ),
});

export const HistorySchema = z.object({
  meta: z.object({ schemaVersion: z.literal("3.0.0"), generatedAt: z.string(), seasons: z.number() }),
  seasons: z.array(HistorySeasonSchema),
});

export const OwnerSummarySchema = z.object({
  ownerUid: z.string(),
  name: z.string(),
  active: z.boolean(),
  firstSeason: z.number().nullable(),
  lastSeason: z.number().nullable(),
  seasons: z.number(),
  wins: z.number(),
  losses: z.number(),
  ties: z.number(),
  winPct: z.number().nullable(),
  championships: z.number(),
  runnerUps: z.number(),
  finals: z.number(),
  pointsFor: z.number(),
  pointsAgainst: z.number(),
});

export const OwnersSchema = z.object({
  meta: z.object({ generatedAt: z.string() }),
  owners: z.array(OwnerSummarySchema),
});

export const PlayerDirectorySchema = z.object({
  meta: z.object({ schemaVersion: z.literal("3.0.0"), generatedAt: z.string(), count: z.number() }),
  players: z.array(
    z.object({
      playerUid: z.string(),
      sleeperId: z.string(),
      name: z.string(),
      position: z.string(),
      nflTeam: z.string().nullable(),
      college: z.string().nullable(),
      yearsExperience: z.number().nullable(),
      currentlyRostered: z.boolean(),
    }),
  ),
});

export const SearchSchema = z.object({
  meta: z.object({ generatedAt: z.string() }),
  items: z.array(
    z.object({
      type: z.enum(["owner", "season", "player"]),
      id: z.string(),
      label: z.string(),
      secondary: z.string(),
      url: z.string(),
    }),
  ),
});

export type ManifestV3 = z.infer<typeof ManifestV3Schema>;
export type NowData = z.infer<typeof NowSchema>;
export type HistoryData = z.infer<typeof HistorySchema>;
export type HistorySeason = z.infer<typeof HistorySeasonSchema>;
export type OwnerSummary = z.infer<typeof OwnerSummarySchema>;
export type OwnersData = z.infer<typeof OwnersSchema>;
export type PlayerDirectory = z.infer<typeof PlayerDirectorySchema>;
export type SearchData = z.infer<typeof SearchSchema>;
