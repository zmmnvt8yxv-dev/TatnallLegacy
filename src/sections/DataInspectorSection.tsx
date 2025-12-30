import { useEffect, useState } from "react";
import { SectionCard } from "../components/SectionCard";
import { dataLoader, type LoaderDiagnostics } from "../data/loader";
import { selectSeasonSummary } from "../data/selectors";
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
    diagnostics: dataLoader.getDiagnostics(),
  });

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setState({ status: "loading", seasons: [], diagnostics: dataLoader.getDiagnostics() });
      try {
        const manifest = await dataLoader.loadManifest();
        const seasons = await Promise.all(
          manifest.years.map(async (year) => {
            const payload = await dataLoader.loadSeason(year);
            const parsed = SeasonSchema.safeParse(payload);
            const emptyLists = EMPTY_LIST_KEYS.filter((key) => payload[key].length === 0);
            return {
              year,
              status: parsed.success ? "valid" : "invalid",
              errors: parsed.success
                ? []
                : parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`),
              summary: selectSeasonSummary(payload),
              emptyLists,
            } satisfies SeasonCheck;
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
          seasons,
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
          </>
        )}
      </div>
    </SectionCard>
  );
}
