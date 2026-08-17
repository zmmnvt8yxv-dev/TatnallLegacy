import { useEffect, useMemo, useState } from "react";

export type SleeperScoreStatus = "scheduled" | "live" | "final";

export interface SleeperMatchupRow {
  matchup_id?: number;
  roster_id?: number;
  points?: number;
  custom_points?: number | null;
  players_points?: Record<string, number>;
}

export interface SleeperScoreFeed {
  scores: Record<number, number>;
  statusByMatchup: Record<number, SleeperScoreStatus>;
  status: SleeperScoreStatus;
  source: "snapshot" | "direct";
  lastVerifiedAt: string | null;
  usingFallback: boolean;
}

interface SleeperMatchupConfig {
  endpoint: string;
  week: number;
  currentWeek: number;
  seasonPhase: string;
  staticFeed: SleeperScoreFeed;
  pollingSeconds?: number;
}

export function officialSleeperScore(row: SleeperMatchupRow): number {
  const value = row.custom_points != null ? row.custom_points : row.points;
  const score = Number(value || 0);
  return Number.isFinite(score) ? Math.round(score * 100) / 100 : 0;
}

export function sleeperScoreStatus(
  rows: SleeperMatchupRow[],
  week: number,
  currentWeek: number,
  seasonPhase: string,
): SleeperScoreStatus {
  if (seasonPhase === "complete" || week < currentWeek) return "final";
  if (seasonPhase === "pre" || week > currentWeek) return "scheduled";
  const hasScoring = rows.some((row) => (
    officialSleeperScore(row) !== 0
    || Object.values(row.players_points || {}).some((value) => Number(value || 0) !== 0)
  ));
  return hasScoring ? "live" : "scheduled";
}

export function buildSleeperScoreFeed(
  rows: SleeperMatchupRow[],
  week: number,
  currentWeek: number,
  seasonPhase: string,
  verifiedAt: string,
): SleeperScoreFeed {
  const byMatchup = new Map<number, SleeperMatchupRow[]>();
  rows.forEach((row) => {
    const matchupId = Number(row.matchup_id || 0);
    if (!matchupId) return;
    byMatchup.set(matchupId, [...(byMatchup.get(matchupId) || []), row]);
  });
  const scores: Record<number, number> = {};
  const statusByMatchup: Record<number, SleeperScoreStatus> = {};
  byMatchup.forEach((matchupRows, matchupId) => {
    const status = sleeperScoreStatus(matchupRows, week, currentWeek, seasonPhase);
    statusByMatchup[matchupId] = status;
    if (status !== "scheduled") {
      matchupRows.forEach((row) => {
        const rosterId = Number(row.roster_id || 0);
        if (rosterId) scores[rosterId] = officialSleeperScore(row);
      });
    }
  });
  const statuses = Object.values(statusByMatchup);
  const status: SleeperScoreStatus = statuses.some((value) => value === "live")
    ? "live"
    : statuses.length > 0 && statuses.every((value) => value === "final")
      ? "final"
      : "scheduled";
  return {
    scores,
    statusByMatchup,
    status,
    source: "direct",
    lastVerifiedAt: verifiedAt,
    usingFallback: false,
  };
}

export function useSleeperMatchups(config?: SleeperMatchupConfig): SleeperScoreFeed {
  const [feed, setFeed] = useState<SleeperScoreFeed>(() => config?.staticFeed || {
    scores: {}, statusByMatchup: {}, status: "scheduled", source: "snapshot",
    lastVerifiedAt: null, usingFallback: false,
  });

  useEffect(() => {
    if (!config) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const activeWeek = config.week === config.currentWeek
      && ["regular", "post"].includes(config.seasonPhase);
    setFeed(config.staticFeed);

    const poll = async () => {
      try {
        const response = await fetch(config.endpoint, { cache: "no-store" });
        if (!response.ok) throw new Error("Sleeper matchup feed unavailable");
        const rows = await response.json() as SleeperMatchupRow[];
        if (cancelled) return;
        setFeed(buildSleeperScoreFeed(
          rows,
          config.week,
          config.currentWeek,
          config.seasonPhase,
          new Date().toISOString(),
        ));
        if (activeWeek) timer = window.setTimeout(poll, (config.pollingSeconds || 60) * 1000);
      } catch {
        if (cancelled) return;
        setFeed((current) => ({ ...current, usingFallback: true }));
        if (activeWeek) timer = window.setTimeout(poll, 30_000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [config]);

  return useMemo(() => feed, [feed]);
}
