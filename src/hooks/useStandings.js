import { useQuery, useQueries } from "@tanstack/react-query";
import { loadSeasonSummary, loadAllTime } from "../data/loader.js";

const getStaleTime = (season) => {
    if (Number(season) >= 2025) {
        return 1000 * 60 * 5; // 5 minutes
    }
    return 1000 * 60 * 60 * 24; // 24 hours
};

export function useStandings(season, allSeasons = []) {
    const staleTime = getStaleTime(season);

    const seasonQuery = useQuery({
        queryKey: ["seasonSummary", season],
        queryFn: () => loadSeasonSummary(season),
        staleTime,
        enabled: !!season,
    });

    const allSeasonQueries = useQueries({
        queries: allSeasons.map((yr) => ({
            queryKey: ["seasonSummary", yr],
            queryFn: () => loadSeasonSummary(yr),
            staleTime: getStaleTime(yr),
        })),
    });

    const recordsQuery = useQuery({
        queryKey: ["allTimeRecords"],
        queryFn: () => loadAllTime(),
        staleTime: 1000 * 60 * 60 * 24, // 24 hours
    });

    const allSummariesLoaded = allSeasonQueries.every((q) => q.isSuccess);
    const anySummaryLoading = allSeasonQueries.some((q) => q.isLoading);

    return {
        seasonSummary: seasonQuery.data,
        allSummaries: allSeasonQueries.map((q) => q.data).filter(Boolean),
        records: recordsQuery.data,

        isLoading: seasonQuery.isLoading || anySummaryLoading || recordsQuery.isLoading,
        isError: seasonQuery.isError || allSeasonQueries.some(q => q.isError) || recordsQuery.isError,
        error: seasonQuery.error || recordsQuery.error,
    };
}
