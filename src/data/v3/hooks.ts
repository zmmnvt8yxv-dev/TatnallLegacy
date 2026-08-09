import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import { getV3 } from "./client";
import {
  HistorySchema,
  ManifestV3Schema,
  NowSchema,
  OwnersSchema,
  PlayerDirectorySchema,
  SearchSchema,
  WarRoomSchema,
  PlayerCareerSchema,
  PlayerSeasonSchema,
  EditorialSchema,
  type HistoryData,
  type ManifestV3,
  type NowData,
  type OwnersData,
  type PlayerDirectory,
  type SearchData,
  type WarRoomData,
  type PlayerCareer,
  type PlayerSeason,
  type EditorialData,
} from "../../schemas/v3";

export function useV3Manifest(): UseQueryResult<ManifestV3, Error> {
  return useQuery({
    queryKey: ["v3", "manifest"],
    queryFn: () => getV3("data/manifest.v3.json", ManifestV3Schema),
    staleTime: 1000 * 60 * 30,
  });
}

export function useNow(): UseQueryResult<NowData, Error> {
  return useQuery({
    queryKey: ["v3", "now"],
    queryFn: () => getV3("data/now/index.json", NowSchema),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHistory(): UseQueryResult<HistoryData, Error> {
  return useQuery({
    queryKey: ["v3", "history"],
    queryFn: () => getV3("data/history/index.json", HistorySchema),
    staleTime: 1000 * 60 * 30,
  });
}

export function useOwners(): UseQueryResult<OwnersData, Error> {
  return useQuery({
    queryKey: ["v3", "owners"],
    queryFn: () => getV3("data/owners/index.json", OwnersSchema),
    staleTime: 1000 * 60 * 30,
  });
}

export function usePlayersDirectory(): UseQueryResult<PlayerDirectory, Error> {
  return useQuery({
    queryKey: ["v3", "players"],
    queryFn: () => getV3("data/players/index.json", PlayerDirectorySchema),
    staleTime: 1000 * 60 * 30,
  });
}

export function useV3Search(enabled: boolean): UseQueryResult<SearchData, Error> {
  return useQuery({
    queryKey: ["v3", "search"],
    queryFn: () => getV3("data/search/index.json", SearchSchema),
    staleTime: 1000 * 60 * 30,
    enabled,
  });
}

export function useWarRoom(): UseQueryResult<WarRoomData, Error> {
  return useQuery({
    queryKey: ["v3", "war-room"],
    queryFn: () => getV3("data/war-room/index.json", WarRoomSchema),
    staleTime: 1000 * 60 * 5,
  });
}

export function useEditorial(): UseQueryResult<EditorialData, Error> {
  return useQuery({
    queryKey: ["v3", "editorial"],
    queryFn: () => getV3("data/now/editorial.json", EditorialSchema),
    staleTime: 1000 * 60 * 30,
  });
}

export interface ResolvedPlayerCareer {
  career: PlayerCareer;
  canonicalPlayerUid: string;
}

export function usePlayerCareer(playerId: string): UseQueryResult<ResolvedPlayerCareer, Error> {
  return useQuery({
    queryKey: ["v3", "player-career", playerId],
    queryFn: async () => {
      try {
        const career = await getV3(`data/players/${encodeURIComponent(playerId)}/career.json`, PlayerCareerSchema);
        return { career, canonicalPlayerUid: career.player.playerUid };
      } catch (error) {
        const resolver = await getV3(
          `data/players/resolve/${encodeURIComponent(playerId)}.json`,
          z.object({ playerUid: z.string(), canonicalUrl: z.string(), provider: z.string() }),
        );
        const career = await getV3(`data/players/${resolver.playerUid}/career.json`, PlayerCareerSchema);
        return { career, canonicalPlayerUid: resolver.playerUid };
      }
    },
    enabled: Boolean(playerId),
    staleTime: 1000 * 60 * 30,
    retry: false,
  });
}

export function usePlayerSeason(playerUid: string | undefined, season: number): UseQueryResult<PlayerSeason, Error> {
  return useQuery({
    queryKey: ["v3", "player-season", playerUid, season],
    queryFn: () => getV3(`data/players/${playerUid}/${season}.json`, PlayerSeasonSchema),
    enabled: Boolean(playerUid),
    staleTime: 1000 * 60 * 30,
    retry: false,
  });
}

export interface SeasonYearbook {
  meta: { schemaVersion: string; generatedAt: string; source: string; completeness: Record<string, string> };
  season: HistoryData["seasons"][number];
  standings: Array<{
    teamSeasonUid: string;
    teamName: string;
    ownerUid: string;
    ownerName: string;
    franchiseUid: string;
    seed: number | null;
    rank: number;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
    playoffFinish: number | null;
    champion: boolean;
    runnerUp: boolean;
  }>;
  playoffWeeks: number[];
  correctionIds: string[];
}

export interface SeasonMatchups {
  meta: { generatedAt: string; completeness: string };
  matchups: Array<{
    matchupUid: string;
    week: number;
    type: string;
    home: HistoryData["seasons"][number]["champion"] & { points: number };
    away: HistoryData["seasons"][number]["champion"] & { points: number };
    winnerTeamSeasonUid: string;
    tie: boolean;
    corrected: boolean;
  }>;
}

export function useSeasonYearbook(season: number): UseQueryResult<SeasonYearbook, Error> {
  return useQuery({
    queryKey: ["v3", "season", season],
    queryFn: () => getV3<SeasonYearbook>(`data/seasons/${season}/index.json`),
    enabled: Number.isFinite(season),
    staleTime: Infinity,
  });
}

export function useSeasonMatchups(season: number): UseQueryResult<SeasonMatchups, Error> {
  return useQuery({
    queryKey: ["v3", "season", season, "matchups"],
    queryFn: () => getV3<SeasonMatchups>(`data/seasons/${season}/matchups.json`),
    enabled: Number.isFinite(season),
    staleTime: Infinity,
  });
}

export interface SeasonFacts {
  meta: { schemaVersion: string; generatedAt: string; source: string };
  summary: {
    lineups: { weeks: number; availableWeeks: number[]; teamWeeks: number; playerEntries: number };
    transactions: { recorded: number; completed: number; failed: number; byType: Record<string, number>; availableWeeks: number[] };
    draft: { draftsRecorded: number; completedPicks: number; primaryDraftId: string | null; budget: number | null };
  };
  paths: { lineups: string; transactions: string; draft: string };
}

type SeasonTeamRef = HistoryData["seasons"][number]["champion"];

export interface SeasonLineup {
  lineupUid: string;
  week: number;
  team: SeasonTeamRef;
  matchupUid: string | null;
  points: number;
  players: Array<{
    playerUid: string;
    sleeperId: string;
    name: string;
    position: string | null;
    nflTeam: string | null;
    slot: string;
    started: boolean;
    points: number | null;
  }>;
}

export interface SeasonTransaction {
  transactionUid: string;
  week: number;
  type: string;
  status: string;
  createdAt: string;
  waiverBid: number | null;
  teams: SeasonTeamRef[];
  assets: Array<{
    type: string;
    playerUid: string | null;
    sleeperId: string | null;
    name: string | null;
    position: string | null;
    amount: number | null;
    from: SeasonTeamRef | null;
    to: SeasonTeamRef | null;
  }>;
}

export interface SeasonDraft {
    draftUid: string;
    draftId: string;
    status: string;
    type: string;
    startTime: string;
    budget: number;
    rounds: number;
    pickCount: number;
    settings: Record<string, number>;
    picks: Array<{
      pickNo: number;
      round: number;
      team: SeasonTeamRef;
      playerUid: string;
      sleeperId: string;
      name: string;
      position: string | null;
      nflTeam: string | null;
      amount: number | null;
      keeper: boolean;
    }>;
}

export function useSeasonFacts(season: number): UseQueryResult<SeasonFacts, Error> {
  return useQuery({
    queryKey: ["v3", "season", season, "facts"],
    queryFn: () => getV3<SeasonFacts>(`data/seasons/${season}/facts.json`),
    enabled: season === 2025,
    staleTime: Infinity,
  });
}

export function useSeasonLineups(
  season: number,
  week: number,
  enabled: boolean,
): UseQueryResult<SeasonLineup[], Error> {
  return useQuery({
    queryKey: ["v3", "season", season, "lineups", week],
    queryFn: async () => {
      const payload = await getV3<{ lineups: SeasonLineup[] }>(`data/seasons/${season}/lineups/${week}.json`);
      return payload.lineups;
    },
    enabled,
    staleTime: Infinity,
  });
}

export function useSeasonTransactions(
  season: number,
  weeks: number[],
  enabled: boolean,
): UseQueryResult<SeasonTransaction[], Error> {
  return useQuery({
    queryKey: ["v3", "season", season, "transactions", weeks.join("-")],
    queryFn: async () => {
      const chunks = await Promise.all(
        weeks.map((week) => getV3<{ transactions: SeasonTransaction[] }>(`data/seasons/${season}/transactions/${week}.json`)),
      );
      return chunks.flatMap((chunk) => chunk.transactions).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    enabled: enabled && weeks.length > 0,
    staleTime: Infinity,
  });
}

export function useSeasonDraft(
  season: number,
  enabled: boolean,
): UseQueryResult<SeasonDraft[], Error> {
  return useQuery({
    queryKey: ["v3", "season", season, "draft"],
    queryFn: async () => {
      const payload = await getV3<{ drafts: SeasonDraft[] }>(`data/seasons/${season}/draft.json`);
      return payload.drafts;
    },
    enabled,
    staleTime: Infinity,
  });
}

export interface OwnerProfile {
  meta: { schemaVersion: string; generatedAt: string };
  owner: OwnersData["owners"][number];
  aliases: string[];
  headToHeadCoverage: { status: string; seasons: number[]; excludedSeasons: number[] };
  teamHistory: Array<{
    season: number;
    teamSeasonUid: string;
    franchiseUid: string;
    teamName: string;
    seed: number | null;
    record: { wins: number; losses: number; ties: number };
    pointsFor: number;
    pointsAgainst: number;
    playoffFinish: number | null;
    champion: boolean;
    runnerUp: boolean;
  }>;
  headToHead: Array<{
    ownerUid: string;
    ownerName: string;
    games: number;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
    playoffGames: number;
    playoffWins: number;
  }>;
}

export function useOwnerProfileV3(ownerUid: string): UseQueryResult<OwnerProfile, Error> {
  return useQuery({
    queryKey: ["v3", "owner", ownerUid],
    queryFn: () => getV3<OwnerProfile>(`data/owners/${ownerUid}.json`),
    enabled: Boolean(ownerUid),
    staleTime: Infinity,
  });
}

export interface RecordsV3 {
  meta: { schemaVersion: string; generatedAt: string; matchupCoverage: string; includedSeasons: number[]; excludedSeasons: number[] };
  ownerLeaders: {
    championships: OwnersData["owners"];
    wins: OwnersData["owners"];
    winPct: OwnersData["owners"];
  };
  matchups: Record<string, {
    season: number;
    week: number;
    points: number;
    opponentPoints: number;
    margin: number;
    team: HistoryData["seasons"][number]["champion"];
    opponent: HistoryData["seasons"][number]["champion"];
  }>;
  playoffs: {
    lowestSeedChampion: HistoryData["seasons"][number];
    titleCountBySeed: Array<{ seed: number; championships: number }>;
  };
}

export function useRecordsV3(): UseQueryResult<RecordsV3, Error> {
  return useQuery({
    queryKey: ["v3", "records"],
    queryFn: () => getV3<RecordsV3>("data/records/index.json"),
    staleTime: Infinity,
  });
}

const IntegritySchema = z.object({
  meta: z.object({ schemaVersion: z.string(), generatedAt: z.string() }),
  status: z.string(),
  critical: z.array(z.string()),
  warnings: z.array(z.string()),
  coverage: z.record(z.string(), CompletenessRecordSchema()),
  corrections: z.array(z.record(z.string(), z.unknown())),
  identity: z.object({
    summary: z.record(z.string(), z.number()),
    quarantined: z.array(z.record(z.string(), z.unknown())),
  }),
  openQuestions: z.array(z.string()),
});

function CompletenessRecordSchema() {
  return z.record(z.string(), z.string());
}

export type IntegrityV3 = z.infer<typeof IntegritySchema>;

export function useIntegrityV3(): UseQueryResult<IntegrityV3, Error> {
  return useQuery({
    queryKey: ["v3", "integrity"],
    queryFn: () => getV3("data/integrity/index.json", IntegritySchema),
    staleTime: 1000 * 60 * 30,
  });
}
