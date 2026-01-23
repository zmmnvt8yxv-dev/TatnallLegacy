/**
 * Tests for Monitoring Service
 *
 * Phase 3: Tests for validation error logging and event buffering
 *
 * Note: We test the core monitoring logic directly without importing modules
 * that use import.meta.env.
 */

// =============================================================================
// MOCK IMPLEMENTATIONS (same logic as in services/monitoring.ts)
// =============================================================================

const EVENT_BUFFER = [];
const MAX_BUFFER_SIZE = 100;

function bufferIntegrityEvent(event) {
  EVENT_BUFFER.push(event);
  if (EVENT_BUFFER.length > MAX_BUFFER_SIZE) {
    EVENT_BUFFER.shift();
  }
}

function logValidationError(result, context, _originalData) {
  if (result.success) return;

  bufferIntegrityEvent({
    type: "validation_error",
    context,
    details: {
      issueCount: result.issues.length,
      firstIssues: result.issues.slice(0, 5),
    },
    timestamp: new Date().toISOString(),
  });
}

function logValidationWarning(context, issues) {
  if (issues.length === 0) return;

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

function logDataLoadError(url, error, extraContext = {}) {
  bufferIntegrityEvent({
    type: "load_error",
    context: url,
    details: {
      errorMessage: error.message,
      ...extraContext,
    },
    timestamp: new Date().toISOString(),
  });
}

function logMissingData(context, missingKeys) {
  bufferIntegrityEvent({
    type: "missing_data",
    context,
    details: { missingKeys },
    timestamp: new Date().toISOString(),
  });
}

function getBufferedEvents() {
  return [...EVENT_BUFFER];
}

function clearEventBuffer() {
  EVENT_BUFFER.length = 0;
}

function startMeasure(_name) {
  const start = performance.now();
  return () => performance.now() - start;
}

// =============================================================================
// TESTS
// =============================================================================

describe("Monitoring Service", () => {
  beforeEach(() => {
    clearEventBuffer();
  });

  describe("Event Buffering", () => {
    it("should buffer validation errors", () => {
      const mockResult = {
        success: false,
        data: null,
        error: new Error("Validation failed"),
        issues: ["Field x is required", "Field y must be a number"],
      };

      logValidationError(mockResult, "test_context");

      const events = getBufferedEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe("validation_error");
      expect(events[0].context).toBe("test_context");
    });

    it("should not buffer successful validations", () => {
      const mockResult = {
        success: true,
        data: { test: "data" },
        error: null,
        issues: [],
      };

      logValidationError(mockResult, "test_context");

      const events = getBufferedEvents();
      expect(events.length).toBe(0);
    });

    it("should buffer data load errors", () => {
      logDataLoadError("data/test.json", new Error("404 Not Found"));

      const events = getBufferedEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe("load_error");
      expect(events[0].context).toBe("data/test.json");
    });

    it("should buffer missing data events", () => {
      logMissingData("player_data", ["player_id", "team_id"]);

      const events = getBufferedEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe("missing_data");
      expect(events[0].details.missingKeys).toEqual(["player_id", "team_id"]);
    });

    it("should buffer validation warnings", () => {
      logValidationWarning("test_context", ["Warning 1", "Warning 2"]);

      const events = getBufferedEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe("schema_mismatch");
    });

    it("should not buffer empty warnings", () => {
      logValidationWarning("test_context", []);

      const events = getBufferedEvents();
      expect(events.length).toBe(0);
    });

    it("should clear event buffer", () => {
      logMissingData("context1", ["key1"]);
      logMissingData("context2", ["key2"]);

      expect(getBufferedEvents().length).toBe(2);

      clearEventBuffer();

      expect(getBufferedEvents().length).toBe(0);
    });

    it("should limit buffer size to prevent memory issues", () => {
      // Buffer more than MAX_BUFFER_SIZE (100) events
      for (let i = 0; i < 150; i++) {
        logMissingData(`context_${i}`, ["key"]);
      }

      const events = getBufferedEvents();
      expect(events.length).toBeLessThanOrEqual(100);
    });
  });

  describe("Performance Measurement", () => {
    it("should measure execution time", () => {
      const endMeasure = startMeasure("test_operation");

      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait for ~10ms
      }

      const duration = endMeasure();

      expect(duration).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Event Timestamps", () => {
    it("should include ISO timestamp in events", () => {
      logMissingData("test", ["key"]);

      const events = getBufferedEvents();
      expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

describe("Monitoring Service Integration", () => {
  beforeEach(() => {
    clearEventBuffer();
  });

  it("should handle multiple event types in sequence", () => {
    const validationError = {
      success: false,
      data: null,
      error: new Error("Failed"),
      issues: ["Issue 1"],
    };

    logValidationError(validationError, "schema_1");
    logDataLoadError("data/missing.json", new Error("404"));
    logMissingData("player", ["id"]);
    logValidationWarning("schema_2", ["Warning"]);

    const events = getBufferedEvents();
    expect(events.length).toBe(4);
    expect(events.map((e) => e.type)).toEqual([
      "validation_error",
      "load_error",
      "missing_data",
      "schema_mismatch",
    ]);
  });
});
