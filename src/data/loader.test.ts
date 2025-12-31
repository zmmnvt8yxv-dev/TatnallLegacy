import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = import.meta.env;

describe("dataLoader asset URLs", () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.pushState({}, "", "/player/Test");
  });

  afterEach(() => {
    Object.defineProperty(import.meta, "env", { value: originalEnv, configurable: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches manifest and season data using the configured BASE_URL on nested routes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("manifest.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ years: [2024], generatedAt: "test" }),
        } as Response;
      }
      if (url.includes("2024.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            year: 2024,
            teams: [],
            matchups: [],
            transactions: [],
            draft: [],
            awards: [],
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { dataLoader } = await import("./loader");

    await dataLoader.loadSeason(2024);

    const manifestUrl = String(fetchMock.mock.calls[0]?.[0]);
    const seasonUrl = String(fetchMock.mock.calls[1]?.[0]);
    const base = import.meta.env.BASE_URL ?? "/";
    const normalizedBase = base.endsWith("/") ? base : `${base}/`;
    const expectedManifest = new URL(
      `${normalizedBase}data/manifest.json`,
      window.location.origin,
    ).toString();
    const expectedSeason = new URL(
      `${normalizedBase}data/2024.json`,
      window.location.origin,
    ).toString();

    expect(manifestUrl).toBe(expectedManifest);
    expect(seasonUrl.startsWith(expectedSeason)).toBe(true);
    expect(manifestUrl).not.toContain("/player/data");
    expect(seasonUrl).not.toContain("/player/data");
  });
});
