/**
 * Configuration Validation Module
 *
 * Phase 3: Provides runtime validation of environment variables and app configuration.
 * Fails fast on missing required config to catch issues at startup.
 */
import { z } from "zod";

// =============================================================================
// ENVIRONMENT ACCESS HELPERS
// =============================================================================

/**
 * Safe accessor for import.meta.env that works in both Vite and Jest environments
 * The babel-plugin-transform-import-meta transforms import.meta at build time
 */
function getEnv(): Record<string, unknown> {
  // In test environment, use the global mock (set up in src/__tests__/setup.js)
  const globalImport = (globalThis as Record<string, unknown>).import as
    | { meta: { env: Record<string, unknown> } }
    | undefined;
  if (globalImport?.meta?.env) {
    return globalImport.meta.env;
  }

  // Fallback for Node/SSR environments where import.meta might not be available
  // This is used during Jest testing or server-side rendering
  return {
    DEV: process.env.NODE_ENV !== "production",
    MODE: process.env.NODE_ENV || "development",
    BASE_URL: process.env.BASE_URL || "/TatnallLegacy/",
    VITE_SENTRY_DSN: process.env.VITE_SENTRY_DSN,
    VITE_GA4_ID: process.env.VITE_GA4_ID,
    CAPACITOR: process.env.CAPACITOR,
  };
}

// =============================================================================
// ENVIRONMENT VARIABLE SCHEMAS
// =============================================================================

/**
 * Schema for Sentry DSN - valid format or placeholder
 * Placeholders are detected and Sentry is disabled gracefully
 */
const SentryDsnSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val || val.includes("placeholder")) {
      return null;
    }
    return val;
  });

/**
 * Schema for Google Analytics ID
 * Valid format: G-XXXXXXXXXX
 */
const GA4IdSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val || val.includes("PLACEHOLDER")) {
      return null;
    }
    // Basic GA4 format validation
    if (val && !val.startsWith("G-")) {
      console.warn("CONFIG_WARNING: GA4 ID should start with 'G-':", val);
    }
    return val;
  });

/**
 * Schema for base URL configuration
 */
const BaseUrlSchema = z.string().default("/TatnallLegacy/");

/**
 * Full environment configuration schema
 */
const EnvConfigSchema = z.object({
  // Required configuration
  baseUrl: BaseUrlSchema,

  // Optional services (gracefully disabled if not configured)
  sentryDsn: SentryDsnSchema,
  ga4Id: GA4IdSchema,

  // Runtime flags
  isDev: z.boolean().default(false),
  isCapacitor: z.boolean().default(false),
});

export type EnvConfig = z.infer<typeof EnvConfigSchema>;

// =============================================================================
// CONFIGURATION STATE
// =============================================================================

let _config: EnvConfig | null = null;
let _validated = false;

// =============================================================================
// VALIDATION RESULTS TRACKING
// =============================================================================

export interface ConfigValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface ConfigValidationResult {
  isValid: boolean;
  config: EnvConfig | null;
  issues: ConfigValidationIssue[];
  warnings: string[];
}

// =============================================================================
// CORE VALIDATION FUNCTION
// =============================================================================

/**
 * Validates environment configuration
 * Returns structured result with issues and warnings
 */
export function validateEnvConfig(rawConfig: unknown): ConfigValidationResult {
  const issues: ConfigValidationIssue[] = [];
  const warnings: string[] = [];

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

  // Add warnings for missing optional services
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

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initializes and validates the application configuration
 * Should be called once at app startup, before rendering
 *
 * @param options.failOnError - If true, throws on validation errors (default: true in production)
 * @returns The validated configuration
 */
export function initConfig(
  options: { failOnError?: boolean } = {}
): EnvConfig {
  if (_validated && _config) {
    return _config;
  }

  const env = getEnv();
  const envIsDev = env.DEV === true;
  const failOnError = options.failOnError ?? !envIsDev;

  // Collect raw configuration from environment
  const rawConfig = {
    baseUrl: (env.BASE_URL as string) || "/TatnallLegacy/",
    sentryDsn: env.VITE_SENTRY_DSN as string | undefined,
    ga4Id: env.VITE_GA4_ID as string | undefined,
    isDev: envIsDev,
    isCapacitor: Boolean(env.CAPACITOR),
  };

  const result = validateEnvConfig(rawConfig);

  // Log validation results
  if (result.issues.length > 0) {
    console.error("CONFIG_VALIDATION_ERRORS:", result.issues);
    if (failOnError) {
      throw new Error(
        `Configuration validation failed: ${result.issues.map((i) => i.message).join(", ")}`
      );
    }
  }

  // Suppress config warnings in production - these are expected for optional services

  if (!result.config) {
    throw new Error("Configuration validation failed - no config returned");
  }

  _config = result.config;
  _validated = true;

  // Config initialized - suppress log in production

  return _config;
}

// =============================================================================
// CONFIG ACCESSORS
// =============================================================================

/**
 * Gets the current configuration
 * Throws if config has not been initialized
 */
export function getConfig(): EnvConfig {
  if (!_config) {
    throw new Error(
      "Configuration not initialized. Call initConfig() before accessing config."
    );
  }
  return _config;
}

/**
 * Checks if Sentry is properly configured
 */
export function isSentryConfigured(): boolean {
  return Boolean(_config?.sentryDsn);
}

/**
 * Checks if Google Analytics is properly configured
 */
export function isAnalyticsConfigured(): boolean {
  return Boolean(_config?.ga4Id);
}

/**
 * Gets the Sentry DSN if configured
 */
export function getSentryDsn(): string | null {
  return _config?.sentryDsn ?? null;
}

/**
 * Gets the GA4 ID if configured
 */
export function getGA4Id(): string | null {
  return _config?.ga4Id ?? null;
}

/**
 * Checks if running in development mode
 */
export function isDev(): boolean {
  if (_config) {
    return _config.isDev;
  }
  const env = getEnv();
  return env.DEV === true;
}

/**
 * Checks if running in Capacitor (mobile) mode
 */
export function isCapacitor(): boolean {
  return _config?.isCapacitor ?? false;
}

// =============================================================================
// RESET (for testing)
// =============================================================================

/**
 * Resets configuration state (for testing only)
 */
export function resetConfig(): void {
  _config = null;
  _validated = false;
}
