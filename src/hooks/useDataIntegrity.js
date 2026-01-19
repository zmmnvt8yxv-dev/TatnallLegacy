import { useQuery } from "@tanstack/react-query";
import { safeUrl } from "../lib/url.js";

export function useDataIntegrity() {
    return useQuery({
        queryKey: ["integrityReport"],
        queryFn: async () => {
            const res = await fetch(safeUrl("data/integrity_report.json"));
            if (!res.ok) throw new Error("Report not found");
            return res.json();
        },
        staleTime: 1000 * 60 * 6, // 6 minutes
    });
}
