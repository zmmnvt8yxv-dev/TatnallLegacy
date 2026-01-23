import { useQuery } from "@tanstack/react-query";
import { loadWeekData, loadPlayerStatsFull } from "../data/loader.js";

export function useMatchupDetail(season, week) {
    const weekDataQuery = useQuery({
        queryKey: ["weekData", season, week],
        queryFn: () => loadWeekData(Number(season), Number(week)),
        enabled: !!season && !!week,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const fullStatsQuery = useQuery({
        queryKey: ["playerStatsFull", season],
        queryFn: () => loadPlayerStatsFull(Number(season)),
        enabled: !!season,
        staleTime: 1000 * 60 * 60 * 24,
    });

    return {
        weekData: weekDataQuery.data,
        fullStatsRows: fullStatsQuery.data?.rows || fullStatsQuery.data || [],
        isLoading: weekDataQuery.isLoading || fullStatsQuery.isLoading,
        isError: weekDataQuery.isError || fullStatsQuery.isError,
    };
}
