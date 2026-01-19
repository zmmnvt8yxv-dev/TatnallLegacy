import { useQuery, useQueries } from "@tanstack/react-query";
import { loadManifest, loadAllTime, loadSeasonSummary } from "../data/loader.js";

export function useRecords() {
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

    const isLoading =
        manifestQuery.isLoading ||
        allTimeQuery.isLoading ||
        (seasons.length > 0 && seasonQueries.some((q) => q.isLoading));

    const isError =
        manifestQuery.isError ||
        allTimeQuery.isError ||
        seasonQueries.some((q) => q.isError);

    const allSeasonData = {};
    seasons.forEach((year, idx) => {
        if (seasonQueries[idx].data) {
            allSeasonData[year] = seasonQueries[idx].data;
        }
    });

    return {
        manifest: manifestQuery.data,
        allSeasonData,
        allTimeData: allTimeQuery.data,
        isLoading,
        isError,
        error: manifestQuery.error || allTimeQuery.error,
    };
}
