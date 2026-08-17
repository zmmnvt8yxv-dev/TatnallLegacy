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
      monogram: z.string().optional(),
      accent: z.string().optional(),
      motto: z.string().optional(),
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

const SeasonHubTeamRefSchema = z.object({
  rosterId: z.number(),
  ownerUid: z.string().nullable(),
  ownerName: z.string(),
  teamName: z.string(),
  monogram: z.string(),
  accent: z.string(),
});

const SeasonHubPlayerSchema = z.object({
  playerUid: z.string().nullable(),
  sleeperId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  nflTeam: z.string().nullable(),
  starter: z.boolean(),
  keeper: z.boolean(),
  injuryStatus: z.string().nullable().optional(),
  nflStatus: z.string().nullable().optional(),
  weekOneProjection: z.number(),
  regularSeasonProjection: z.number(),
  draftPrice: z.number().nullable(),
  projectedWeekOneStarter: z.boolean().optional(),
});

export const SeasonHubSchema = z.object({
  meta: z.object({
    schemaVersion: z.literal("3.1.0"),
    generatedAt: z.string(),
    sleeperSnapshotAt: z.string(),
    season: z.number(),
    status: z.string(),
  }),
  projectionSource: z.object({
    label: z.string(),
    provider: z.string(),
    scoringField: z.string(),
    seasonType: z.string(),
    updatedAt: z.string(),
    publishedValues: z.number(),
    expectedRosterWeeks: z.number(),
    coveragePct: z.number(),
    method: z.string(),
    coverageNote: z.string(),
  }),
  draft: z.object({
    draftId: z.string(),
    status: z.string(),
    completedAt: z.string().nullable(),
    pickCount: z.number(),
    totalSpend: z.number(),
    unspent: z.number(),
    sleeperUrl: z.string(),
  }),
  regularSeason: z.object({
    startWeek: z.number(),
    endWeek: z.number(),
    scheduleSource: z.string(),
    matchupCount: z.number(),
  }),
  teams: z.array(z.object({
    rosterId: z.number(),
    ownerUid: z.string().nullable(),
    ownerName: z.string(),
    franchiseUid: z.string().nullable(),
    teamName: z.string(),
    monogram: z.string(),
    accent: z.string(),
    motto: z.string(),
    avatar: z.string().nullable().optional(),
    division: z.number().nullable().optional(),
    wins: z.number(),
    losses: z.number(),
    ties: z.number(),
    waiverPosition: z.number().nullable().optional(),
    players: z.array(SeasonHubPlayerSchema),
    keepers: z.array(SeasonHubPlayerSchema),
    analysis: z.object({
      projectionRank: z.number(),
      grade: z.string(),
      tier: z.string(),
      projectedRegularSeasonPoints: z.number(),
      projectedWeeklyAverage: z.number(),
      projectedAllPlayWins: z.number(),
      projectedRecord: z.object({ wins: z.number(), losses: z.number(), ties: z.number() }),
      scheduleStrengthRank: z.number(),
      opponentProjectedAverage: z.number(),
      strength: z.object({ position: z.string(), rank: z.number(), label: z.string() }),
      concern: z.object({ position: z.string(), rank: z.number(), label: z.string() }),
      headline: z.string(),
      overview: z.string(),
      positionGroups: z.array(z.object({
        position: z.string(), rank: z.number(), projectedWeeklyPoints: z.number(),
      })),
      weekOneLineup: z.array(SeasonHubPlayerSchema.extend({
        projectedPoints: z.number(), slot: z.string(),
      })),
      weeklyLineups: z.array(z.object({
        week: z.number(),
        projectedPoints: z.number(),
        players: z.array(z.object({
          playerUid: z.string().nullable(), sleeperId: z.string(), name: z.string(),
          position: z.string().nullable(), nflTeam: z.string().nullable(),
          projectedPoints: z.number(), slot: z.string(),
        })),
      })),
      openLineupSlots: z.array(z.string()),
      topProjectedPlayers: z.array(z.object({
        playerUid: z.string().nullable(), sleeperId: z.string(), name: z.string(),
        position: z.string().nullable(), projectedPoints: z.number(),
      })),
      injuryFlags: z.number(),
    }),
    draftRecap: z.object({
      picks: z.number(), spend: z.number(), unspent: z.number(), keeperSpend: z.number(), auctionSpend: z.number(),
      largestPurchase: z.object({
        playerUid: z.string().nullable(), sleeperId: z.string(), name: z.string(), amount: z.number(),
      }).nullable(),
    }),
  })),
  schedule: z.array(z.object({
    week: z.number(),
    matchups: z.array(z.object({
      matchupId: z.number(),
      teamA: SeasonHubTeamRefSchema,
      teamB: SeasonHubTeamRefSchema,
      projectedA: z.number(),
      projectedB: z.number(),
      projectedFavoriteRosterId: z.number().nullable(),
      projectedMargin: z.number(),
    })),
  })),
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

export const PublicOwnerIdentitySchema = z.object({
  ownerUid: z.string().nullable(),
  ownerName: z.string(),
  teamName: z.string(),
  accent: z.string().optional(),
});

export const DraftPlayerSchema = z.object({
  playerUid: z.string(),
  sleeperId: z.string(),
  name: z.string(),
  position: z.string(),
  nflTeam: z.string().nullable(),
  active: z.boolean(),
  nflStatus: z.string().nullable(),
  injuryStatus: z.string().nullable(),
  depthChart: z.object({ position: z.string().nullable(), order: z.number().nullable() }),
  rank: z.number(),
  positionRank: z.number(),
  draftScore: z.number().nullable(),
  performanceScore: z.number().nullable(),
  marketScore: z.number().nullable(),
  reliability: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  games: z.number(),
  pointsPerGame: z.number().nullable(),
  replacementWar: z.number().nullable(),
  boomRate: z.number().nullable(),
  volatility: z.number().nullable(),
  scarcityTier: z.string(),
  recommendedValue: z.number(),
  inRosterDemand: z.boolean(),
  availability: z.enum(["available", "rostered", "kept"]),
  keeper: z.boolean(),
  keeperCost: z.number().nullable(),
  keeperSurplus: z.number().nullable(),
  currentOwner: PublicOwnerIdentitySchema.nullable(),
});

export const WarRoomSchema = z.object({
  meta: z.object({
    schemaVersion: z.literal("3.0.0"),
    generatedAt: z.string(),
    modelVersion: z.string(),
    verifiedPerformanceSeason: z.number(),
    historicalModelCoverage: z.string(),
  }),
  league: z.object({
    season: z.number(), teams: z.number(), budgetPerTeam: z.number(), rosterSpotsPerTeam: z.number(),
    lineup: z.record(z.string(), z.number()),
  }),
  budget: z.object({
    leagueTotal: z.number(), rosterSpots: z.number(), keeperSpend: z.number(), keeperCount: z.number(),
    auctionPool: z.number(), openSpots: z.number(), minimumReserve: z.number(), discretionaryPool: z.number(),
    recommendedAuctionTotal: z.number(),
  }),
  draft: z.object({
    draftId: z.string(), status: z.string(), startTime: z.string().nullable(), draftEndpoint: z.string(),
    picksEndpoint: z.string(), pollingSeconds: z.number(), backoffSeconds: z.array(z.number()), staticPicks: z.array(z.unknown()),
  }),
  teams: z.array(z.object({
    ownerUid: z.string().nullable(), ownerKey: z.string().optional(), ownerName: z.string(), teamName: z.string(),
    monogram: z.string(), accent: z.string(), motto: z.string(), rosterId: z.number(), keeperSpend: z.number(),
    remainingBudget: z.number(), openSlots: z.number(), maximumBid: z.number(), positionCounts: z.record(z.string(), z.number()),
    keepers: z.array(z.object({
      playerUid: z.string().nullable(), sleeperId: z.string(), name: z.string(), position: z.string(), cost: z.number(),
      modelValue: z.number(), surplus: z.number().nullable(),
    })),
  })),
  players: z.array(DraftPlayerSchema),
  methodology: z.record(z.string(), z.string()),
});

export const PlayerCareerSchema = z.object({
  meta: z.object({ schemaVersion: z.literal("3.0.0"), generatedAt: z.string() }),
  player: z.object({
    playerUid: z.string(), sleeperId: z.string(), name: z.string(), position: z.string(), nflTeam: z.string().nullable(),
    active: z.boolean(), nflStatus: z.string().nullable(), injuryStatus: z.string().nullable(),
    depthChart: z.object({ position: z.string().nullable(), order: z.number().nullable() }),
    college: z.string().nullable().optional(), yearsExperience: z.number().nullable(),
    providerIds: z.array(z.object({ type: z.string(), value: z.string() })),
  }),
  current: z.object({
    availability: z.string(), owner: PublicOwnerIdentitySchema.nullable(), keeper: z.boolean(), keeperCost: z.number().nullable(),
    modelValue: z.number(), keeperSurplus: z.number().nullable(), draftScore: z.number().nullable(), confidence: z.string(),
    scarcityTier: z.string(), positionRank: z.number(),
  }),
  comparables: z.array(z.object({
    playerUid: z.string(), name: z.string(), position: z.string(), nflTeam: z.string().nullable(), modelValue: z.number(),
    draftScore: z.number().nullable(), confidence: z.string(),
  })),
  career: z.array(z.object({
    season: z.number(), games: z.number(), providerPoints: z.number().nullable(), pointsPerGame: z.number().nullable(),
    replacementWar: z.number().nullable(), scoringEra: z.enum(["verified_tatnall", "provider_recorded"]), modelVerified: z.boolean(),
  })),
  timeline: z.array(z.object({
    eventUid: z.string(), season: z.number(), week: z.number(), type: z.string(), amount: z.number().nullable(),
    team: PublicOwnerIdentitySchema.nullable(),
  })),
});

export const PlayerSeasonSchema = z.object({
  meta: z.object({
    schemaVersion: z.literal("3.0.0"), generatedAt: z.string(), season: z.number(),
    scoringEra: z.enum(["verified_tatnall", "provider_recorded"]), modelVerified: z.boolean(),
  }),
  playerUid: z.string(),
  season: z.number(),
  weeks: z.array(z.object({
    week: z.number(), points: z.number().nullable(), positionalBaseline: z.number().nullable(),
    replacementWar: z.number().nullable(), tatnallStarts: z.number(),
  })),
  acquisitions: z.array(z.object({
    week: z.number(), type: z.string(), amount: z.number().nullable(), team: z.unknown().nullable(),
  })),
});

export const EditorialSchema = z.object({
  meta: z.object({ schemaVersion: z.literal("3.0.0"), generatedAt: z.string(), modelVersion: z.string(), verifiedThrough: z.number() }),
  lead: z.object({ kicker: z.string(), headline: z.string(), dek: z.string(), commissionerNote: z.string().nullable() }),
  powerRankings: z.array(z.object({
    powerRank: z.number(), powerScore: z.number(), ownerUid: z.string(), ownerName: z.string(), teamName: z.string(),
    accent: z.string(), wins: z.number(), pointsFor: z.number(), expectedWins: z.number(), luck: z.number(),
    allPlayWins: z.number(), allPlayGames: z.number(), managerEfficiency: z.number().nullable(),
  })),
  methodology: z.record(z.string(), z.string()),
  history: z.object({ headline: z.string(), items: z.array(z.string()) }),
});

export type ManifestV3 = z.infer<typeof ManifestV3Schema>;
export type NowData = z.infer<typeof NowSchema>;
export type SeasonHubData = z.infer<typeof SeasonHubSchema>;
export type HistoryData = z.infer<typeof HistorySchema>;
export type HistorySeason = z.infer<typeof HistorySeasonSchema>;
export type OwnerSummary = z.infer<typeof OwnerSummarySchema>;
export type OwnersData = z.infer<typeof OwnersSchema>;
export type PlayerDirectory = z.infer<typeof PlayerDirectorySchema>;
export type SearchData = z.infer<typeof SearchSchema>;
export type WarRoomData = z.infer<typeof WarRoomSchema>;
export type DraftPlayer = z.infer<typeof DraftPlayerSchema>;
export type PlayerCareer = z.infer<typeof PlayerCareerSchema>;
export type PlayerSeason = z.infer<typeof PlayerSeasonSchema>;
export type EditorialData = z.infer<typeof EditorialSchema>;
