import { useQuery } from "@tanstack/react-query";
import { loadTransactions } from "../data/loader";
import type { Transactions } from "../schemas/index";

function getStaleTime(season: number | string | undefined): number {
    if (Number(season) >= 2025) {
        return 1000 * 60 * 5; // 5 minutes
    }
    return 1000 * 60 * 60 * 24; // 24 hours
}

export interface UseTransactionsResult {
    transactions: Transactions | null | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
}

export function useTransactions(season: number | undefined): UseTransactionsResult {
    const staleTime = getStaleTime(season);

    const query = useQuery({
        queryKey: ["transactions", season],
        queryFn: () => loadTransactions(season!),
        staleTime,
        enabled: !!season,
    });

    return {
        transactions: query.data,
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
    };
}
