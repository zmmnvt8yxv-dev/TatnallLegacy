/**
 * Tests for Configuration Validation Module
 *
 * Phase 3: Tests for config validation and env var handling
 *
 * Note: We test the validation logic directly without importing the full config module
 * because it uses import.meta.env which requires Vite's compile-time transform.
 */

import { z } from "zod";
import {
  IntegrityReportSchema,
  validate,
} from "../schemas";

// Recreate the validation schemas for testing (same as in config/index.ts)
const SentryDsnSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val || val.includes("placeholder")) {
      return null;
    }
    return val;
  });

const GA4IdSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val || val.includes("PLACEHOLDER")) {
      return null;
    }
    return val;
  });

const BaseUrlSchema = z.string().default("/TatnallLegacy/");

const EnvConfigSchema = z.object({
  baseUrl: BaseUrlSchema,
  sentryDsn: SentryDsnSchema,
  ga4Id: GA4IdSchema,
  isDev: z.boolean().default(false),
  isCapacitor: z.boolean().default(false),
});

function validateEnvConfig(rawConfig) {
  const issues = [];
  const warnings = [];

  const result = EnvConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    result.error.issues.forEach((issue) => {
      issues.push({
        field: issue.path.join(".") || "(root)",
        message: issue.message,
        severity: "error",
      });
    });

    return {
      isValid: false,
      config: null,
      issues,
      warnings,
    };
  }

  const config = result.data;

  if (!config.sentryDsn) {
    warnings.push(
      "Sentry DSN not configured - error tracking disabled. Set VITE_SENTRY_DSN in environment."
    );
  }

  if (!config.ga4Id) {
    warnings.push(
      "Google Analytics not configured - analytics disabled. Set VITE_GA4_ID in environment."
    );
  }

  return {
    isValid: true,
    config,
    issues,
    warnings,
  };
}

describe("Configuration Validation", () => {
  describe("validateEnvConfig", () => {
    it("should validate a complete valid configuration", () => {
      const rawConfig = {
        baseUrl: "/TatnallLegacy/",
        sentryDsn: "https://abc123@sentry.io/12345",
        ga4Id: "G-ABC123XYZ",
        isDev: false,
        isCapacitor: false,
      };

      const result = validateEnvConfig(rawConfig);

      expect(result.isValid).toBe(true);
      expect(result.config).not.toBeNull();
      expect(result.config.baseUrl).toBe("/TatnallLegacy/");
      expect(result.config.sentryDsn).toBe("https://abc123@sentry.io/12345");
      expect(result.config.ga4Id).toBe("G-ABC123XYZ");
      expect(result.issues).toHaveLength(0);
    });

    it("should transform placeholder Sentry DSN to null", () => {
      const rawConfig = {
        baseUrl: "/TatnallLegacy/",
        sentryDsn: "https://placeholder-dsn@sentry.io/placeholder",
        isDev: false,
        isCapacitor: false,
      };

      const result = validateEnvConfig(rawConfig);

      expect(result.isValid).toBe(true);
      expect(result.config.sentryDsn).toBeNull();
      expect(result.warnings.some(w => w.includes("Sentry DSN not configured"))).toBe(true);
    });

    it("should transform PLACEHOLDER GA4 ID to null", () => {
      const rawConfig = {
        baseUrl: "/TatnallLegacy/",
        ga4Id: "G-PLACEHOLDER",
        isDev: false,
        isCapacitor: false,
      };

      const result = validateEnvConfig(rawConfig);

      expect(result.isValid).toBe(true);
      expect(result.config.ga4Id).toBeNull();
      expect(result.warnings.some(w => w.includes("Google Analytics not configured"))).toBe(true);
    });

    it("should handle undefined optional values", () => {
      const rawConfig = {
        baseUrl: "/TatnallLegacy/",
        isDev: true,
        isCapacitor: false,
      };

      const result = validateEnvConfig(rawConfig);

      expect(result.isValid).toBe(true);
      expect(result.config.sentryDsn).toBeNull();
      expect(result.config.ga4Id).toBeNull();
    });

    it("should use default baseUrl when not provided", () => {
      const rawConfig = {
        isDev: false,
        isCapacitor: false,
      };

      const result = validateEnvConfig(rawConfig);

      expect(result.isValid).toBe(true);
      expect(result.config.baseUrl).toBe("/TatnallLegacy/");
    });
  });
});

describe("Integrity Report Schema", () => {
  it("should validate a complete integrity report", () => {
    const report = {
      generated_at: "2026-01-23T10:00:00Z",
      overall_status: "ok",
      players: {
        total_players: 500,
        id_type_distribution: {
          sleeper: 450,
          espn: 400,
          gsis: 350,
        },
      },
      manifest: {
        seasons: [2024, 2025],
        path_count: 15,
      },
      seasons: {
        "2024": {
          status: "ok",
          team_count: 12,
          matchup_count: 84,
          lineup_count: 1008,
          issues: [],
        },
        "2025": {
          status: "warning",
          team_count: 12,
          issues: ["Missing 5 player IDs"],
        },
      },
      weekly_summary: {
        "2024": {
          total_matchups: 84,
          total_lineups: 1008,
          issues: {
            missing_player_id: 0,
          },
        },
      },
      transactions: {
        "2024": {
          entry_count: 150,
          type_distribution: {
            add: 100,
            drop: 45,
            trade: 5,
          },
          missing_player_names: 2,
        },
      },
    };

    const result = validate(IntegrityReportSchema, report, "integrity_report");

    expect(result.success).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("should validate minimal integrity report", () => {
    const report = {
      generated_at: "2026-01-23T10:00:00Z",
      overall_status: "unknown",
    };

    const result = validate(IntegrityReportSchema, report, "integrity_report");

    expect(result.success).toBe(true);
  });

  it("should accept all valid status values", () => {
    const statuses = ["ok", "warning", "error", "unknown"];

    for (const status of statuses) {
      const report = {
        generated_at: "2026-01-23T10:00:00Z",
        overall_status: status,
      };

      const result = validate(IntegrityReportSchema, report, "integrity_report");
      expect(result.success).toBe(true);
    }
  });

  it("should fail for invalid status value", () => {
    const report = {
      generated_at: "2026-01-23T10:00:00Z",
      overall_status: "invalid_status",
    };

    const result = validate(IntegrityReportSchema, report, "integrity_report");

    expect(result.success).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("should fail for missing required fields", () => {
    const report = {
      overall_status: "ok",
      // missing generated_at
    };

    const result = validate(IntegrityReportSchema, report, "integrity_report");

    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.includes("generated_at"))).toBe(true);
  });
});
