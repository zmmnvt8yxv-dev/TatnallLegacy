/**
 * Monitoring Service
 *
 * Phase 3: Centralized error tracking and data integrity monitoring.
 * Integrates with Sentry when configured, provides structured logging otherwise.
 */
import * as Sentry from "@sentry/react";
import { isSentryConfigured, isDev } from "../config";
import type { ValidationResult } from "../schemas";

// =============================================================================
// TYPES
// =============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

export interface ValidationErrorContext {
  schema: string;
  context: string;
  issues: string[];
  data?: unknown;
}

export interface DataIntegrityEvent {
  type: "validation_error" | "load_error" | "missing_data" | "schema_mismatch";
  context: string;
  details: Record<string, unknown>;
  timestamp: string;
}

// =============================================================================
// EVENT BUFFER (for batch reporting)
// =============================================================================

const EVENT_BUFFER: DataIntegrityEvent[] = [];
const MAX_BUFFER_SIZE = 100;

// =============================================================================
// CORE LOGGING
// =============================================================================

/**
 * Logs a message with structured context
 */
export function log(
  level: LogLevel,
  tag: string,
  message: string,
  context?: LogContext
): void {
  const timestamp = new Date().toISOString();
  const logFn = console[level] || console.log;

  if (context) {
    logFn(`[${timestamp}] ${tag}: ${message}`, context);
  } else {
    logFn(`[${timestamp}] ${tag}: ${message}`);
  }

  // Send to Sentry for errors and warnings
  if (isSentryConfigured() && (level === "error" || level === "warn")) {
    Sentry.addBreadcrumb({
      category: tag,
      message,
      level: level === "error" ? "error" : "warning",
      data: context,
    });
  }
}

// =============================================================================
// ERROR TRACKING
// =============================================================================

/**
 * Captures an error and sends to Sentry if configured
 */
export function captureError(
  error: Error,
  context?: LogContext
): void {
  log("error", "ERROR", error.message, { ...context, stack: error.stack });

  if (isSentryConfigured()) {
    Sentry.captureException(error, {
      extra: context,
    });
  }
}

/**
 * Captures a message-level event
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = "info",
  context?: LogContext
): void {
  log(level === "error" ? "error" : level === "warning" ? "warn" : "info", "MESSAGE", message, context);

  if (isSentryConfigured()) {
    Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  }
}

// =============================================================================
// VALIDATION ERROR TRACKING
// =============================================================================

/**
 * Logs a validation error with full context
 * Sends to Sentry if configured, otherwise logs to console
 */
export function logValidationError<T>(
  result: ValidationResult<T>,
  context: string,
  originalData?: unknown
): void {
  if (result.success) return;

  const errorContext: ValidationErrorContext = {
    schema: context,
    context,
    issues: result.issues,
    data: isDev() ? originalData : undefined, // Only include data in dev
  };

  log("error", "VALIDATION_ERROR", `Schema validation failed: ${context}`, errorContext);

  // Buffer the event
  bufferIntegrityEvent({
    type: "validation_error",
    context,
    details: {
      issueCount: result.issues.length,
      firstIssues: result.issues.slice(0, 5),
    },
    timestamp: new Date().toISOString(),
  });

  if (isSentryConfigured()) {
    Sentry.captureMessage(`Validation error: ${context}`, {
      level: "warning",
      extra: {
        issues: result.issues.slice(0, 10),
        issueCount: result.issues.length,
      },
      tags: {
        validation_context: context,
      },
    });
  }
}

/**
 * Logs validation warnings (soft failures)
 */
export function logValidationWarning(
  context: string,
  issues: string[]
): void {
  if (issues.length === 0) return;

  log("warn", "VALIDATION_WARNING", `Validation warnings for ${context}`, {
    issueCount: issues.length,
    issues: issues.slice(0, 5),
  });

  bufferIntegrityEvent({
    type: "schema_mismatch",
    context,
    details: {
      issueCount: issues.length,
      issues: issues.slice(0, 5),
    },
    timestamp: new Date().toISOString(),
  });
}

// =============================================================================
// DATA INTEGRITY EVENTS
// =============================================================================

/**
 * Buffers a data integrity event for batch reporting
 */
function bufferIntegrityEvent(event: DataIntegrityEvent): void {
  EVENT_BUFFER.push(event);

  // Prevent unbounded growth
  if (EVENT_BUFFER.length > MAX_BUFFER_SIZE) {
    EVENT_BUFFER.shift();
  }
}

/**
 * Logs a data load error
 */
export function logDataLoadError(
  url: string,
  error: Error,
  context?: LogContext
): void {
  log("error", "DATA_LOAD_ERROR", `Failed to load: ${url}`, {
    ...context,
    error: error.message,
  });

  bufferIntegrityEvent({
    type: "load_error",
    context: url,
    details: {
      errorMessage: error.message,
      ...context,
    },
    timestamp: new Date().toISOString(),
  });

  if (isSentryConfigured()) {
    Sentry.captureException(error, {
      extra: { url, ...context },
      tags: { data_url: url },
    });
  }
}

/**
 * Logs missing data
 */
export function logMissingData(
  context: string,
  missingKeys: string[]
): void {
  log("warn", "DATA_MISSING_KEYS", `Missing data in ${context}`, {
    missingKeys,
  });

  bufferIntegrityEvent({
    type: "missing_data",
    context,
    details: { missingKeys },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Gets buffered integrity events (for DataIntegrityPage)
 */
export function getBufferedEvents(): DataIntegrityEvent[] {
  return [...EVENT_BUFFER];
}

/**
 * Clears the event buffer
 */
export function clearEventBuffer(): void {
  EVENT_BUFFER.length = 0;
}

// =============================================================================
// PERFORMANCE TRACKING
// =============================================================================

/**
 * Starts a performance measurement
 */
export function startMeasure(name: string): () => number {
  const start = performance.now();

  return () => {
    const duration = performance.now() - start;

    if (isSentryConfigured()) {
      Sentry.addBreadcrumb({
        category: "performance",
        message: name,
        level: "info",
        data: { duration_ms: duration },
      });
    }

    return duration;
  };
}

// =============================================================================
// USER CONTEXT
// =============================================================================

/**
 * Sets user context for error tracking
 */
export function setUserContext(userId: string, extra?: LogContext): void {
  if (isSentryConfigured()) {
    Sentry.setUser({
      id: userId,
      ...extra,
    });
  }
}

/**
 * Clears user context
 */
export function clearUserContext(): void {
  if (isSentryConfigured()) {
    Sentry.setUser(null);
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initializes Sentry with the provided DSN
 */
export function initSentry(dsn: string): void {
  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Add data integrity context to all events
      event.contexts = {
        ...event.contexts,
        dataIntegrity: {
          bufferedEventCount: EVENT_BUFFER.length,
          recentEventTypes: EVENT_BUFFER.slice(-5).map((e) => e.type),
        },
      };
      return event;
    },
  });

  log("info", "SENTRY_INIT", "Sentry initialized successfully");
}

/**
 * Initializes monitoring with optional Sentry
 */
export function initMonitoring(sentryDsn: string | null): void {
  if (sentryDsn) {
    initSentry(sentryDsn);
  }
  // Sentry not configured is expected - no need to log

  // Set up global error handlers
  window.addEventListener("unhandledrejection", (event) => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));

    captureError(error, { type: "unhandledrejection" });
  });

  window.addEventListener("error", (event) => {
    captureError(event.error || new Error(event.message), {
      type: "uncaughtError",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });
}
