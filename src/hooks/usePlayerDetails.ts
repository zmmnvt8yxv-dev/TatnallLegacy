import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
    loadManifest,
    loadBoomBustMetrics,
    loadPlayerStatsCareer,
    loadCareerMetrics,
    loadSeasonMetrics,
    loadPlayerStatsWeekly,
    loadTransactions,
    loadPlayerStatsFull,
    loadWeekData,
    loadPlayerStatsSeason,
    loadSeasonSummary,
    loadMegaProfile,
    loadNflSiloMeta
} from "../data/loader";
import type {
    Manifest,
    SeasonSummary,
    PlayerStatsRow,
    PlayerMetricsRow,
    Transaction,
    LineupEntry,
} from "../schemas/index";
import type { NflProfile, NflSiloMeta } from "../types/index";

export interface UsePlayerDetailsOptions {
    selectedSeason?: number;
    seasons: number[];
    playerId?: string;
}

export interface WeekLineup {
    week: number | undefined;
    lineups: LineupEntry[] | undefined;
}

export interface UsePlayerDetailsResult {
    manifest: Manifest | undefined;
    careerStats: PlayerStatsRow[];
    boomBustMetrics: PlayerMetricsRow[];
    careerMetrics: PlayerMetricsRow[];
    seasonSummaries: SeasonSummary[];
    statsSeasonSummaries: Array<{ rows?: PlayerStatsRow[] } | null>;
    seasonMetrics: PlayerMetricsRow[];
    statsWeeklyRows: PlayerStatsRow[];
    playerTransactions: Transaction[];
    fullStatsRows: PlayerStatsRow[];
    weekLineups: WeekLineup[];
    megaProfile: NflProfile | null | undefined;
    nflSiloMeta: NflSiloMeta | null | undefined;
    isLoading: boolean;
    isError: boolean;
}

export function usePlayerDetails({ selectedSeason, seasons, playerId }: UsePlayerDetailsOptions): UsePlayerDetailsResult {
    // Global data
    const manifestQuery = useQuery({
        queryKey: ["manifest"],
        queryFn: loadManifest,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const careerStatsQuery = useQuery({
        queryKey: ["playerStatsCareer"],
        queryFn: loadPlayerStatsCareer,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const boomBustQuery = useQuery({
        queryKey: ["boomBustMetrics"],
        queryFn: loadBoomBustMetrics,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const careerMetricsQuery = useQuery({
        queryKey: ["careerMetrics"],
        queryFn: loadCareerMetrics,
        staleTime: 1000 * 60 * 60 * 24,
    });

    // All seasons summaries and player season stats
    const seasonSummaryQueries = useQueries({
        queries: seasons.map(s => ({
            queryKey: ["seasonSummary", s],
            queryFn: () => loadSeasonSummary(s),
            staleTime: 1000 * 60 * 60 * 24,
        }))
    });

    const playerSeasonStatsQueries = useQueries({
        queries: seasons.map(s => ({
            queryKey: ["playerStatsSeason", s],
            queryFn: () => loadPlayerStatsSeason(s),
            staleTime: 1000 * 60 * 60 * 24,
        }))
    });

    // Season-specific data
    const seasonMetricsQuery = useQuery({
        queryKey: ["seasonMetrics", selectedSeason],
        queryFn: () => loadSeasonMetrics(selectedSeason!),
        enabled: !!selectedSeason,
        staleTime: 1000 * 60 * 15,
    });

    const weeklyStatsQuery = useQuery({
        queryKey: ["playerStatsWeekly", selectedSeason],
        queryFn: () => loadPlayerStatsWeekly(selectedSeason!),
        enabled: !!selectedSeason,
        staleTime: 1000 * 60 * 15,
    });

    const transactionsQuery = useQuery({
        queryKey: ["transactions", selectedSeason],
        queryFn: () => loadTransactions(selectedSeason!),
        enabled: !!selectedSeason,
        staleTime: 1000 * 60 * 15,
    });

    const fullStatsQuery = useQuery({
        queryKey: ["playerStatsFull", selectedSeason],
        queryFn: () => loadPlayerStatsFull(selectedSeason!),
        enabled: !!selectedSeason,
        staleTime: 1000 * 60 * 15,
    });

    const megaProfileQuery = useQuery({
        queryKey: ["megaProfile", playerId],
        queryFn: () => loadMegaProfile(playerId),
        enabled: !!playerId,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const nflSiloMetaQuery = useQuery({
        queryKey: ["nflSiloMeta"],
        queryFn: loadNflSiloMeta,
        staleTime: 1000 * 60 * 60 * 24,
    });

    // Lineup/Week data for the selected season
    const weeks = manifestQuery.data?.weeksBySeason?.[String(selectedSeason)] || [];
    const weekDataQueries = useQueries({
        queries: weeks.map(w => ({
            queryKey: ["weekData", selectedSeason, w],
            queryFn: () => loadWeekData(selectedSeason!, w),
            staleTime: 1000 * 60 * 15,
        }))
    });

    const isLoading =
        manifestQuery.isLoading ||
        careerStatsQuery.isLoading ||
        boomBustQuery.isLoading ||
        careerMetricsQuery.isLoading ||
        (selectedSeason ? (
            seasonMetricsQuery.isLoading ||
            weeklyStatsQuery.isLoading ||
            transactionsQuery.isLoading ||
            fullStatsQuery.isLoading ||
            megaProfileQuery.isLoading
        ) : false);

    const isError =
        manifestQuery.isError ||
        careerStatsQuery.isError ||
        boomBustQuery.isError ||
        careerMetricsQuery.isError ||
        seasonMetricsQuery.isError ||
        weeklyStatsQuery.isError ||
        transactionsQuery.isError ||
        fullStatsQuery.isError;

    const seasonSummaries = useMemo(() =>
        seasonSummaryQueries.map(q => q.data).filter((d): d is SeasonSummary => d != null),
        [seasonSummaryQueries]
    );

    const statsSeasonSummaries = useMemo(() =>
        playerSeasonStatsQueries.map(q => q.data).filter(Boolean),
        [playerSeasonStatsQueries]
    );

    const weekLineups = useMemo((): WeekLineup[] =>
        weekDataQueries.map(q => ({ week: q.data?.week, lineups: q.data?.lineups })),
        [weekDataQueries]
    );

    return useMemo(() => ({
        manifest: manifestQuery.data,
        careerStats: careerStatsQuery.data?.rows || [],
        boomBustMetrics: boomBustQuery.data?.rows || [],
        careerMetrics: careerMetricsQuery.data?.rows || [],
        seasonSummaries,
        statsSeasonSummaries,
        seasonMetrics: seasonMetricsQuery.data?.rows || [],
        statsWeeklyRows: weeklyStatsQuery.data?.rows || [],
        playerTransactions: transactionsQuery.data?.entries || [],
        fullStatsRows: fullStatsQuery.data?.rows || [],
        weekLineups,
        megaProfile: megaProfileQuery.data,
        nflSiloMeta: nflSiloMetaQuery.data,
        isLoading,
        isError,
    }), [
        manifestQuery.data,
        careerStatsQuery.data,
        boomBustQuery.data,
        careerMetricsQuery.data,
        seasonSummaries,
        statsSeasonSummaries,
        seasonMetricsQuery.data,
        weeklyStatsQuery.data,
        transactionsQuery.data,
        fullStatsQuery.data,
        weekLineups,
        megaProfileQuery.data,
        nflSiloMetaQuery.data,
        isLoading,
        isError
    ]);
}
