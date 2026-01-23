import { useQuery } from "@tanstack/react-query";
import { loadWeekData, loadPlayerStatsFull } from "../data/loader";
import type { WeeklyChunk, PlayerStatsRow } from "../schemas/index";

function getStaleTime(season: number | string | undefined): number {
    if (Number(season) >= 2025) {
        return 1000 * 60 * 5; // 5 minutes
    }
    return 1000 * 60 * 60 * 24; // 24 hours
}

export interface UseMatchupsResult {
    weekData: WeeklyChunk | null | undefined;
    fullStatsRows: PlayerStatsRow[];
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
}

export function useMatchups(season: number | undefined, week: number | undefined): UseMatchupsResult {
    const staleTime = getStaleTime(season);

    const weekDataQuery = useQuery({
        queryKey: ["weekData", season, week],
        queryFn: () => loadWeekData(season!, week!),
        staleTime,
        enabled: !!season && !!week,
    });

    const fullStatsQuery = useQuery({
        queryKey: ["playerStatsFull", season],
        queryFn: () => loadPlayerStatsFull(season!),
        staleTime,
        enabled: !!season,
    });

    return {
        weekData: weekDataQuery.data,
        fullStatsRows: fullStatsQuery.data?.rows || [],
        isLoading: weekDataQuery.isLoading || fullStatsQuery.isLoading,
        isError: weekDataQuery.isError || fullStatsQuery.isError,
        error: weekDataQuery.error || fullStatsQuery.error,
    };
}
