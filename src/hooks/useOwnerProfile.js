import { useQuery, useQueries } from "@tanstack/react-query";
import { loadManifest, loadAllTime, loadSeasonSummary, loadTransactions } from "../data/loader.js";

export function useOwnerProfile() {
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

    const allSeasonData = {};
    const allTransactions = {};
    seasons.forEach((year, idx) => {
        if (seasonQueries[idx].data) allSeasonData[year] = seasonQueries[idx].data;
        if (transactionQueries[idx].data) allTransactions[year] = transactionQueries[idx].data;
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
