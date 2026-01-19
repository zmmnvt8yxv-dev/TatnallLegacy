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
    loadSeasonSummary
} from "../data/loader.js";

export function usePlayerDetails({ selectedSeason, seasons }) {
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
        queryFn: () => loadSeasonMetrics(selectedSeason),
        enabled: !!selectedSeason,
        staleTime: 1000 * 60 * 15,
    });

    const weeklyStatsQuery = useQuery({
        queryKey: ["playerStatsWeekly", selectedSeason],
        queryFn: () => loadPlayerStatsWeekly(selectedSeason),
        enabled: !!selectedSeason,
        staleTime: 1000 * 60 * 15,
    });

    const transactionsQuery = useQuery({
        queryKey: ["transactions", selectedSeason],
        queryFn: () => loadTransactions(selectedSeason),
        enabled: !!selectedSeason,
        staleTime: 1000 * 60 * 15,
    });

    const fullStatsQuery = useQuery({
        queryKey: ["playerStatsFull", selectedSeason],
        queryFn: () => loadPlayerStatsFull(selectedSeason),
        enabled: !!selectedSeason,
        staleTime: 1000 * 60 * 15,
    });

    // Lineup/Week data for the selected season
    const weeks = manifestQuery.data?.weeksBySeason?.[String(selectedSeason)] || [];
    const weekDataQueries = useQueries({
        queries: weeks.map(w => ({
            queryKey: ["weekData", selectedSeason, w],
            queryFn: () => loadWeekData(selectedSeason, w),
            staleTime: 1000 * 60 * 15,
        }))
    });

    const isLoading =
        manifestQuery.isLoading ||
        careerStatsQuery.isLoading ||
        boomBustQuery.isLoading ||
        careerMetricsQuery.isLoading ||
        (selectedSeason && (
            seasonMetricsQuery.isLoading ||
            weeklyStatsQuery.isLoading ||
            transactionsQuery.isLoading ||
            fullStatsQuery.isLoading
        ));

    const isError =
        manifestQuery.isError ||
        careerStatsQuery.isError ||
        boomBustQuery.isError ||
        careerMetricsQuery.isError ||
        seasonMetricsQuery.isError ||
        weeklyStatsQuery.isError ||
        transactionsQuery.isError ||
        fullStatsQuery.isError;

    return {
        manifest: manifestQuery.data,
        careerStats: careerStatsQuery.data?.rows || careerStatsQuery.data || [],
        boomBustMetrics: boomBustQuery.data?.rows || boomBustQuery.data || [],
        careerMetrics: careerMetricsQuery.data?.rows || careerMetricsQuery.data || [],
        seasonSummaries: seasonSummaryQueries.map(q => q.data).filter(Boolean),
        statsSeasonSummaries: playerSeasonStatsQueries.map(q => q.data).filter(Boolean),
        seasonMetrics: seasonMetricsQuery.data?.rows || seasonMetricsQuery.data || [],
        statsWeeklyRows: weeklyStatsQuery.data?.rows || weeklyStatsQuery.data || [],
        playerTransactions: transactionsQuery.data?.entries || [],
        fullStatsRows: fullStatsQuery.data?.rows || fullStatsQuery.data || [],
        weekLineups: weekDataQueries.map(q => ({ week: q.data?.week, lineups: q.data?.lineups })),
        isLoading,
        isError,
    };
}
