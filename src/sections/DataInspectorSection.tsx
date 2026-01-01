import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SectionCard } from "../components/SectionCard";
import { dataLoader, type LoaderDiagnostics } from "../data/loader";
import { selectSeasonSummary } from "../data/selectors";
import {
  addAliasEntry,
  aliasMap,
  normalizeName,
  resolvePlayerKey,
  type PlayerAlias,
} from "../lib/playerIdentity";
import {
  PowerRankingsSchema,
  SeasonSchema,
  WeeklyRecapsSchema,
  type PowerRankings,
  type SeasonData,
  type WeeklyRecaps,
} from "../data/schema";

const EMPTY_LIST_KEYS: Array<keyof Pick<
  SeasonData,
  "teams" | "matchups" | "transactions" | "draft" | "awards"
>> = ["teams", "matchups", "transactions", "draft", "awards"];

type SeasonCheck = {
  year: number;
  status: "valid" | "invalid";
  errors: string[];
  summary: string;
  emptyLists: string[];
};

type InspectorState = {
  status: "idle" | "loading" | "ready" | "error";
  errorMessage?: string;
  seasons: SeasonCheck[];
  seasonData: SeasonData[];
  diagnostics: LoaderDiagnostics;
  powerRankings?: PowerRankings;
  weeklyRecaps?: WeeklyRecaps;
  powerRankingsStatus?: string;
  weeklyRecapsStatus?: string;
  powerRankingsEmpty?: boolean;
  weeklyRecapsEmpty?: boolean;
};

export function DataInspectorSection() {
  const [state, setState] = useState<InspectorState>({
    status: "idle",
    seasons: [],
    seasonData: [],
    diagnostics: dataLoader.getDiagnostics(),
  });
  const [aliasForm, setAliasForm] = useState({
    alias: "",
    canonical: "",
    team: "",
    pos: "",
  });
  const [aliasVersion, setAliasVersion] = useState(0);

  const handleAliasSubmit = (event: FormEvent) => {
    event.preventDefault();
    const alias = aliasForm.alias.trim();
    const canonical = aliasForm.canonical.trim();
    if (!alias || !canonical) {
      return;
    }
    const entry: PlayerAlias = {
      alias,
      canonical,
      team: aliasForm.team.trim() || undefined,
      pos: aliasForm.pos.trim() || undefined,
    };
    addAliasEntry(entry);
    setAliasForm({ alias: "", canonical: "", team: "", pos: "" });
    setAliasVersion((version) => version + 1);
  };

  const reconciliationReport = useMemo(() => {
    if (state.seasonData.length === 0) {
      return [];
    }

    const buildSimilarityKey = (name: string) => {
      const normalized = normalizeName(name);
      if (!normalized) {
        return "";
      }
      const parts = normalized.split(" ").filter(Boolean);
      if (parts.length === 0) {
        return "";
      }
      const last = parts[parts.length - 1];
      const initials = parts.slice(0, -1).map((part) => part[0]).join("");
      return `${last}-${initials}`;
    };

    const groups = new Map<
      string,
      { names: Set<string>; keys: Set<string>; seasons: Set<number>; count: number }
    >();

    const addName = (name: string | null | undefined, metadata?: { team?: string; pos?: string }, season?: number) => {
      if (!name) {
        return;
      }
      const key = resolvePlayerKey(name, metadata);
      const similarityKey = buildSimilarityKey(name);
      if (!key || !similarityKey) {
        return;
      }
      const entry = groups.get(similarityKey) ?? {
        names: new Set<string>(),
        keys: new Set<string>(),
        seasons: new Set<number>(),
        count: 0,
      };
      entry.names.add(name);
      entry.keys.add(key);
      if (season != null) {
        entry.seasons.add(season);
      }
      entry.count += 1;
      groups.set(similarityKey, entry);
    };

    state.seasonData.forEach((season) => {
      season.lineups?.forEach((entry) => {
        addName(entry.player, undefined, season.year);
      });
      season.draft.forEach((pick) => {
        addName(pick.player, { team: pick.player_nfl ?? undefined }, season.year);
      });
      season.transactions.forEach((transaction) => {
        transaction.entries.forEach((entry) => {
          addName(entry.player, undefined, season.year);
        });
      });
      const playerIndex = season.supplemental?.player_index;
      if (playerIndex) {
        Object.values(playerIndex).forEach((player) => {
          const name = player.full_name ?? player.name ?? null;
          addName(name, { team: player.team ?? undefined, pos: player.pos ?? undefined }, season.year);
        });
      }
    });

    return Array.from(groups.entries())
      .filter(([, entry]) => entry.keys.size > 1)
      .map(([signature, entry]) => ({
        signature,
        names: Array.from(entry.names).sort(),
        keys: Array.from(entry.keys).sort(),
        seasons: Array.from(entry.seasons).sort(),
        count: entry.count,
      }))
      .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
      .slice(0, 50);
  }, [state.seasonData, aliasVersion]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setState({
        status: "loading",
        seasons: [],
        seasonData: [],
        diagnostics: dataLoader.getDiagnostics(),
      });
      try {
        const manifest = await dataLoader.loadManifest();
        const seasonEntries = await Promise.all(
          manifest.years.map(async (year) => {
            const payload = await dataLoader.loadSeason(year);
            const parsed = SeasonSchema.safeParse(payload);
            const emptyLists = EMPTY_LIST_KEYS.filter((key) => payload[key].length === 0);
            return {
              payload,
              check: {
                year,
                status: parsed.success ? "valid" : "invalid",
                errors: parsed.success
                  ? []
                  : parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`),
                summary: selectSeasonSummary(payload),
                emptyLists,
              } satisfies SeasonCheck,
            };
          })
        );

        const powerRankings = await dataLoader.loadPowerRankings();
        const powerRankingResult = PowerRankingsSchema.safeParse(powerRankings);
        const weeklyRecaps = await dataLoader.loadWeeklyRecaps();
        const weeklyRecapsResult = WeeklyRecapsSchema.safeParse(weeklyRecaps);
        const powerRankingsEmpty =
          powerRankingResult.success && powerRankings.entries.length === 0;
        const weeklyRecapsEmpty =
          weeklyRecapsResult.success && weeklyRecaps.entries.length === 0;

        if (!isMounted) return;

        setState({
          status: "ready",
          seasons: seasonEntries.map((entry) => entry.check),
          seasonData: seasonEntries.map((entry) => entry.payload),
          powerRankings: powerRankingResult.success ? powerRankings : undefined,
          weeklyRecaps: weeklyRecapsResult.success ? weeklyRecaps : undefined,
          powerRankingsStatus: powerRankingResult.success
            ? `${powerRankings.entries.length} entries`
            : powerRankingResult.error.issues.map((issue) => issue.message).join("; "),
          weeklyRecapsStatus: weeklyRecapsResult.success
            ? `${weeklyRecaps.entries.length} entries`
            : weeklyRecapsResult.error.issues.map((issue) => issue.message).join("; "),
          powerRankingsEmpty,
          weeklyRecapsEmpty,
          diagnostics: dataLoader.getDiagnostics(),
        });
      } catch (error) {
        if (!isMounted) return;
        setState({
          status: "error",
          seasons: [],
          seasonData: [],
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          diagnostics: dataLoader.getDiagnostics(),
        });
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SectionCard id="data-inspector" aria-labelledby="data-inspector-title">
      <div className="section-header">
        <div className="space-y-1">
          <h2 id="data-inspector-title" className="text-xl font-semibold">
            Data Inspector (Dev Only)
          </h2>
          <p className="section-subtitle">
            Verifies schema compliance for season files, power rankings, and weekly recaps.
          </p>
        </div>
      </div>
      <div className="space-y-4 text-sm text-muted">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <h3 className="text-base font-semibold text-foreground">Loader Diagnostics</h3>
          <dl className="mt-2 space-y-1 text-xs text-muted">
            <div>
              <dt className="font-medium text-foreground">Base path</dt>
              <dd className="break-all">{state.diagnostics.basePath}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Manifest URL</dt>
              <dd className="break-all">{state.diagnostics.manifestUrl}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Fetch failure</dt>
              <dd className="break-all">
                {state.diagnostics.lastFetchError ?? state.diagnostics.manifestError ?? "None"}
              </dd>
            </div>
          </dl>
        </div>
        {state.status === "loading" && <p>Loading data...</p>}
        {state.status === "error" && (
          <p className="text-red-500">Unable to load data: {state.errorMessage}</p>
        )}
        {state.status === "ready" && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface px-4 py-3">
                <h3 className="text-base font-semibold text-foreground">Season Files</h3>
                <ul className="mt-2 space-y-2">
                  {state.seasons.map((season) => (
                    <li key={season.year}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-foreground">{season.year}</span>
                        <span
                          className={
                            season.status === "valid" ? "text-emerald-500" : "text-red-500"
                          }
                        >
                          {season.status === "valid" ? "Valid" : "Invalid"}
                        </span>
                      </div>
                      <p>{season.summary}</p>
                      {season.errors.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-red-400">
                          {season.errors.map((error) => (
                            <li key={error}>{error}</li>
                          ))}
                        </ul>
                      )}
                      {season.emptyLists.length > 0 && (
                        <p className="mt-2 text-xs text-amber-400">
                          Empty lists: {season.emptyLists.join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-surface px-4 py-3">
                <h3 className="text-base font-semibold text-foreground">Supplemental Feeds</h3>
                <dl className="mt-2 space-y-2">
                  <div>
                    <dt className="font-medium text-foreground">Power Rankings</dt>
                    <dd>
                      {state.powerRankingsStatus}
                      {state.powerRankingsEmpty && (
                        <span className="ml-2 text-xs text-amber-400">(empty list)</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">Weekly Recaps</dt>
                    <dd>
                      {state.weeklyRecapsStatus}
                      {state.weeklyRecapsEmpty && (
                        <span className="ml-2 text-xs text-amber-400">(empty list)</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            {(state.powerRankings || state.weeklyRecaps) && (
              <div className="rounded-lg border border-border bg-surface px-4 py-3">
                <h3 className="text-base font-semibold text-foreground">Schema Versions</h3>
                <ul className="mt-2 space-y-1">
                  <li>
                    Power rankings: {state.powerRankings?.schemaVersion ?? "Invalid"}
                  </li>
                  <li>
                    Weekly recaps: {state.weeklyRecaps?.schemaVersion ?? "Invalid"}
                  </li>
                </ul>
              </div>
            )}
            <div className="rounded-lg border border-border bg-surface px-4 py-3">
              <h3 className="text-base font-semibold text-foreground">Player Identity Reconciliation</h3>
              <p className="mt-1 text-xs text-muted">
                Review potential near-duplicate player names and add aliases to the canonical map.
              </p>
              <p className="mt-2 text-xs text-muted">
                Alias entries loaded: {aliasMap.length}
              </p>
              <form className="mt-4 grid gap-3 md:grid-cols-5" onSubmit={handleAliasSubmit}>
                <label className="space-y-1 text-xs text-muted">
                  <span className="font-medium text-foreground">Alias</span>
                  <input
                    type="text"
                    className="input"
                    value={aliasForm.alias}
                    onChange={(event) =>
                      setAliasForm((prev) => ({ ...prev, alias: event.target.value }))
                    }
                    placeholder="e.g. Gabe Davis"
                  />
                </label>
                <label className="space-y-1 text-xs text-muted">
                  <span className="font-medium text-foreground">Canonical</span>
                  <input
                    type="text"
                    className="input"
                    value={aliasForm.canonical}
                    onChange={(event) =>
                      setAliasForm((prev) => ({ ...prev, canonical: event.target.value }))
                    }
                    placeholder="e.g. Gabriel Davis"
                  />
                </label>
                <label className="space-y-1 text-xs text-muted">
                  <span className="font-medium text-foreground">Team (optional)</span>
                  <input
                    type="text"
                    className="input"
                    value={aliasForm.team}
                    onChange={(event) =>
                      setAliasForm((prev) => ({ ...prev, team: event.target.value }))
                    }
                    placeholder="e.g. BUF"
                  />
                </label>
                <label className="space-y-1 text-xs text-muted">
                  <span className="font-medium text-foreground">Pos (optional)</span>
                  <input
                    type="text"
                    className="input"
                    value={aliasForm.pos}
                    onChange={(event) =>
                      setAliasForm((prev) => ({ ...prev, pos: event.target.value }))
                    }
                    placeholder="e.g. WR"
                  />
                </label>
                <div className="flex items-end">
                  <button type="submit" className="btn w-full">
                    Add Alias
                  </button>
                </div>
              </form>
              <div className="mt-4 space-y-3 text-xs text-muted">
                {reconciliationReport.length === 0 ? (
                  <p>No near-duplicate names detected yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {reconciliationReport.map((entry) => (
                      <li key={entry.signature} className="rounded-md border border-border p-3">
                        <p className="font-medium text-foreground">
                          Similarity: {entry.signature}
                        </p>
                        <p className="mt-1">
                          Names: {entry.names.join(", ")}
                        </p>
                        <p className="mt-1">
                          Canonical keys: {entry.keys.join(", ")}
                        </p>
                        <p className="mt-1">
                          Seasons: {entry.seasons.join(", ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}
