import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import { loadManifest, loadSeasonSummary } from "../data/loader.js";
import { normalizeOwnerName } from "../lib/identity.js";
import { formatPoints } from "../utils/format.js";
import { readStorage, writeStorage } from "../utils/persistence.js";

const PREF_KEY = "tatnall-pref-teams-season";

function slugifyOwner(name) {
    return encodeURIComponent(String(name || "").toLowerCase().replace(/\s+/g, "-"));
}

export default function TeamsPage() {
    const [manifest, setManifest] = useState(null);
    const [seasonData, setSeasonData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();

    const season = searchParams.get("season")
        ? Number(searchParams.get("season"))
        : null;

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);

        loadManifest()
            .then((m) => {
                if (!active) return;
                setManifest(m);
                const seasons = m?.seasons || [];
                const stored = readStorage(PREF_KEY);
                const targetSeason =
                    season || (stored && seasons.includes(Number(stored)) ? Number(stored) : seasons[0]);
                if (!season && targetSeason) {
                    setSearchParams({ season: targetSeason }, { replace: true });
                }
                return targetSeason ? loadSeasonSummary(targetSeason) : null;
            })
            .then((data) => {
                if (!active) return;
                setSeasonData(data);
                setLoading(false);
            })
            .catch((err) => {
                if (!active) return;
                console.error("TeamsPage load error:", err);
                setError(err);
                setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [season, searchParams, setSearchParams]);

    const handleSeasonChange = (value) => {
        const newSeason = Number(value);
        writeStorage(PREF_KEY, newSeason);
        setSearchParams({ season: newSeason });
    };

    const seasons = manifest?.seasons || [];

    // Build team list with owner normalization
    const teams = useMemo(() => {
        if (!seasonData?.teams) return [];
        return seasonData.teams.map((team) => ({
            ...team,
            ownerNormalized: normalizeOwnerName(team.owner || team.display_name || team.team_name),
            ownerSlug: slugifyOwner(normalizeOwnerName(team.owner || team.display_name || team.team_name)),
        }));
    }, [seasonData]);

    if (loading) {
        return <LoadingState message="Loading teams..." />;
    }

    if (error) {
        return <ErrorState message="Failed to load teams" />;
    }

    return (
        <>
            <h1 className="page-title">Fantasy Teams</h1>
            <p className="page-subtitle">
                Browse all fantasy teams across {seasons.length} seasons
            </p>

            <div className="section-card filters filters--sticky">
                <div>
                    <label htmlFor="season-select">Season</label>
                    <select
                        id="season-select"
                        value={season || ""}
                        onChange={(e) => handleSeasonChange(e.target.value)}
                    >
                        {seasons.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="section-card">
                <h2 className="section-title">{season} Teams</h2>
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Team / Owner</th>
                                <th>Record</th>
                                <th>Points For</th>
                                <th>Points Against</th>
                            </tr>
                        </thead>
                        <tbody>
                            {teams.map((team, idx) => (
                                <tr key={team.team_name || team.display_name || idx}>
                                    <td>{team.final_rank || team.regular_season_rank || idx + 1}</td>
                                    <td>
                                        <div>
                                            <strong>{team.team_name || team.display_name}</strong>
                                        </div>
                                        <Link
                                            to={`/owners/${team.ownerSlug}?from=${season}`}
                                            style={{ fontSize: "0.85rem", color: "var(--accent-700)" }}
                                        >
                                            {team.ownerNormalized}
                                        </Link>
                                    </td>
                                    <td>{team.record || `${team.wins || 0}-${team.losses || 0}`}</td>
                                    <td>{formatPoints(team.points_for, 1)}</td>
                                    <td>{formatPoints(team.points_against, 1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="section-card">
                <h2 className="section-title">All Owners</h2>
                <p style={{ color: "var(--ink-500)", marginBottom: "12px" }}>
                    Click an owner to see their full league history
                </p>
                <div className="favorite-list">
                    {[...new Set(teams.map((t) => t.ownerNormalized))].sort().map((owner) => (
                        <Link
                            key={owner}
                            to={`/owners/${slugifyOwner(owner)}`}
                            className="tag"
                        >
                            {owner}
                        </Link>
                    ))}
                </div>
            </div>
        </>
    );
}
