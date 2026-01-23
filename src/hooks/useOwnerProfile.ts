import { useQuery, useQueries } from "@tanstack/react-query";
import { loadManifest, loadAllTime, loadSeasonSummary, loadTransactions } from "../data/loader";
import type { Manifest, AllTime, SeasonSummary, Transactions } from "../schemas/index";

export interface UseOwnerProfileResult {
    manifest: Manifest | undefined;
    allSeasonData: Record<number, SeasonSummary>;
    allTransactions: Record<number, Transactions>;
    allTimeData: AllTime | null | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
}

export function useOwnerProfile(): UseOwnerProfileResult {
    const manifestQuery = useQuery({
        queryKey: ["manifest"],
        queryFn: loadManifest,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const allTimeQuery = useQuery({
        queryKey: ["allTimeRecords"],
        queryFn: loadAllTime,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const seasons = manifestQuery.data?.seasons || [];

    const seasonQueries = useQueries({
        queries: seasons.map((year) => ({
            queryKey: ["seasonSummary", year],
            queryFn: () => loadSeasonSummary(year),
            staleTime: 1000 * 60 * 60 * 24,
        })),
    });

    const transactionQueries = useQueries({
        queries: seasons.map((year) => ({
            queryKey: ["transactions", year],
            queryFn: () => loadTransactions(year),
            staleTime: 1000 * 60 * 60 * 24,
        })),
    });

    const isLoading =
        manifestQuery.isLoading ||
        allTimeQuery.isLoading ||
        (seasons.length > 0 && (seasonQueries.some(q => q.isLoading) || transactionQueries.some(q => q.isLoading)));

    const isError =
        manifestQuery.isError ||
        allTimeQuery.isError ||
        seasonQueries.some(q => q.isError) ||
        transactionQueries.some(q => q.isError);

    const allSeasonData: Record<number, SeasonSummary> = {};
    const allTransactions: Record<number, Transactions> = {};
    seasons.forEach((year, idx) => {
        const seasonData = seasonQueries[idx]?.data;
        const transData = transactionQueries[idx]?.data;
        if (seasonData) allSeasonData[year] = seasonData;
        if (transData) allTransactions[year] = transData;
    });

    return {
        manifest: manifestQuery.data,
        allSeasonData,
        allTransactions,
        allTimeData: allTimeQuery.data,
        isLoading,
        isError,
        error: manifestQuery.error || allTimeQuery.error,
    };
}
