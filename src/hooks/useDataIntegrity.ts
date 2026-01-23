import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { safeUrl } from "../lib/url";

export interface IntegrityReport {
    timestamp?: string;
    checks?: Array<{
        name: string;
        status: "pass" | "fail" | "warning";
        message?: string;
    }>;
    [key: string]: unknown;
}

export function useDataIntegrity(): UseQueryResult<IntegrityReport, Error> {
    return useQuery({
        queryKey: ["integrityReport"],
        queryFn: async (): Promise<IntegrityReport> => {
            const res = await fetch(safeUrl("data/integrity_report.json"));
            if (!res.ok) throw new Error("Report not found");
            return res.json();
        },
        staleTime: 1000 * 60 * 6, // 6 minutes
    });
}
