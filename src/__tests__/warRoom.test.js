import { act, renderHook } from "@testing-library/react";
import { dedupeDraftPicks } from "../hooks/useSleeperDraft";
import { useWarRoomPreferences } from "../hooks/useWarRoomPreferences";
import { sanitizePublicData } from "../lib/publicIdentity";

describe("War Room client behavior", () => {
  beforeEach(() => window.localStorage.clear());

  test("corrected and duplicate Sleeper picks retain the latest verified row", () => {
    const rows = dedupeDraftPicks([
      { pick_no: 2, player_id: "old" },
      { pick_no: 1, player_id: "first" },
      { pick_no: 2, player_id: "corrected" },
    ]);
    expect(rows.map((row) => row.player_id)).toEqual(["first", "corrected"]);
  });

  test("comparison state is device-local and limited to four players", () => {
    const { result } = renderHook(() => useWarRoomPreferences());
    act(() => {
      result.current.selectOwner("owner-conner");
      ["one", "two", "three", "four", "five"].forEach(result.current.toggleCompare);
    });
    expect(result.current.preferences.selectedOwnerUid).toBe("owner-conner");
    expect(result.current.preferences.compare).toEqual(["two", "three", "four", "five"]);
    expect(JSON.parse(window.localStorage.getItem("tatnall-war-room-v1"))).toMatchObject({
      selectedOwnerUid: "owner-conner",
      compare: ["two", "three", "four", "five"],
    });
  });

  test("blocked source labels are sanitized recursively before rendering", () => {
    const payload = sanitizePublicData({ teamName: "Only I can say the N-word", copy: ["vs N-word"] });
    expect(payload).toEqual({ teamName: "Team Duncan", copy: ["vs Team Duncan"] });
  });
});
