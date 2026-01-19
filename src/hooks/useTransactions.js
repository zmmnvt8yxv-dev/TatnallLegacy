import { useQuery } from "@tanstack/react-query";
import { loadTransactions } from "../data/loader.js";

const getStaleTime = (season) => {
    if (Number(season) >= 2025) {
        return 1000 * 60 * 5; // 5 minutes
    }
    return 1000 * 60 * 60 * 24; // 24 hours
};

export function useTransactions(season) {
    const staleTime = getStaleTime(season);

    const query = useQuery({
        queryKey: ["transactions", season],
        queryFn: () => loadTransactions(season),
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
