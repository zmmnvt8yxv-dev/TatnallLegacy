import { useQuery } from "@tanstack/react-query";
import { loadSeasonSummary, loadPlayerStatsSeason, loadTransactions } from "../data/loader";
import type { SeasonSummary, PlayerStatsRow, Transactions } from "../schemas/index";

function getStaleTime(season: number | string | undefined): number {
    if (Number(season) >= 2025) {
        return 1000 * 60 * 5; // 5 minutes
    }
    return 1000 * 60 * 60 * 24; // 24 hours
}

export interface UseSeasonDetailsResult {
    summary: SeasonSummary | null | undefined;
    playerStats: PlayerStatsRow[];
    transactions: Transactions | null | undefined;
    isLoading: boolean;
    isError: boolean;
    errors: {
        summary: boolean;
        stats: boolean;
        transactions: boolean;
    };
}

export function useSeasonDetails(season: number | undefined): UseSeasonDetailsResult {
    const staleTime = getStaleTime(season);

    const summaryQuery = useQuery({
        queryKey: ["seasonSummary", season],
        queryFn: () => loadSeasonSummary(season!),
        staleTime,
        enabled: !!season,
    });

    const statsQuery = useQuery({
        queryKey: ["playerStatsSeason", season],
        queryFn: () => loadPlayerStatsSeason(season!),
        staleTime,
        enabled: !!season,
    });

    const transactionsQuery = useQuery({
        queryKey: ["transactions", season],
        queryFn: () => loadTransactions(season!),
        staleTime,
        enabled: !!season,
    });

    return {
        summary: summaryQuery.data,
        playerStats: statsQuery.data?.rows || [],
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
