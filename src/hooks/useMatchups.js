import { useQuery } from "@tanstack/react-query";
import { loadWeekData, loadPlayerStatsFull } from "../data/loader.js";

const getStaleTime = (season) => {
    const currentYear = new Date().getFullYear();
    if (Number(season) >= 2025) {
        return 1000 * 60 * 5; // 5 minutes
    }
    return 1000 * 60 * 60 * 24; // 24 hours
};

export function useMatchups(season, week) {
    const staleTime = getStaleTime(season);

    const weekDataQuery = useQuery({
        queryKey: ["weekData", season, week],
        queryFn: () => loadWeekData(season, week),
        staleTime,
        enabled: !!season && !!week,
    });

    const fullStatsQuery = useQuery({
        queryKey: ["playerStatsFull", season],
        queryFn: () => loadPlayerStatsFull(season),
        staleTime,
        enabled: !!season,
    });

    return {
        weekData: weekDataQuery.data,
        fullStatsRows: fullStatsQuery.data?.rows || fullStatsQuery.data || [],
        isLoading: weekDataQuery.isLoading || fullStatsQuery.isLoading,
        isError: weekDataQuery.isError || fullStatsQuery.isError,
        error: weekDataQuery.error || fullStatsQuery.error,
    };
}
