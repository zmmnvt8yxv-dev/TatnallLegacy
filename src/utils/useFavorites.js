import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readStorage, writeStorage } from "./persistence.js";

const STORAGE_KEY = "tatnall-favorites";

const normalizeTeam = (value) => (value ? String(value).trim() : "");
const sortUnique = (items) => Array.from(new Set(items.filter(Boolean))).sort();

export function useFavorites() {
  const queryClient = useQueryClient();

  const { data: favorites } = useQuery({
    queryKey: ["favorites"],
    queryFn: () => readStorage(STORAGE_KEY, { players: [], teams: [] }),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (newFavorites) => {
      writeStorage(STORAGE_KEY, newFavorites);
      return newFavorites;
    },
    onMutate: async (newFavorites) => {
      await queryClient.cancelQueries({ queryKey: ["favorites"] });
      const previousFavorites = queryClient.getQueryData(["favorites"]);
      queryClient.setQueryData(["favorites"], newFavorites);
      return { previousFavorites };
    },
    onError: (err, newFavorites, context) => {
      queryClient.setQueryData(["favorites"], context.previousFavorites);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });

  const togglePlayer = (playerId) => {
    const id = String(playerId);
    const prev = favorites || { players: [], teams: [] };
    const players = new Set(prev.players || []);
    if (players.has(id)) players.delete(id);
    else players.add(id);
    mutation.mutate({ ...prev, players: Array.from(players) });
  };

  const toggleTeam = (teamName) => {
    const normalized = normalizeTeam(teamName);
    if (!normalized) return;
    const prev = favorites || { players: [], teams: [] };
    const teams = new Set(prev.teams || []);
    if (teams.has(normalized)) teams.delete(normalized);
    else teams.add(normalized);
    mutation.mutate({ ...prev, teams: Array.from(teams) });
  };

  const normalizedFavorites = {
    players: sortUnique((favorites?.players || []).map(String)),
    teams: sortUnique((favorites?.teams || []).map(normalizeTeam)),
  };

  return { favorites: normalizedFavorites, togglePlayer, toggleTeam };
}
