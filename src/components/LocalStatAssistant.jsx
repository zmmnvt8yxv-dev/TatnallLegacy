import React, { useMemo, useState } from "react";
import { resolvePlayerName } from "../lib/playerName.js";
import { formatPoints, safeNumber } from "../utils/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";

export default function LocalStatAssistant({ allTime, boomBust, metricsSummary, playerIndex, espnNameMap }) {
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  const getPlayerName = (row) => resolvePlayerName(row, playerIndex, espnNameMap);

  const chatInsights = useMemo(() => {
    const weekly = [...(allTime?.topWeekly || [])].sort((a, b) => (b?.points || 0) - (a?.points || 0));
    const bestWeekly = weekly[0] || null;
    const topWeeklyFive = weekly.slice(0, 5);

    const rows = boomBust?.rows || [];
    let consistent = null;
    let volatile = null;

    if (rows.length > 0) {
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

      if (entries.length > 0) {
        const sortedByStd = [...entries].sort((a, b) => a.avgStd - b.avgStd);
        consistent = sortedByStd[0];
        volatile = sortedByStd[sortedByStd.length - 1];
      }
    }

    const topWar = (metricsSummary?.topSeasonWar || []).slice(0, 5);
    const topZ = (metricsSummary?.topWeeklyZ || []).slice(0, 5);

    return { bestWeekly, topWeeklyFive, consistent, volatile, topWar, topZ };
  }, [allTime, boomBust, metricsSummary, playerIndex, espnNameMap]);

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

    const { bestWeekly, topWeeklyFive, consistent, volatile, topWar, topZ } = chatInsights;
    const responses = [];

    if (query.includes("war") || query.includes("replacement")) {
      if (!topWar.length) return { title: "Wins Above Replacement", lines: ["WAR data not available."] };
      return {
        title: "Top Career/Season WAR",
        lines: topWar.map((row, i) => `${i + 1}. ${getPlayerName(row)} — ${row.season} (${formatPoints(row.war_rep)} WAR)`),
      };
    }

    if (query.includes("z-score") || query.includes("efficiency") || query.includes("outperformed")) {
      if (!topZ.length) return { title: "Efficiency (Z-Scores)", lines: ["Z-score data not available."] };
      return {
        title: "Top Weekly Efficiency (Z-Scores)",
        lines: topZ.map((row, i) => `${i + 1}. ${getPlayerName(row)} — Week ${row.week}, ${row.season} (${safeNumber(row.pos_week_z).toFixed(2)}z)`),
      };
    }

    if (query.includes("best") && query.includes("performance")) {
      if (!bestWeekly) return { title: "Best Fantasy Performance", lines: ["Performance data not available."] };
      return { title: "Best Fantasy Performance", lines: [formatWeeklyLine(bestWeekly, 1)] };
    }

    if (query.includes("top 5") || query.includes("top five") || (query.includes("top") && query.includes("weeks"))) {
      if (!topWeeklyFive.length) return { title: "Top Weekly Performances", lines: ["Performance data not available."] };
      return { title: "Top 5 Weekly Performances", lines: topWeeklyFive.map((row, index) => formatWeeklyLine(row, index + 1)) };
    }

    if (query.includes("consistent")) {
      if (!consistent) return { title: "Most Consistent Player", lines: ["Consistency data is not available yet."] };
      const name = getPlayerName({ gsis_id: consistent.gsis_id, display_name: consistent.display_name });
      return { title: "Most Consistent Player", lines: [`${name} — avg std dev ${safeNumber(consistent.avgStd).toFixed(2)} over ${consistent.games} games.`] };
    }

    if (query.includes("help") || query.includes("what") || query.includes("can")) {
      responses.push("Try: “Who has the highest WAR?”");
      responses.push("Try: “Most efficient (z-score) weeks?”");
      responses.push("Try: “Best fantasy performance of all time”.");
      responses.push("Try: “Most consistent player”.");
      return { title: "Assistant Help", lines: responses };
    }

    responses.push("I can explain stats like WAR, Z-Scores, Consistency, and Volatility.");
    responses.push("Ask me: “Who are the WAR leaders?” or “Most consistent players”.");
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
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Local Stat Assistant
        </CardTitle>
        <p className="text-sm text-ink-500">Ask quick questions powered by advanced metrics (WAR, Z-Scores).</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 px-4 py-2 rounded-lg border border-ink-200 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500 font-body transition-shadow hover:shadow-sm"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKey}
              placeholder="e.g. Who has the highest WAR?"
            />
            <Button onClick={handleChatSubmit}>Ask</Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {["Highest WAR?", "Efficient weeks?", "Most consistent?"].map(q => (
              <Button key={q} variant="outline" size="sm" onClick={() => { setChatInput(q); handleChatSubmit(); }}>
                {q}
              </Button>
            ))}
          </div>

          <div className="space-y-4 mt-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {chatHistory.length > 0 ? (
              chatHistory.map((entry) => (
                <div key={entry.id} className="p-3 rounded-lg bg-ink-200/30 border border-ink-200 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="text-sm font-semibold text-ink-900 mb-1">Q: {entry.question}</div>
                  <div className="text-xs font-bold text-accent-700 uppercase tracking-wider mb-2">{entry.answer.title}</div>
                  <ul className="text-sm space-y-1 text-ink-700 list-disc list-inside">
                    {entry.answer.lines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <div className="text-sm text-ink-500 italic p-4 text-center border-2 border-dashed rounded-lg border-ink-200">
                Ask about WAR, Efficiency, or Consistency to see insights here.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
