import { useQuery } from "@tanstack/react-query";
import { loadManifest, loadSeasonSummary } from "../data/loader.js";

export function useTeamsList(season) {
    const manifestQuery = useQuery({
        queryKey: ["manifest"],
        queryFn: loadManifest,
        staleTime: 1000 * 60 * 60 * 24,
    });

    const seasonDataQuery = useQuery({
        queryKey: ["seasonSummary", season],
        queryFn: () => loadSeasonSummary(season),
        enabled: !!season,
        staleTime: season === new Date().getFullYear() ? 1000 * 60 * 5 : 1000 * 60 * 60 * 24,
    });

    return {
        manifest: manifestQuery.data,
        seasonData: seasonDataQuery.data,
        isLoading: manifestQuery.isLoading || seasonDataQuery.isLoading,
        isError: manifestQuery.isError || seasonDataQuery.isError,
        error: manifestQuery.error || seasonDataQuery.error,
    };
}
