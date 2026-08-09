import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { buildPlayerIndex } from "../lib/playerName";

import { useManifest } from "../hooks/useManifest";
import { useCore } from "../hooks/useCore";
import type { DataContextValue, PlayerIdLookup, PlayerIndex } from "../types/index";
import type { Player, PlayerId, Team, PlayerSearchEntry, EspnNameMap } from "../schemas/index";

const DataContext = createContext<DataContextValue | null>(null);

interface DataProviderProps {
  children: ReactNode;
}

export function DataProvider({ children }: DataProviderProps): React.ReactElement {
  const location = useLocation();
  const needsLegacyData = /^\/(matchups|transactions|standings|teams|head-to-head)(\/|$)/.test(location.pathname)
    || /^\/players\/[^/]+/.test(location.pathname);
  const { data: manifest, isLoading: manifestLoading, error: manifestError } = useManifest(needsLegacyData);
  const { data: coreData, isLoading: coreLoading, error: coreError } = useCore(needsLegacyData);

  const core = useMemo(() => {
    return coreData || {
      players: [] as Player[],
      playerIds: [] as PlayerId[],
      teams: [] as Team[],
      espnNameMap: {} as EspnNameMap,
      playerSearch: [] as PlayerSearchEntry[],
    };
  }, [coreData]);

  const loading = needsLegacyData && (manifestLoading || coreLoading);
  const error = manifestError?.message || coreError?.message || "";


  const playerIdLookup = useMemo((): PlayerIdLookup => {
    const bySleeper = new Map<string, string>();
    const byEspn = new Map<string, string>();
    const byUid = new Map<string, Player>();
    for (const player of core.players || []) {
      const playerAny = player as Player & { player_uid?: string };
      const uid = playerAny?.player_uid || player?.id;
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

  const playerIndex = useMemo((): PlayerIndex => {
    return buildPlayerIndex({ players: core.players, playerIds: core.playerIds });
  }, [core.players, core.playerIds]);

  const value = useMemo(
    (): DataContextValue => ({
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

export function useDataContext(): DataContextValue | null {
  return useContext(DataContext);
}
