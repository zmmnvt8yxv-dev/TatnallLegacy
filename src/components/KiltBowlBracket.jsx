import React from "react";
import { normalizeOwnerName } from "../utils/owners";

/**
 * KiltBowlBracket - Visualizes the Kilt Bowl (consolation) best-of-3 series
 * 
 * Props:
 * - kiltBowl: Object containing team1, team2, games array, series_winner, series_loser, series_score
 */
export default function KiltBowlBracket({ kiltBowl }) {
    if (!kiltBowl || !kiltBowl.games || kiltBowl.games.length === 0) {
        return (
            <div className="section-card">
                <h2 className="section-title">💀 Kilt Bowl</h2>
                <p style={{ color: 'var(--ink-400)' }}>Kilt Bowl data not available for this season.</p>
            </div>
        );
    }

    const { team1, team2, games, series_winner, series_loser, series_score } = kiltBowl;

    const ownerLabel = (owner) => owner ? normalizeOwnerName(owner) : "—";

    // Determine series winner info
    const winnerTeam = team1.name === series_winner ? team1 : team2;
    const loserTeam = team1.name === series_loser ? team1 : team2;

    return (
        <div className="section-card">
            <h2 className="section-title">💀 Kilt Bowl</h2>
            <p style={{ color: 'var(--ink-500)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Best-of-3 consolation series for teams that didn't make playoffs
            </p>

            <div className="kilt-bowl" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
            }}>
                {/* Series Summary */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    background: 'var(--surface-100)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{
                            fontWeight: team1.wins >= 2 ? 700 : 400,
                            color: team1.wins >= 2 ? 'var(--ink-900)' : 'var(--ink-500)',
                            fontSize: '1rem'
                        }}>
                            {ownerLabel(team1.owner)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-400)' }}>
                            {team1.name}
                        </div>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: 'var(--surface-200)',
                        borderRadius: '8px'
                    }}>
                        <span style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            color: team1.wins >= 2 ? 'var(--success)' : 'var(--ink-400)'
                        }}>
                            {team1.wins}
                        </span>
                        <span style={{ color: 'var(--ink-400)' }}>-</span>
                        <span style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            color: team2.wins >= 2 ? 'var(--success)' : 'var(--ink-400)'
                        }}>
                            {team2.wins}
                        </span>
                    </div>

                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{
                            fontWeight: team2.wins >= 2 ? 700 : 400,
                            color: team2.wins >= 2 ? 'var(--ink-900)' : 'var(--ink-500)',
                            fontSize: '1rem'
                        }}>
                            {ownerLabel(team2.owner)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-400)' }}>
                            {team2.name}
                        </div>
                    </div>
                </div>

                {/* Individual Games */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.75rem'
                }}>
                    {games.map((game, idx) => {
                        const homeWon = game.home_score > game.away_score;
                        const awayWon = game.away_score > game.home_score;

                        return (
                            <div
                                key={idx}
                                style={{
                                    padding: '0.75rem',
                                    background: 'var(--surface-100)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)'
                                }}
                            >
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--ink-400)',
                                    marginBottom: '0.5rem',
                                    fontWeight: 600
                                }}>
                                    Game {idx + 1} (Week {game.week})
                                </div>

                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontWeight: homeWon ? 600 : 400,
                                    color: homeWon ? 'var(--ink-900)' : 'var(--ink-500)',
                                    fontSize: '0.9rem',
                                    marginBottom: '0.25rem'
                                }}>
                                    <span>{ownerLabel(games[0].home_team === game.home_team ? team1.owner : team2.owner)}</span>
                                    <span>{game.home_score?.toFixed(1)}</span>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontWeight: awayWon ? 600 : 400,
                                    color: awayWon ? 'var(--ink-900)' : 'var(--ink-500)',
                                    fontSize: '0.9rem'
                                }}>
                                    <span>{ownerLabel(games[0].home_team === game.away_team ? team1.owner : team2.owner)}</span>
                                    <span>{game.away_score?.toFixed(1)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Result Banner */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    {/* Winner */}
                    <div style={{
                        flex: 1,
                        padding: '1rem',
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05))',
                        borderRadius: '8px',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600, marginBottom: '0.25rem' }}>
                            🎉 Kilt Bowl Winner
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                            {ownerLabel(winnerTeam.owner)}
                        </div>
                    </div>

                    {/* Loser */}
                    <div style={{
                        flex: 1,
                        padding: '1rem',
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))',
                        borderRadius: '8px',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--error)', fontWeight: 600, marginBottom: '0.25rem' }}>
                            💀 Kilt Bowl Loser
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                            {ownerLabel(loserTeam.owner)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
