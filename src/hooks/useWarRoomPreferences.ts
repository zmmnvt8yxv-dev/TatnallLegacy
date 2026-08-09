import { useCallback, useEffect, useState } from "react";

export type PlayerIntent = "watch" | "target" | "fade";

interface WarRoomPreferences {
  selectedOwnerUid: string;
  intents: Record<string, PlayerIntent>;
  notes: Record<string, string>;
  compare: string[];
  comparisonHistory: string[][];
}

const STORAGE_KEY = "tatnall-war-room-v1";
const EMPTY: WarRoomPreferences = {
  selectedOwnerUid: "",
  intents: {},
  notes: {},
  compare: [],
  comparisonHistory: [],
};

function readPreferences(): WarRoomPreferences {
  if (typeof window === "undefined") return EMPTY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Partial<WarRoomPreferences>;
    return {
      selectedOwnerUid: parsed.selectedOwnerUid || "",
      intents: parsed.intents || {},
      notes: parsed.notes || {},
      compare: (parsed.compare || []).slice(0, 4),
      comparisonHistory: (parsed.comparisonHistory || []).slice(0, 12),
    };
  } catch {
    return EMPTY;
  }
}

export function useWarRoomPreferences() {
  const [preferences, setPreferences] = useState<WarRoomPreferences>(readPreferences);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const selectOwner = useCallback((selectedOwnerUid: string) => {
    setPreferences((current) => ({ ...current, selectedOwnerUid }));
  }, []);

  const setIntent = useCallback((playerUid: string, intent?: PlayerIntent) => {
    setPreferences((current) => {
      const intents = { ...current.intents };
      if (!intent || intents[playerUid] === intent) delete intents[playerUid];
      else intents[playerUid] = intent;
      return { ...current, intents };
    });
  }, []);

  const setNote = useCallback((playerUid: string, note: string) => {
    setPreferences((current) => ({ ...current, notes: { ...current.notes, [playerUid]: note } }));
  }, []);

  const toggleCompare = useCallback((playerUid: string) => {
    setPreferences((current) => {
      const compare = current.compare.includes(playerUid)
        ? current.compare.filter((uid) => uid !== playerUid)
        : [...current.compare, playerUid].slice(-4);
      const comparisonHistory = compare.length > 1
        ? [compare, ...current.comparisonHistory.filter((row) => row.join(":") !== compare.join(":"))].slice(0, 12)
        : current.comparisonHistory;
      return { ...current, compare, comparisonHistory };
    });
  }, []);

  const clearCompare = useCallback(() => {
    setPreferences((current) => ({ ...current, compare: [] }));
  }, []);

  return { preferences, selectOwner, setIntent, setNote, toggleCompare, clearCompare };
}
