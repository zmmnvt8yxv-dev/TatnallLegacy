import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { buildPlayerIndex } from "../lib/playerName.js";
import { loadCoreData, loadManifest } from "./loader.js";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [manifest, setManifest] = useState(null);
  const [core, setCore] = useState({
    players: [],
    playerIds: [],
    teams: [],
    espnNameMap: {},
    playerSearch: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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


  const playerIdLookup = useMemo(() => {
    const bySleeper = new Map();
    const byEspn = new Map();
    const byUid = new Map();
    for (const player of core.players || []) {
      if (player?.player_uid) byUid.set(player.player_uid, player);
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
