/**
 * Data Integrity Dashboard
 *
 * Phase 3: Enhanced monitoring dashboard showing data health status,
 * runtime validation events, and configuration status.
 */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import LoadingState from "../components/LoadingState.jsx";
import { useDataIntegrity } from "../hooks/useDataIntegrity";
import PageTransition from "../components/PageTransition.jsx";
import {
  getBufferedEvents,
  type DataIntegrityEvent,
} from "../services/monitoring";
import {
  isSentryConfigured,
  isAnalyticsConfigured,
  isDev,
} from "../config";
import type {
  IntegrityStatus,
  IntegrityReport,
  IntegritySeason,
  IntegrityWeeklySummary,
  IntegrityTransaction,
} from "../schemas";

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface StatusBadgeProps {
  status: IntegrityStatus | string;
}

function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
  const statusColor = (s: string): string => {
    if (s === "ok") return "#22c55e";
    if (s === "warning") return "#f59e0b";
    if (s === "error") return "#ef4444";
    return "#6b7280"; // unknown/default
  };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: "999px",
        fontSize: "0.8rem",
        fontWeight: 600,
        background: statusColor(status),
        color: "#fff",
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

interface ConfigStatusProps {
  label: string;
  isConfigured: boolean;
}

function ConfigStatus({ label, isConfigured }: ConfigStatusProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 0",
      }}
    >
      <span
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: isConfigured ? "#22c55e" : "#6b7280",
        }}
      />
      <span>{label}</span>
      <span style={{ color: "var(--ink-500)", fontSize: "0.85rem" }}>
        {isConfigured ? "Configured" : "Not configured"}
      </span>
    </div>
  );
}

// =============================================================================
// RUNTIME EVENTS PANEL
// =============================================================================

function RuntimeEventsPanel(): React.ReactElement {
  const [events, setEvents] = useState<DataIntegrityEvent[]>([]);

  useEffect(() => {
    // Initial load
    setEvents(getBufferedEvents());

    // Refresh periodically
    const interval = setInterval(() => {
      setEvents(getBufferedEvents());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (events.length === 0) {
    return (
      <div className="section-card">
        <h2 className="section-title">Runtime Events</h2>
        <p style={{ color: "var(--ink-500)" }}>
          No validation events recorded this session.
        </p>
      </div>
    );
  }

  const eventTypeColor = (type: DataIntegrityEvent["type"]): string => {
    switch (type) {
      case "validation_error":
        return "#ef4444";
      case "load_error":
        return "#ef4444";
      case "missing_data":
        return "#f59e0b";
      case "schema_mismatch":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  return (
    <div className="section-card">
      <h2 className="section-title">Runtime Events ({events.length})</h2>
      <div style={{ maxHeight: "300px", overflowY: "auto" }}>
        {events.slice(-20).reverse().map((event, idx) => (
          <div
            key={`${event.timestamp}-${idx}`}
            style={{
              padding: "8px 12px",
              marginBottom: "8px",
              borderRadius: "8px",
              background: "var(--surface-2)",
              borderLeft: `3px solid ${eventTypeColor(event.type)}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  color: eventTypeColor(event.type),
                }}
              >
                {event.type.replace(/_/g, " ").toUpperCase()}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--ink-500)" }}>
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div style={{ fontSize: "0.85rem", marginTop: "4px" }}>
              {event.context}
            </div>
            {event.details.issues && Array.isArray(event.details.issues) && (
              <ul style={{ margin: "4px 0 0 16px", fontSize: "0.8rem", color: "var(--ink-500)" }}>
                {(event.details.issues as string[]).slice(0, 3).map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// CONFIGURATION STATUS PANEL
// =============================================================================

function ConfigStatusPanel(): React.ReactElement {
  let sentryConfigured = false;
  let analyticsConfigured = false;
  let devMode = true;

  try {
    sentryConfigured = isSentryConfigured();
    analyticsConfigured = isAnalyticsConfigured();
    devMode = isDev();
  } catch {
    // Config not initialized yet
  }

  return (
    <div className="section-card">
      <h2 className="section-title">Configuration Status</h2>
      <ConfigStatus label="Sentry Error Tracking" isConfigured={sentryConfigured} />
      <ConfigStatus label="Google Analytics" isConfigured={analyticsConfigured} />
      <ConfigStatus label="Development Mode" isConfigured={devMode} />
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function DataIntegrityPage(): React.ReactElement {
  const {
    data: report,
    isLoading: loading,
    isError: error,
  } = useDataIntegrity();

  if (loading) {
    return <LoadingState label="Loading integrity report..." />;
  }

  if (error || !report) {
    return (
      <PageTransition>
        <h1 className="page-title">Data Integrity Dashboard</h1>

        <div className="section-card">
          <h2 className="section-title">No Report Available</h2>
          <p style={{ color: "var(--ink-500)" }}>
            Run <code>python3 scripts/audit_data_integrity.py</code> to generate a data integrity report.
          </p>
        </div>

        {/* Still show runtime events and config status */}
        <RuntimeEventsPanel />
        <ConfigStatusPanel />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <h1 className="page-title">Data Integrity Dashboard</h1>
      <p className="page-subtitle">
        Last updated: {new Date(report.generated_at).toLocaleString()}
      </p>

      {/* Overall Status */}
      <div className="card-grid">
        <div className="stat-card">
          <div className="stat-label">Overall Status</div>
          <div style={{ marginTop: "12px" }}>
            <StatusBadge status={report.overall_status} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Players</div>
          <div className="stat-value">{report.players?.total_players ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Seasons</div>
          <div className="stat-value">{report.manifest?.seasons?.length ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Data Paths</div>
          <div className="stat-value">{report.manifest?.path_count ?? 0}</div>
        </div>
      </div>

      {/* Configuration Status */}
      <ConfigStatusPanel />

      {/* Runtime Events */}
      <RuntimeEventsPanel />

      {/* Player ID Coverage */}
      <div className="section-card">
        <h2 className="section-title">Player ID Coverage</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID Type</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.players?.id_type_distribution ?? {}).map(
                ([type, count]) => (
                  <tr key={type}>
                    <td>{type}</td>
                    <td>{count}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Season Health */}
      <div className="section-card">
        <h2 className="section-title">Season Data Health</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Status</th>
                <th>Teams</th>
                <th>Weekly Matchups</th>
                <th>Weekly Lineups</th>
                <th>Missing IDs</th>
                <th>Transactions</th>
              </tr>
            </thead>
            <tbody>
              {(report.manifest?.seasons ?? []).map((season) => {
                const seasonData: IntegritySeason | undefined =
                  report.seasons?.[String(season)];
                const weekly: IntegrityWeeklySummary | undefined =
                  report.weekly_summary?.[String(season)];
                const tx: IntegrityTransaction | undefined =
                  report.transactions?.[String(season)];
                return (
                  <tr key={season}>
                    <td>
                      <Link to={`/standings?season=${season}`}>{season}</Link>
                    </td>
                    <td>
                      <StatusBadge status={seasonData?.status ?? "unknown"} />
                    </td>
                    <td>{seasonData?.team_count ?? 0}</td>
                    <td>{weekly?.total_matchups ?? 0}</td>
                    <td>{weekly?.total_lineups ?? 0}</td>
                    <td
                      style={{
                        color:
                          (weekly?.issues?.missing_player_id ?? 0) > 0
                            ? "#f59e0b"
                            : "inherit",
                      }}
                    >
                      {weekly?.issues?.missing_player_id ?? 0}
                    </td>
                    <td>{tx?.entry_count ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issues Summary */}
      {Object.values(report.seasons ?? {}).some(
        (s) => s.issues && s.issues.length > 0
      ) && (
        <div className="section-card">
          <h2 className="section-title">Issues Found</h2>
          {Object.entries(report.seasons ?? {})
            .filter(([, data]) => data.issues && data.issues.length > 0)
            .map(([season, data]) => (
              <div key={season} style={{ marginBottom: "12px" }}>
                <strong>{season}</strong>
                <ul
                  style={{
                    marginTop: "4px",
                    paddingLeft: "20px",
                    color: "var(--ink-500)",
                  }}
                >
                  {data.issues?.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      {/* Transaction Analysis */}
      <div className="section-card">
        <h2 className="section-title">Transaction Coverage</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Adds</th>
                <th>Drops</th>
                <th>Trades</th>
                <th>Missing Names</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.transactions ?? {})
                .filter(([, tx]) => tx.entry_count > 0)
                .map(([season, tx]) => (
                  <tr key={season}>
                    <td>{season}</td>
                    <td>{tx.type_distribution?.add ?? 0}</td>
                    <td>{tx.type_distribution?.drop ?? 0}</td>
                    <td>{tx.type_distribution?.trade ?? 0}</td>
                    <td
                      style={{
                        color:
                          (tx.missing_player_names ?? 0) > 0 ? "#f59e0b" : "inherit",
                      }}
                    >
                      {tx.missing_player_names ?? 0}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          marginTop: "24px",
          color: "var(--ink-500)",
          fontSize: "0.85rem",
        }}
      >
        <p>
          <strong>Tip:</strong> Run <code>npm run build:data</code> to regenerate data
          and <code>python3 scripts/audit_data_integrity.py</code> to refresh this
          report.
        </p>
      </div>
    </PageTransition>
  );
}
