import { useQuery } from "@tanstack/react-query";
import { loadCoreData } from "../data/loader.js";

export function useCore() {
    return useQuery({
        queryKey: ["core"],
        queryFn: loadCoreData,
        staleTime: 1000 * 60 * 30, // 30 minutes
    });
}
