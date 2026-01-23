import { useQuery } from "@tanstack/react-query";
import { loadSeasonSummary, loadPlayerStatsSeason, loadTransactions } from "../data/loader.js";

// Helper to determine stale time (cache validity)
// If season is current year (2025), cache for 5 minutes.
// If historical (2015-2024), cache essentially forever (24 hours).
const getStaleTime = (season) => {
    const currentYear = new Date().getFullYear();
    // Assuming upcoming season is currentYear + 1 if late in year, or whatever.
    // Simplifying: if season >= 2025, it's potentially active.
    if (Number(season) >= 2025) {
        return 1000 * 60 * 5; // 5 minutes
    }
    return 1000 * 60 * 60 * 24; // 24 hours
};

export function useSeasonDetails(season) {
    const staleTime = getStaleTime(season);

    const summaryQuery = useQuery({
        queryKey: ["seasonSummary", season],
        queryFn: () => loadSeasonSummary(season),
        staleTime,
        enabled: !!season,
    });

    const statsQuery = useQuery({
        queryKey: ["playerStatsSeason", season],
        queryFn: () => loadPlayerStatsSeason(season),
        staleTime,
        enabled: !!season,
    });

    const transactionsQuery = useQuery({
        queryKey: ["transactions", season],
        queryFn: () => loadTransactions(season),
        staleTime,
        enabled: !!season,
    });

    return {
        summary: summaryQuery.data,
        playerStats: Array.isArray(statsQuery.data) ? statsQuery.data : statsQuery.data?.rows || [],
        transactions: transactionsQuery.data,

        isLoading: summaryQuery.isLoading || statsQuery.isLoading || transactionsQuery.isLoading,
        isError: summaryQuery.isError || statsQuery.isError || transactionsQuery.isError,

        errors: {
            summary: summaryQuery.isError,
            stats: statsQuery.isError,
            transactions: transactionsQuery.isError,
        },
    };
}
