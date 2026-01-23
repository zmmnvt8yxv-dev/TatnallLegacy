import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { loadManifest } from "../data/loader";
import type { Manifest } from "../schemas/index";

export function useManifest(): UseQueryResult<Manifest, Error> {
    return useQuery({
        queryKey: ["manifest"],
        queryFn: loadManifest,
        staleTime: Infinity, // Manifest is static for the session
    });
}
