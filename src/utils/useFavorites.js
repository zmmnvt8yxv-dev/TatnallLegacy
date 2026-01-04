import { useEffect, useMemo, useState } from "react";
import { readStorage, writeStorage } from "./persistence.js";

const STORAGE_KEY = "tatnall-favorites";

const normalizeTeam = (value) => (value ? String(value).trim() : "");

const sortUnique = (items) => Array.from(new Set(items.filter(Boolean))).sort();

export function useFavorites() {
  const [favorites, setFavorites] = useState(() =>
    readStorage(STORAGE_KEY, { players: [], teams: [] }),
  );

  useEffect(() => {
    writeStorage(STORAGE_KEY, favorites);
  }, [favorites]);

  const togglePlayer = (playerId) => {
    const id = String(playerId);
    setFavorites((prev) => {
      const next = new Set(prev.players || []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, players: Array.from(next) };
    });
  };

  const toggleTeam = (teamName) => {
    const normalized = normalizeTeam(teamName);
    if (!normalized) return;
    setFavorites((prev) => {
      const next = new Set(prev.teams || []);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      return { ...prev, teams: Array.from(next) };
    });
  };

  const normalizedFavorites = useMemo(
    () => ({
      players: sortUnique(favorites.players || []).map(String),
      teams: sortUnique((favorites.teams || []).map(normalizeTeam)),
    }),
    [favorites],
  );

  return { favorites: normalizedFavorites, togglePlayer, toggleTeam };
}
