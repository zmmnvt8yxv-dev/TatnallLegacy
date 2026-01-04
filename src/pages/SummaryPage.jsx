import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import NavigationCard from "../components/NavigationCard.jsx";
import SearchBar from "../components/SearchBar.jsx";
import StatCard from "../components/StatCard.jsx";
import { useDataContext } from "../data/DataContext.jsx";
import {
  loadAllTime,
  loadMetricsSummary,
  loadPlayerMetricsBoomBust,
  loadSeasonSummary,
  loadTransactions,
} from "../data/loader.js";
import { resolvePlayerName } from "../lib/playerName.js";
import { formatPoints, safeNumber } from "../utils/format.js";
import { normalizeOwnerName } from "../utils/owners.js";

function getLatestSeason(manifest) {
  const seasons = (manifest?.seasons || []).map(Number).filter(Number.isFinite);
  if (!seasons.length) return null;
  return Math.max(...seasons);
}

export default function SummaryPage() {
  const { manifest, loading, error, playerIdLookup, playerIndex } = useDataContext();
  const [seasonSummary, setSeasonSummary] = useState(null);
  const [allTime, setAllTime] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [metricsSummary, setMetricsSummary] = useState(null);
  const [boomBust, setBoomBust] = useState(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [weeklySearch, setWeeklySearch] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  const latestSeason = getLatestSeason(manifest);
  const seasonWeeks = latestSeason ? manifest?.weeksBySeason?.[String(latestSeason)] || [] : [];
  const inSeason = seasonWeeks.length > 0;

  useEffect(() => {
    let active = true;
    if (!latestSeason) return undefined;
    loadSeasonSummary(latestSeason).then((payload) => {
      if (active) setSeasonSummary(payload);
    });
    loadTransactions(latestSeason).then((payload) => {
      if (active) setTransactions(payload);
    });
    return () => {
      active = false;
    };
  }, [latestSeason]);

  useEffect(() => {
    let active = true;
    loadAllTime().then((payload) => {
      if (active) setAllTime(payload);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadMetricsSummary().then((payload) => {
      if (active) setMetricsSummary(payload);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadPlayerMetricsBoomBust()
      .then((payload) => {
        if (active) setBoomBust(payload);
      })
      .catch(() => {
        if (active) setBoomBust(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const champion = useMemo(() => {
    const standings = seasonSummary?.standings || [];
    if (!standings.length) return null;
    return standings.reduce((best, team) => {
      if (!best) return team;
      if (team.wins > best.wins) return team;
      if (team.wins === best.wins && team.points_for > best.points_for) return team;
      return best;
    }, null);
  }, [seasonSummary]);

  const transactionTotals = useMemo(() => {
    const entries = transactions?.entries || [];
    if (!entries.length) return null;
    const totalsByTeam = new Map();
    let totalTrades = 0;
    for (const entry of entries) {
      const team = entry?.team || "Unknown";
      const cur = totalsByTeam.get(team) || { team, adds: 0, drops: 0, trades: 0 };
      if (entry?.type === "trade") {
        cur.trades += 1;
        totalTrades += 1;
      } else if (entry?.type === "add") {
        cur.adds += 1;
      } else if (entry?.type === "drop") {
        cur.drops += 1;
      }
      totalsByTeam.set(team, cur);
    }
    const totals = Array.from(totalsByTeam.values());
    const mostAdds = totals.sort((a, b) => b.adds - a.adds)[0];
    const mostDrops = totals.sort((a, b) => b.drops - a.drops)[0];
    return { totalTrades, mostAdds, mostDrops, total: entries.length };
  }, [transactions]);

  const topWeekly = useMemo(() => {
    const entries = allTime?.topWeekly || [];
    if (!entries.length) return [];
    const query = weeklySearch.toLowerCase().trim();
    return entries.filter((row) => {
      if (!query) return true;
      return resolvePlayerName(row, playerIndex).toLowerCase().includes(query);
    });
  }, [allTime, weeklySearch, playerIndex]);

  const careerLeaders = useMemo(() => {
    const entries = allTime?.careerLeaders || [];
    if (!entries.length) return [];
    const query = playerSearch.toLowerCase().trim();
    return entries.filter((row) => {
      if (!query) return true;
      return resolvePlayerName(row, playerIndex).toLowerCase().includes(query);
    });
  }, [allTime, playerSearch, playerIndex]);

  if (loading) return <LoadingState label="Loading league snapshot..." />;
  if (error) return <ErrorState message={error} />;

  const ownerLabel = (value, fallback = "—") => normalizeOwnerName(value) || fallback;
  const statusLabel = inSeason ? "In Season" : `Offseason (last season: ${latestSeason ?? "—"})`;
  const championLabel = champion
    ? `${ownerLabel(champion.team, champion.team)} (${champion.wins}-${champion.losses})`
    : "Champion not available";
  const championNote = champion
    ? "Regular-season leader based on available standings."
    : "Standings or playoff data missing for this season.";

  const playerFromSleeper = (playerId) => {
    const uid = playerIdLookup.bySleeper.get(String(playerId));
    if (!uid) return null;
    return playerIdLookup.byUid.get(uid);
  };

  const getPlayerName = (row) => resolvePlayerName(row, playerIndex);

  const chatInsights = useMemo(() => {
    const weekly = [...(allTime?.topWeekly || [])].sort((a, b) => (b?.points || 0) - (a?.points || 0));
    const bestWeekly = weekly[0] || null;
    const topWeeklyFive = weekly.slice(0, 5);

    const rows = boomBust?.rows || [];
    if (!rows.length) {
      return { bestWeekly, topWeeklyFive, consistent: null, volatile: null };
    }

    const aggregates = new Map();
    for (const row of rows) {
      const games = Number(row?.games || 0);
      const fpStd = Number(row?.fp_std);
      if (!Number.isFinite(fpStd) || games <= 0) continue;
      const key = row?.gsis_id || row?.display_name;
      if (!key) continue;
      const entry = aggregates.get(key) || {
        key,
        gsis_id: row?.gsis_id || null,
        display_name: row?.display_name || "",
        games: 0,
        stdSum: 0,
      };
      entry.games += games;
      entry.stdSum += fpStd * games;
      if (row?.display_name) entry.display_name = row.display_name;
      aggregates.set(key, entry);
    }

    const entries = Array.from(aggregates.values())
      .map((entry) => ({
        ...entry,
        avgStd: entry.games ? entry.stdSum / entry.games : null,
      }))
      .filter((entry) => Number.isFinite(entry.avgStd) && entry.games >= 16);

    if (!entries.length) {
      return { bestWeekly, topWeeklyFive, consistent: null, volatile: null };
    }

    const sortedByStd = [...entries].sort((a, b) => a.avgStd - b.avgStd);
    const consistent = sortedByStd[0];
    const volatile = sortedByStd[sortedByStd.length - 1];

    return { bestWeekly, topWeeklyFive, consistent, volatile };
  }, [allTime, boomBust]);

  const formatWeeklyLine = (row, rank) => {
    if (!row) return "";
    const label = getPlayerName(row);
    const season = row.season ?? "—";
    const week = row.week ?? "—";
    const points = formatPoints(row.points);
    return `${rank}. ${label} — Week ${week} (${season}) — ${points} pts`;
  };

  const buildChatAnswer = (question) => {
    const query = question.toLowerCase().trim();
    if (!query) return null;

    const responses = [];
    const bestWeekly = chatInsights.bestWeekly;
    const topWeeklyFive = chatInsights.topWeeklyFive;
    const consistent = chatInsights.consistent;
    const volatile = chatInsights.volatile;

    if (query.includes("best") && query.includes("performance")) {
      if (!bestWeekly) {
        return {
          title: "Best Fantasy Performance",
          lines: ["No weekly performance data is available yet."],
        };
      }
      return {
        title: "Best Fantasy Performance",
        lines: [formatWeeklyLine(bestWeekly, 1)],
      };
    }

    if (
      query.includes("top 5") ||
      query.includes("top five") ||
      (query.includes("top") && query.includes("weeks"))
    ) {
      if (!topWeeklyFive.length) {
        return {
          title: "Top Weekly Performances",
          lines: ["No weekly performance data is available yet."],
        };
      }
      return {
        title: "Top 5 Weekly Performances",
        lines: topWeeklyFive.map((row, index) => formatWeeklyLine(row, index + 1)),
      };
    }

    if (query.includes("consistent")) {
      if (!consistent) {
        return {
          title: "Most Consistent Player",
          lines: ["Consistency data is not available yet."],
        };
      }
      const name = getPlayerName({ gsis_id: consistent.gsis_id, display_name: consistent.display_name });
      return {
        title: "Most Consistent Player",
        lines: [
          `${name} — avg std dev ${safeNumber(consistent.avgStd).toFixed(2)} over ${consistent.games} games.`,
        ],
      };
    }

    if (query.includes("volatile")) {
      if (!volatile) {
        return {
          title: "Most Volatile Player",
          lines: ["Volatility data is not available yet."],
        };
      }
      const name = getPlayerName({ gsis_id: volatile.gsis_id, display_name: volatile.display_name });
      return {
        title: "Most Volatile Player",
        lines: [
          `${name} — avg std dev ${safeNumber(volatile.avgStd).toFixed(2)} over ${volatile.games} games.`,
        ],
      };
    }

    if (query.includes("help") || query.includes("what") || query.includes("can")) {
      responses.push("Try: “Best fantasy performance of all time”.");
      responses.push("Try: “Top 5 fantasy performance weeks”.");
      responses.push("Try: “Most consistent player”.");
      responses.push("Try: “Most volatile player”.");
      responses.push("Local sources: all_time.json and player_metrics/boom_bust.json.");
      return { title: "Local Stat Assistant Help", lines: responses };
    }

    responses.push("I can answer a few stat lookups from local data.");
    responses.push("Examples: Best fantasy performance, Top 5 weeks, Most consistent, Most volatile.");
    return { title: "Try a Stat Lookup", lines: responses };
  };

  const handleChatSubmit = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const answer = buildChatAnswer(trimmed);
    if (!answer) return;
    setChatHistory((prev) => [
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, question: trimmed, answer },
      ...prev,
    ].slice(0, 6));
    setChatInput("");
  };

  const handleChatKey = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleChatSubmit();
  };

  return (
    <>
      <section>
        <h1 className="page-title">League Summary</h1>
        <p className="page-subtitle">
          Snapshot of the latest season plus all-time records from available league exports.
        </p>
      </section>

      <section className="card-grid">
        <StatCard label="Current Season" value={latestSeason ?? "—"} subtext={statusLabel} />
        <StatCard label="Current Champion" value={championLabel} subtext={championNote} />
        <StatCard
          label="Total Transactions"
          value={transactionTotals ? transactionTotals.total : "No data"}
          subtext="Trades + adds + drops (latest season)"
        />
        <StatCard
          label="Total Trades"
          value={transactionTotals ? transactionTotals.totalTrades : "No data"}
          subtext="Latest season trades"
        />
      </section>

      <section className="card-grid">
        <NavigationCard
          to="/matchups"
          title="Weekly Matchups"
          description="Browse matchups by season and week, then dive into roster details."
        />
        <NavigationCard
          to="/transactions"
          title="Transactions"
          description="Track trades, adds, drops, and season totals by team."
        />
        <NavigationCard
          to="/standings"
          title="Standings"
          description="Season standings plus all-time franchise summaries."
        />
      </section>

      <section className="detail-grid">
        <div className="section-card">
          <h2 className="section-title">Season Highlights</h2>
          {transactionTotals ? (
            <div className="flex-row">
              <div className="tag">
                Most adds: {ownerLabel(transactionTotals.mostAdds?.team, transactionTotals.mostAdds?.team || "—")} (
                {transactionTotals.mostAdds?.adds || 0})
              </div>
              <div className="tag">
                Most drops: {ownerLabel(transactionTotals.mostDrops?.team, transactionTotals.mostDrops?.team || "—")} (
                {transactionTotals.mostDrops?.drops || 0})
              </div>
              <div className="tag">Trades logged: {transactionTotals.totalTrades}</div>
            </div>
          ) : (
            <div>No transaction data available for this season.</div>
          )}
        </div>
        <div className="section-card">
          <h2 className="section-title">All-Time Records</h2>
          <div className="flex-row">
            <div className="tag">Weekly points leaderboard (custom points)</div>
            <div className="tag">Career fantasy totals</div>
          </div>
          {!allTime ? (
            <div>No all-time data available.</div>
          ) : (
            <div className="flex-row">
              <Link to="/matchups" className="tag">
                Explore weekly matchups →
              </Link>
              <Link to="/standings" className="tag">
                View franchise history →
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Best Weekly Performances (Top 10)</h2>
        <SearchBar value={weeklySearch} onChange={setWeeklySearch} placeholder="Search weekly leaders..." />
        {topWeekly.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Season</th>
                <th>Week</th>
                <th>Team</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {topWeekly.map((row) => {
                const player = playerFromSleeper(row.player_id);
                const playerName = getPlayerName(row) || player?.full_name;
                return (
                  <tr key={`${row.player_id}-${row.season}-${row.week}`}>
                    <td>
                      <Link to={`/players/${row.player_id}`}>
                        {playerName}
                      </Link>
                    </td>
                    <td>{row.season}</td>
                    <td>{row.week}</td>
                    <td>{row.team || "—"}</td>
                    <td>{formatPoints(row.points)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>No weekly performance data available.</div>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">Career Fantasy Leaders</h2>
        <SearchBar value={playerSearch} onChange={setPlayerSearch} placeholder="Search career leaders..." />
        {careerLeaders.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Seasons</th>
                <th>Games</th>
                <th>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {careerLeaders.map((row) => {
                const player = playerFromSleeper(row.player_id);
                const playerName = getPlayerName(row) || player?.full_name;
                return (
                  <tr key={row.player_id}>
                    <td>
                      <Link to={`/players/${row.player_id}`}>
                        {playerName}
                      </Link>
                    </td>
                    <td>{row.seasons}</td>
                    <td>{row.games}</td>
                    <td>{formatPoints(row.points)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>No career leaderboard data available.</div>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">Advanced Metrics Highlights</h2>
        {!metricsSummary ? (
          <div>No advanced metrics available. Run <code>npm run build:data</code> to generate WAR and z-score stats.</div>
        ) : (
          <div className="detail-grid">
            <div className="section-card">
              <h3 className="section-title">Top Weekly WAR</h3>
              {metricsSummary.topWeeklyWar?.length ? (
                <ul>
                  {metricsSummary.topWeeklyWar.map((row) => (
                    <li
                      key={`${row.player_id || row.sleeper_id || row.gsis_id || row.display_name}-${row.season}-${row.week}`}
                    >
                      {getPlayerName(row)} — Week {row.week} {row.season} (
                      {formatPoints(row.war_rep)}){" "}
                    </li>
                  ))}
                </ul>
              ) : (
                <div>No weekly WAR data available.</div>
              )}
            </div>
            <div className="section-card">
              <h3 className="section-title">Best Weekly Z-Scores</h3>
              {metricsSummary.topWeeklyZ?.length ? (
                <ul>
                  {metricsSummary.topWeeklyZ.map((row) => (
                    <li
                      key={`${row.player_id || row.sleeper_id || row.gsis_id || row.display_name}-${row.season}-${row.week}`}
                    >
                      {getPlayerName(row)} — Week {row.week} {row.season} (
                      {safeNumber(row.pos_week_z).toFixed(2)})
                    </li>
                  ))}
                </ul>
              ) : (
                <div>No weekly z-score data available.</div>
              )}
            </div>
            <div className="section-card">
              <h3 className="section-title">Top WAR Seasons</h3>
              {metricsSummary.topSeasonWar?.length ? (
                <ul>
                  {metricsSummary.topSeasonWar.map((row) => (
                    <li
                      key={`${row.player_id || row.sleeper_id || row.gsis_id || row.display_name}-${row.season}`}
                    >
                      {getPlayerName(row)} — {row.season} (
                      {formatPoints(row.war_rep)})
                    </li>
                  ))}
                </ul>
              ) : (
                <div>No season WAR data available.</div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">Local Stat Assistant</h2>
        <p className="page-subtitle">Ask quick stat questions powered by local exports only.</p>
        <div className="chat-panel">
          <div className="flex-row">
            <div className="search-bar" style={{ flex: 1 }}>
              <input
                type="search"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={handleChatKey}
                placeholder="e.g. Best fantasy performance of all time"
              />
            </div>
            <button className="tag" type="button" onClick={handleChatSubmit}>
              Ask
            </button>
            <button
              className="tag"
              type="button"
              onClick={() => setChatInput("Top 5 fantasy performance weeks")}
            >
              Example
            </button>
          </div>
          {chatHistory.length ? (
            <div className="chat-log">
              {chatHistory.map((entry) => (
                <div key={entry.id} className="chat-entry">
                  <div className="chat-question">{entry.question}</div>
                  <div className="chat-answer-title">{entry.answer.title}</div>
                  <ul>
                    {entry.answer.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="chat-entry">
              <div className="chat-question">Try asking:</div>
              <ul>
                <li>Best fantasy performance of all time</li>
                <li>Top 5 fantasy performance weeks</li>
                <li>Most consistent player</li>
                <li>Most volatile player</li>
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Data Coverage Notes</h2>
        <ul>
          <li>
            Advanced metrics (z-scores, WAR, efficiency) are displayed when present in the data exports. Missing
            files are shown as “No data available.”
          </li>
          <li>Only regular-season weeks 1–18 are included in leaderboards and matchups.</li>
        </ul>
      </section>
    </>
  );
}
