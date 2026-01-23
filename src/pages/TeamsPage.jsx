import React, { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { useTeamsList } from "../hooks/useTeamsList.js";
import PageTransition from "../components/PageTransition.jsx";
import { normalizeOwnerName } from "../lib/identity.js";
import { formatPoints } from "../utils/format";
import { readStorage, writeStorage } from "../utils/persistence";

const PREF_KEY = "tatnall-pref-teams-season";

function slugifyOwner(name) {
    return encodeURIComponent(String(name || "").toLowerCase().replace(/\s+/g, "-"));
}

export default function TeamsPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    const season = searchParams.get("season")
        ? Number(searchParams.get("season"))
        : null;

    const {
        manifest,
        seasonData,
        isLoading: loading,
        isError: error
    } = useTeamsList(season);

    useEffect(() => {
        if (!manifest) return;
        const seasons = manifest?.seasons || [];
        const stored = readStorage(PREF_KEY);
        const targetSeason =
            season || (stored && seasons.includes(Number(stored)) ? Number(stored) : seasons[0]);
        if (!season && targetSeason) {
            setSearchParams({ season: targetSeason }, { replace: true });
        }
    }, [season, manifest, setSearchParams]);

    const handleSeasonChange = (value) => {
        const newSeason = Number(value);
        writeStorage(PREF_KEY, newSeason);
        setSearchParams({ season: newSeason });
    };

    const seasons = manifest?.seasons || [];

    // Build team list with owner normalization
    const teams = useMemo(() => {
        if (!seasonData?.teams) return [];
        return seasonData.teams
            .map((team) => ({
                ...team,
                ownerNormalized: normalizeOwnerName(team.owner || team.display_name || team.team_name),
                ownerSlug: slugifyOwner(normalizeOwnerName(team.owner || team.display_name || team.team_name)),
            }))
            .sort((a, b) => {
                const rankA = a.final_rank || a.regular_season_rank || 999;
                const rankB = b.final_rank || b.regular_season_rank || 999;
                return rankA - rankB;
            });
    }, [seasonData]);

    if (loading) {
        return <LoadingState label="Loading teams..." />;
    }

    if (error) {
        return <ErrorState message="Failed to load teams" />;
    }

    return (
        <PageTransition>
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
        </PageTransition>
    );
}
