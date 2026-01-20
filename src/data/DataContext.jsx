import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { buildPlayerIndex } from "../lib/playerName.js";
import { loadCoreData, loadManifest } from "./loader.js";

import { useManifest } from "../hooks/useManifest.js";
import { useCore } from "../hooks/useCore.js";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { data: manifest, isLoading: manifestLoading, error: manifestError } = useManifest();
  const { data: coreData, isLoading: coreLoading, error: coreError } = useCore();

  const core = useMemo(() => {
    return coreData || {
      players: [],
      playerIds: [],
      teams: [],
      espnNameMap: {},
      playerSearch: [],
    };
  }, [coreData]);

  const loading = manifestLoading || coreLoading;
  const error = manifestError?.message || coreError?.message || "";


  const playerIdLookup = useMemo(() => {
    const bySleeper = new Map();
    const byEspn = new Map();
    const byUid = new Map();
    for (const player of core.players || []) {
      const uid = player?.player_uid || player?.id;
      if (uid) byUid.set(String(uid), player);
    }
    for (const entry of core.playerIds || []) {
      if (entry?.id_type === "sleeper" && entry?.id_value && entry?.player_uid) {
        bySleeper.set(String(entry.id_value), entry.player_uid);
      }
      if (entry?.id_type === "espn" && entry?.id_value && entry?.player_uid) {
        byEspn.set(String(entry.id_value), entry.player_uid);
      }
    }
    return { bySleeper, byEspn, byUid };
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
      espnNameMap: core.espnNameMap || {},
      playerSearch: core.playerSearch || [],
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
