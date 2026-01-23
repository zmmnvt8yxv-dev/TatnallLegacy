import { useQuery } from "@tanstack/react-query";
import { loadManifest } from "../data/loader.js";

export function useManifest() {
    return useQuery({
        queryKey: ["manifest"],
        queryFn: loadManifest,
        staleTime: Infinity, // Manifest is static for the session
    });
}
