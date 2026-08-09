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
  type HistoryData,
  type ManifestV3,
  type NowData,
  type OwnersData,
  type PlayerDirectory,
  type SearchData,
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
