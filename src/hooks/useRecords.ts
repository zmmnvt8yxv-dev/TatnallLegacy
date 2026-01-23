import { useQuery, useQueries } from "@tanstack/react-query";
import { loadManifest, loadAllTime, loadSeasonSummary } from "../data/loader";
import type { Manifest, AllTime, SeasonSummary } from "../schemas/index";

export interface UseRecordsResult {
    manifest: Manifest | undefined;
    allSeasonData: Record<number, SeasonSummary>;
    allTimeData: AllTime | null | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
}

export function useRecords(): UseRecordsResult {
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

    const allSeasonData: Record<number, SeasonSummary> = {};
    seasons.forEach((year, idx) => {
        const data = seasonQueries[idx]?.data;
        if (data) {
            allSeasonData[year] = data;
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
