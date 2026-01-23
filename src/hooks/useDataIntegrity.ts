/**
 * useDataIntegrity Hook
 *
 * Phase 3: Fetches and validates the data integrity report with proper schema validation.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { safeUrl } from "../lib/url";
import {
  IntegrityReportSchema,
  type IntegrityReport,
  validate,
} from "../schemas";
import { logValidationError, logDataLoadError } from "../services/monitoring";

/**
 * Fetches the integrity report with validation
 */
async function fetchIntegrityReport(): Promise<IntegrityReport> {
  const url = safeUrl("data/integrity_report.json");

  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(`Report not found: ${res.status} ${res.statusText}`);
    logDataLoadError(url, error);
    throw error;
  }

  const rawData = await res.json();

  // Validate against schema
  const result = validate(IntegrityReportSchema, rawData, "integrity_report");

  if (!result.success) {
    logValidationError(result, "integrity_report", rawData);
    // Return raw data with type assertion for backwards compatibility
    // but log the validation error for monitoring
    console.warn("INTEGRITY_REPORT_VALIDATION_WARNING", result.issues.slice(0, 5));
    return rawData as IntegrityReport;
  }

  return result.data;
}

/**
 * Hook to fetch and validate the data integrity report
 */
export function useDataIntegrity(): UseQueryResult<IntegrityReport, Error> {
  return useQuery({
    queryKey: ["integrityReport"],
    queryFn: fetchIntegrityReport,
    staleTime: 1000 * 60 * 6, // 6 minutes
    retry: 1, // Only retry once for missing reports
  });
}

// Re-export the type for convenience
export type { IntegrityReport };
