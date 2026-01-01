import { useEffect, useState } from "react";
import { dataLoader } from "../data/loader";
import type { NflTeams } from "../data/schema";

export type NflTeamsState = {
  status: "loading" | "ready" | "error";
  teams?: NflTeams;
  error?: string;
};

export function useNflTeamsData(): NflTeamsState {
  const [state, setState] = useState<NflTeamsState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    const loadTeams = async () => {
      setState({ status: "loading" });
      try {
        const teams = await dataLoader.loadNflTeams();
        if (!active) return;
        setState({ status: "ready", teams });
      } catch (error) {
        if (!active) return;
        setState({
          status: "error",
          error: error instanceof Error ? error.message : "Unable to load NFL teams",
        });
      }
    };

    loadTeams();

    return () => {
      active = false;
    };
  }, []);

  return state;
}
