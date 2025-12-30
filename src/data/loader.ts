import type { SeasonData } from "./schema";

export type ManifestData = {
  years: number[];
  schemaVersion?: string;
  generatedAt?: string;
};

type DataLoader = {
  loadManifest: () => Promise<ManifestData>;
  loadSeason: (year: number) => Promise<SeasonData>;
  preloadSeasons: (years: number[]) => Promise<SeasonData[]>;
  clearCache: () => void;
};

const ROOT = new URL(".", document.baseURI).pathname.replace(/\/+$/, "") + "/";
const memo = new Map<string, Promise<unknown>>();

function memoize<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (!memo.has(key)) {
    memo.set(key, loader());
  }
  return memo.get(key) as Promise<T>;
}

async function fetchJson<T>(relPath: string, version?: string): Promise<T> {
  const url = ROOT + relPath.replace(/^\/+/, "");
  const cacheBust = version ? `?v=${encodeURIComponent(version)}` : "";
  const response = await fetch(`${url}${cacheBust}`, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json() as Promise<T>;
}

function createDataLoader(): DataLoader {
  const loadManifest = () =>
    memoize("manifest", () => fetchJson<ManifestData>("manifest.json"));

  const loadSeason = (year: number) =>
    memoize(`season:${year}`, async () => {
      const manifest = await loadManifest();
      const version = manifest.generatedAt || manifest.schemaVersion;
      return fetchJson<SeasonData>(`data/${year}.json`, version || undefined);
    });

  const preloadSeasons = async (years: number[]) => {
    const unique = Array.from(new Set(years));
    return Promise.all(unique.map((year) => loadSeason(year)));
  };

  const clearCache = () => {
    memo.clear();
  };

  return { loadManifest, loadSeason, preloadSeasons, clearCache };
}

export const dataLoader = createDataLoader();

declare global {
  interface Window {
    TatnallDataLoader?: DataLoader;
  }
}

if (typeof window !== "undefined") {
  window.TatnallDataLoader = dataLoader;
}
