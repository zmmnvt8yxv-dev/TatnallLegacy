import { useQuery, useQueries } from "@tanstack/react-query";
import { loadManifest, loadSeasonSummary, loadWeekData } from "../data/loader";
import type { Manifest, SeasonSummary, WeeklyChunk } from "../schemas/index";

export interface UseHeadToHeadDataResult {
    manifest: Manifest | undefined;
    allSeasonData: Record<number, SeasonSummary>;
    allWeekData: WeeklyChunk[];
    isLoading: boolean;
    isError: boolean;
}

export function useHeadToHeadData(ownerA: string | undefined, ownerB: string | undefined): UseHeadToHeadDataResult {
    const manifestQuery = useQuery({
        queryKey: ["manifest"],
        queryFn: loadManifest,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const seasons = manifestQuery.data?.seasons || [];
    const weeksBySeason = manifestQuery.data?.weeksBySeason || {};

    const seasonSummaryQueries = useQueries({
        queries: seasons.map(s => ({
            queryKey: ["seasonSummary", s],
            queryFn: () => loadSeasonSummary(s),
            staleTime: 1000 * 60 * 60 * 24,
        }))
    });

    // We only want to load week data if owners are selected
    const enabled = !!ownerA && !!ownerB;

    const allWeekQueries = useQueries({
        queries: enabled ? seasons.flatMap(season => {
            const weeks = weeksBySeason[String(season)] || Array.from({ length: 18 }, (_, i) => i + 1);
            return weeks.map(week => ({
                queryKey: ["weekData", season, week],
                queryFn: () => loadWeekData(season, week),
                staleTime: 1000 * 60 * 60 * 24,
            }));
        }) : []
    });

    const allSeasonData: Record<number, SeasonSummary> = {};
    seasons.forEach((s, idx) => {
        const data = seasonSummaryQueries[idx]?.data;
        if (data) allSeasonData[s] = data;
    });

    const allWeekData = allWeekQueries.map(q => q.data).filter((d): d is WeeklyChunk => d != null);

    return {
        manifest: manifestQuery.data,
        allSeasonData,
        allWeekData,
        isLoading: manifestQuery.isLoading || seasonSummaryQueries.some(q => q.isLoading) || (enabled && allWeekQueries.some(q => q.isLoading)),
        isError: manifestQuery.isError || seasonSummaryQueries.some(q => q.isError),
    };
}
