import { useQuery, useQueries } from "@tanstack/react-query";
import { loadManifest, loadSeasonSummary, loadWeekData } from "../data/loader.js";

export function useHeadToHeadData(ownerA, ownerB) {
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
            const weeks = weeksBySeason[season] || Array.from({ length: 18 }, (_, i) => i + 1);
            return weeks.map(week => ({
                queryKey: ["weekData", season, week],
                queryFn: () => loadWeekData(season, week),
                staleTime: 1000 * 60 * 60 * 24,
            }));
        }) : []
    });

    const allSeasonData = {};
    seasons.forEach((s, idx) => {
        if (seasonSummaryQueries[idx].data) allSeasonData[s] = seasonSummaryQueries[idx].data;
    });

    const allWeekData = allWeekQueries.map(q => q.data).filter(Boolean);

    return {
        manifest: manifestQuery.data,
        allSeasonData,
        allWeekData,
        isLoading: manifestQuery.isLoading || seasonSummaryQueries.some(q => q.isLoading) || (enabled && allWeekQueries.some(q => q.isLoading)),
        isError: manifestQuery.isError || seasonSummaryQueries.some(q => q.isError),
    };
}
