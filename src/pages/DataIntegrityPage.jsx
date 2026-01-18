import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LoadingState from "../components/LoadingState.jsx";
import { safeUrl } from "../lib/url.js";

/**
 * Data Integrity Dashboard
 * Shows the health status of all data in the system
 */
export default function DataIntegrityPage() {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch(safeUrl("data/integrity_report.json"))
            .then((res) => {
                if (!res.ok) throw new Error("Report not found");
                return res.json();
            })
            .then((data) => {
                setReport(data);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return <LoadingState message="Loading integrity report..." />;
    }

    if (error) {
        return (
            <div className="section-card">
                <h2 className="section-title">No Report Available</h2>
                <p style={{ color: "var(--ink-500)" }}>
                    Run <code>python3 scripts/audit_data_integrity.py</code> to generate a data integrity report.
                </p>
            </div>
        );
    }

    const statusColor = (status) => {
        if (status === "ok") return "#22c55e";
        if (status === "warning") return "#f59e0b";
        return "#ef4444";
    };

    const StatusBadge = ({ status }) => (
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

    return (
        <>
            <h1 className="page-title">📊 Data Integrity Dashboard</h1>
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
                    <div className="stat-value">{report.players?.total_players || 0}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Seasons</div>
                    <div className="stat-value">{report.manifest?.seasons?.length || 0}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Data Paths</div>
                    <div className="stat-value">{report.manifest?.path_count || 0}</div>
                </div>
            </div>

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
                            {Object.entries(report.players?.id_type_distribution || {}).map(([type, count]) => (
                                <tr key={type}>
                                    <td>{type}</td>
                                    <td>{count}</td>
                                </tr>
                            ))}
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
                            {(report.manifest?.seasons || []).map((season) => {
                                const seasonData = report.seasons?.[season] || {};
                                const weekly = report.weekly_summary?.[season] || {};
                                const tx = report.transactions?.[season] || {};
                                return (
                                    <tr key={season}>
                                        <td>
                                            <Link to={`/standings?season=${season}`}>{season}</Link>
                                        </td>
                                        <td>
                                            <StatusBadge status={seasonData.status || "unknown"} />
                                        </td>
                                        <td>{seasonData.team_count || 0}</td>
                                        <td>{weekly.total_matchups || 0}</td>
                                        <td>{weekly.total_lineups || 0}</td>
                                        <td
                                            style={{
                                                color: weekly.issues?.missing_player_id > 0 ? "#f59e0b" : "inherit",
                                            }}
                                        >
                                            {weekly.issues?.missing_player_id || 0}
                                        </td>
                                        <td>{tx.entry_count || 0}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Issues Summary */}
            {Object.values(report.seasons || {}).some((s) => s.issues?.length > 0) && (
                <div className="section-card">
                    <h2 className="section-title">⚠️ Issues Found</h2>
                    {Object.entries(report.seasons || {})
                        .filter(([, data]) => data.issues?.length > 0)
                        .map(([season, data]) => (
                            <div key={season} style={{ marginBottom: "12px" }}>
                                <strong>{season}</strong>
                                <ul style={{ marginTop: "4px", paddingLeft: "20px", color: "var(--ink-500)" }}>
                                    {data.issues.map((issue, idx) => (
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
                            {Object.entries(report.transactions || {})
                                .filter(([, tx]) => tx.entry_count > 0)
                                .map(([season, tx]) => (
                                    <tr key={season}>
                                        <td>{season}</td>
                                        <td>{tx.type_distribution?.add || 0}</td>
                                        <td>{tx.type_distribution?.drop || 0}</td>
                                        <td>{tx.type_distribution?.trade || 0}</td>
                                        <td
                                            style={{
                                                color: tx.missing_player_names > 0 ? "#f59e0b" : "inherit",
                                            }}
                                        >
                                            {tx.missing_player_names || 0}
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ marginTop: "24px", color: "var(--ink-500)", fontSize: "0.85rem" }}>
                <p>
                    💡 <strong>Tip:</strong> Run <code>npm run build:data</code> to regenerate data
                    and <code>python3 scripts/audit_data_integrity.py</code> to refresh this report.
                </p>
            </div>
        </>
    );
}
