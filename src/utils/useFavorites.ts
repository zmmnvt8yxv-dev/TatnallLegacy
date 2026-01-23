import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readStorage, writeStorage } from "./persistence";

const STORAGE_KEY = "tatnall-favorites";

/** Favorites data structure */
export interface Favorites {
  players: string[];
  teams: string[];
}

/** Return type for useFavorites hook */
export interface UseFavoritesResult {
  favorites: Favorites;
  togglePlayer: (playerId: string | number) => void;
  toggleTeam: (teamName: string) => void;
}

/**
 * Normalizes a team name by trimming whitespace
 */
const normalizeTeam = (value: string | null | undefined): string =>
  value ? String(value).trim() : "";

/**
 * Returns a sorted array of unique non-empty values
 */
const sortUnique = (items: string[]): string[] =>
  Array.from(new Set(items.filter(Boolean))).sort();

/**
 * Hook for managing favorite players and teams
 * Persists to localStorage and uses React Query for state management
 *
 * @returns Object with favorites data and toggle functions
 */
export function useFavorites(): UseFavoritesResult {
  const queryClient = useQueryClient();

  const { data: favorites } = useQuery<Favorites>({
    queryKey: ["favorites"],
    queryFn: () => readStorage<Favorites>(STORAGE_KEY, { players: [], teams: [] }),
    staleTime: Infinity,
  });

  const mutation = useMutation<Favorites, Error, Favorites, { previousFavorites: Favorites | undefined }>({
    mutationFn: async (newFavorites: Favorites): Promise<Favorites> => {
      writeStorage(STORAGE_KEY, newFavorites);
      return newFavorites;
    },
    onMutate: async (newFavorites: Favorites) => {
      await queryClient.cancelQueries({ queryKey: ["favorites"] });
      const previousFavorites = queryClient.getQueryData<Favorites>(["favorites"]);
      queryClient.setQueryData<Favorites>(["favorites"], newFavorites);
      return { previousFavorites };
    },
    onError: (_err, _newFavorites, context) => {
      if (context?.previousFavorites) {
        queryClient.setQueryData<Favorites>(["favorites"], context.previousFavorites);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const togglePlayer = (playerId: string | number): void => {
    const id = String(playerId);
    const prev = favorites || { players: [], teams: [] };
    const players = new Set(prev.players || []);
    if (players.has(id)) players.delete(id);
    else players.add(id);
    mutation.mutate({ ...prev, players: Array.from(players) });
  };

  const toggleTeam = (teamName: string): void => {
    const normalized = normalizeTeam(teamName);
    if (!normalized) return;
    const prev = favorites || { players: [], teams: [] };
    const teams = new Set(prev.teams || []);
    if (teams.has(normalized)) teams.delete(normalized);
    else teams.add(normalized);
    mutation.mutate({ ...prev, teams: Array.from(teams) });
  };

  const normalizedFavorites: Favorites = {
    players: sortUnique((favorites?.players || []).map(String)),
    teams: sortUnique((favorites?.teams || []).map(normalizeTeam)),
  };

  return { favorites: normalizedFavorites, togglePlayer, toggleTeam };
}
