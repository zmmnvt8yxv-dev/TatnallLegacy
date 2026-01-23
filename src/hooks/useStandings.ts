import { useQuery, useQueries } from "@tanstack/react-query";
import { loadSeasonSummary, loadAllTime } from "../data/loader";
import type { SeasonSummary, AllTime } from "../schemas/index";

function getStaleTime(season: number | string | undefined): number {
    if (Number(season) >= 2025) {
        return 1000 * 60 * 5; // 5 minutes
    }
    return 1000 * 60 * 60 * 24; // 24 hours
}

export interface UseStandingsResult {
    seasonSummary: SeasonSummary | null | undefined;
    allSummaries: SeasonSummary[];
    records: AllTime | null | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
}

export function useStandings(season: number | undefined, allSeasons: number[] = []): UseStandingsResult {
    const staleTime = getStaleTime(season);

    const seasonQuery = useQuery({
        queryKey: ["seasonSummary", season],
        queryFn: () => loadSeasonSummary(season!),
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

    const anySummaryLoading = allSeasonQueries.some((q) => q.isLoading);

    return {
        seasonSummary: seasonQuery.data,
        allSummaries: allSeasonQueries.map((q) => q.data).filter((d): d is SeasonSummary => d != null),
        records: recordsQuery.data,

        isLoading: seasonQuery.isLoading || anySummaryLoading || recordsQuery.isLoading,
        isError: seasonQuery.isError || allSeasonQueries.some(q => q.isError) || recordsQuery.isError,
        error: seasonQuery.error || recordsQuery.error,
    };
}
