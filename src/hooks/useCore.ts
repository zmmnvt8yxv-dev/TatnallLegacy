import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { loadCoreData, type CoreDataResult } from "../data/loader";

export function useCore(enabled = true): UseQueryResult<CoreDataResult, Error> {
    return useQuery({
        queryKey: ["core"],
        queryFn: loadCoreData,
        staleTime: 1000 * 60 * 30, // 30 minutes
        enabled,
    });
}
