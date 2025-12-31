import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlayerSearch } from "./PlayerSearch";
import { SCHEMA_VERSION, type SeasonData } from "../data/schema";

const openProfile = vi.hoisted(() => vi.fn());
const loadAllSeasons = vi.hoisted(() => vi.fn());

const season: SeasonData = {
  schemaVersion: SCHEMA_VERSION,
  year: 2024,
  league_id: null,
  generated_at: null,
  teams: [],
  matchups: [],
  transactions: [],
  awards: [],
  draft: [{ player: "Patrick Mahomes", player_nfl: "KC" }],
  lineups: [{ player: "Patrick Mahomes", started: true }],
  supplemental: {
    player_index: {
      "1": {
        full_name: "Patrick Mahomes",
        team: "KC",
        pos: "QB",
      },
    },
  },
};

vi.mock("../hooks/useAllSeasonsData", () => ({
  useAllSeasonsData: () => ({
    status: "ready",
    seasons: [season],
    years: [2024],
    loadAllSeasons,
  }),
}));

vi.mock("../hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));

vi.mock("./PlayerProfileProvider", () => ({
  usePlayerProfile: () => ({
    openProfile,
  }),
}));

describe("PlayerSearch", () => {
  it("opens a player profile from search suggestions", async () => {
    const user = userEvent.setup();
    render(<PlayerSearch />);

    const input = screen.getByLabelText("Search players");
    await user.click(input);
    await user.type(input, "pat");

    const suggestion = await screen.findByRole("button", {
      name: /patrick mahomes/i,
    });
    await user.click(suggestion);

    expect(openProfile).toHaveBeenCalledWith("Patrick Mahomes");
  });
});
