import { useQuery, useQueries } from "@tanstack/react-query";
import {
    loadSeasonSummary,
    loadTransactions,
    loadAllTime,
    loadMetricsSummary,
    loadPlayerMetricsBoomBust
} from "../data/loader.js";

const getStaleTime = (season) => {
    if (Number(season) >= 2025) {
        return 1000 * 60 * 5; // 5 minutes
    }
    return 1000 * 60 * 60 * 24; // 24 hours
};

export function useSummaryData({
    latestSeason,
    allSeasons = [],
    loadHistory = false,
    loadMetrics = false,
    loadBoomBust = false
}) {

    // 1. Current Season Summary
    const seasonQuery = useQuery({
        queryKey: ["seasonSummary", latestSeason],
        queryFn: () => loadSeasonSummary(latestSeason),
        staleTime: getStaleTime(latestSeason),
        enabled: !!latestSeason,
    });

    // 2. Current Season Transactions
    const transactionsQuery = useQuery({
        queryKey: ["transactions", latestSeason],
        queryFn: () => loadTransactions(latestSeason),
        staleTime: getStaleTime(latestSeason),
        enabled: !!latestSeason,
    });

    // 3. All Season Summaries (for high level stats/owners)
    const allSeasonQueries = useQueries({
        queries: allSeasons.map((yr) => ({
            queryKey: ["seasonSummary", yr],
            queryFn: () => loadSeasonSummary(yr),
            staleTime: getStaleTime(yr),
        })),
    });

    // 4. All Time Records (Deferred)
    const allTimeQuery = useQuery({
        queryKey: ["allTimeRecords"],
        queryFn: () => loadAllTime(),
        staleTime: 1000 * 60 * 60 * 24,
        enabled: loadHistory,
    });

    // 5. Metrics Summary (Deferred)
    const metricsQuery = useQuery({
        queryKey: ["metricsSummary"],
        queryFn: () => loadMetricsSummary(),
        staleTime: 1000 * 60 * 60 * 24,
        enabled: loadMetrics,
    });

    // 6. Boom Bust Metrics (Deferred)
    const boomBustQuery = useQuery({
        queryKey: ["boomBustMetrics"],
        queryFn: () => loadPlayerMetricsBoomBust(),
        staleTime: 1000 * 60 * 60 * 24,
        enabled: loadBoomBust,
    });

    return {
        seasonSummary: seasonQuery.data,
        transactions: transactionsQuery.data,
        allSummaries: allSeasonQueries.map(q => q.data).filter(Boolean),
        allTime: allTimeQuery.data,
        metricsSummary: metricsQuery.data,
        boomBust: boomBustQuery.data,

        isLoading: seasonQuery.isLoading || transactionsQuery.isLoading,
        isError: seasonQuery.isError || transactionsQuery.isError,
    };
}
