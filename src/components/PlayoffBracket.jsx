import React from "react";
import { normalizeOwnerName } from "../utils/owners";

/**
 * PlayoffBracket - Visualizes the playoff bracket for a season
 * 
 * Props:
 * - bracket: Array of playoff matchups with round info
 * - champion: The champion team object
 * - runnerUp: The runner-up team object
 */
export default function PlayoffBracket({ bracket, champion, runnerUp }) {
    if (!bracket || bracket.length === 0) {
        return (
            <div className="section-card">
                <h2 className="section-title">🏆 Playoff Bracket</h2>
                <p style={{ color: 'var(--ink-400)' }}>Playoff bracket data not available for this season.</p>
            </div>
        );
    }

    // Group matchups by round
    const rounds = {};
    bracket.forEach(m => {
        const round = m.round || "Unknown";
        if (!rounds[round]) rounds[round] = [];
        rounds[round].push(m);
    });

    const roundOrder = ["Quarterfinals", "Semifinals", "Championship"];
    const orderedRounds = roundOrder.filter(r => rounds[r]);

    const ownerLabel = (name, team) => {
        if (!name) return team || "—";
        return normalizeOwnerName(name);
    };

    return (
        <div className="section-card">
            <h2 className="section-title">🏆 Playoff Bracket</h2>

            <div className="playoff-bracket" style={{
                display: 'flex',
                gap: '1.5rem',
                overflowX: 'auto',
                padding: '1rem 0'
            }}>
                {orderedRounds.map(round => (
                    <div key={round} className="bracket-round" style={{
                        minWidth: '200px',
                        flex: '0 0 auto'
                    }}>
                        <h3 style={{
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            marginBottom: '0.75rem',
                            color: round === "Championship" ? 'var(--accent)' : 'var(--ink-600)'
                        }}>
                            {round}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {rounds[round].map((matchup, idx) => {
                                const homeWon = matchup.home_score > matchup.away_score;
                                const awayWon = matchup.away_score > matchup.home_score;
                                const isChampionship = round === "Championship";

                                return (
                                    <div
                                        key={idx}
                                        className="bracket-matchup"
                                        style={{
                                            background: isChampionship
                                                ? 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.1), rgba(var(--accent-rgb), 0.05))'
                                                : 'var(--surface-100)',
                                            borderRadius: '8px',
                                            padding: '0.75rem',
                                            border: isChampionship ? '2px solid var(--accent)' : '1px solid var(--border)'
                                        }}
                                    >
                                        {/* Home Team */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            fontWeight: homeWon ? 700 : 400,
                                            color: homeWon ? 'var(--ink-900)' : 'var(--ink-500)',
                                            marginBottom: '0.25rem'
                                        }}>
                                            <span style={{ fontSize: '0.85rem' }}>
                                                {matchup.home_seed ? `(${matchup.home_seed}) ` : ''}
                                                {ownerLabel(matchup.home_owner, matchup.home_team)}
                                            </span>
                                            <span style={{ fontWeight: 600 }}>{matchup.home_score?.toFixed(1)}</span>
                                        </div>

                                        {/* Away Team */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            fontWeight: awayWon ? 700 : 400,
                                            color: awayWon ? 'var(--ink-900)' : 'var(--ink-500)'
                                        }}>
                                            <span style={{ fontSize: '0.85rem' }}>
                                                {matchup.away_seed ? `(${matchup.away_seed}) ` : ''}
                                                {ownerLabel(matchup.away_owner, matchup.away_team)}
                                            </span>
                                            <span style={{ fontWeight: 600 }}>{matchup.away_score?.toFixed(1)}</span>
                                        </div>

                                        {/* Week indicator */}
                                        <div style={{
                                            fontSize: '0.7rem',
                                            color: 'var(--ink-400)',
                                            marginTop: '0.25rem',
                                            textAlign: 'right'
                                        }}>
                                            Week {matchup.week}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Champion Display */}
                {champion && (
                    <div className="bracket-champion" style={{
                        minWidth: '160px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '1rem',
                        background: 'linear-gradient(135deg, #ffd700, #ffb347)',
                        borderRadius: '12px',
                        color: '#000'
                    }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏆</div>
                        <div style={{ fontWeight: 700, fontSize: '1rem', textAlign: 'center' }}>
                            {ownerLabel(champion.owner, champion.team)}
                        </div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.25rem' }}>
                            Champion
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
