import React, { useMemo, useState } from "react";
import { resolvePlayerName } from "../lib/playerName.js";
import { formatPoints, safeNumber } from "../utils/format.js";

export default function LocalStatAssistant({ allTime, boomBust, playerIndex, espnNameMap }) {
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  const getPlayerName = (row) => resolvePlayerName(row, playerIndex, espnNameMap);

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
  }, [allTime, boomBust, playerIndex]);

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
          <button className="tag" type="button" onClick={() => setChatInput("Top 5 fantasy performance weeks")}>
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
  );
}
