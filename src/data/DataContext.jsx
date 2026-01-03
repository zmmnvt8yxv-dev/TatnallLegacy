import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { buildPlayerIndex } from "../lib/playerName.js";
import {
  loadAllTime,
  loadBoomBustMetrics,
  loadCoreData,
  loadManifest,
  loadMetricsSummary,
  loadPlayerStatsCareer,
  loadPlayerStatsSeason,
  loadPlayerStatsWeekly,
  loadSeasonMetrics,
  loadSeasonSummary,
  loadTransactions,
  loadWeekData,
  loadWeeklyMetrics,
} from "./loader.js";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [manifest, setManifest] = useState(null);
  const [core, setCore] = useState({ players: [], playerIds: [], teams: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preloadDone, setPreloadDone] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const manifestData = await loadManifest();
        if (!active) return;
        setManifest(manifestData);
        const coreData = await loadCoreData();
        if (!active) return;
        setCore(coreData);
      } catch (err) {
        if (!active) return;
        setError(String(err?.message || err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!manifest || preloadDone) return undefined;
    const seasons = (manifest?.seasons || []).slice();
    const weeksBySeason = manifest?.weeksBySeason || {};
    (async () => {
      try {
        await loadAllTime();
        await loadMetricsSummary();
        await loadBoomBustMetrics();
        await loadPlayerStatsCareer();
        await Promise.allSettled(
          seasons.map((season) => loadSeasonSummary(season)),
        );
        await Promise.allSettled(
          seasons.map((season) => loadTransactions(season)),
        );
        await Promise.allSettled(
          seasons.map((season) => loadSeasonMetrics(season)),
        );
        await Promise.allSettled(
          seasons.map((season) => loadWeeklyMetrics(season)),
        );
        await Promise.allSettled(
          seasons.map((season) => loadPlayerStatsSeason(season)),
        );
        await Promise.allSettled(
          seasons.map((season) => loadPlayerStatsWeekly(season)),
        );
        await Promise.allSettled(
          seasons.flatMap((season) => {
            const weeks = weeksBySeason[String(season)] || [];
            return weeks.map((week) => loadWeekData(season, week));
          }),
        );
      } catch (err) {
        console.error("DATA_PRELOAD_ERROR", err);
      } finally {
        if (active) setPreloadDone(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [manifest, preloadDone]);

  const playerIdLookup = useMemo(() => {
    const bySleeper = new Map();
    const byUid = new Map();
    for (const player of core.players || []) {
      if (player?.player_uid) byUid.set(player.player_uid, player);
    }
    for (const entry of core.playerIds || []) {
      if (entry?.id_type === "sleeper" && entry?.id_value && entry?.player_uid) {
        bySleeper.set(String(entry.id_value), entry.player_uid);
      }
    }
    return { bySleeper, byUid };
  }, [core.players, core.playerIds]);

  const playerIndex = useMemo(() => {
    return buildPlayerIndex({ players: core.players, playerIds: core.playerIds });
  }, [core.players, core.playerIds]);

  const value = useMemo(
    () => ({
      manifest,
      players: core.players,
      playerIds: core.playerIds,
      teams: core.teams,
      playerIdLookup,
      playerIndex,
      loading,
      error,
    }),
    [manifest, core, playerIdLookup, playerIndex, loading, error],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataContext() {
  return useContext(DataContext);
}
