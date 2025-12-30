import { useEffect, useState } from "react";
import { dataLoader } from "../data/loader";
import {
  PowerRankingsSchema,
  SeasonSchema,
  WeeklyRecapsSchema,
  type PowerRankings,
  type SeasonData,
  type WeeklyRecaps,
} from "../data/schema";

type SeasonCheck = {
  year: number;
  status: "valid" | "invalid";
  errors: string[];
  summary: string;
};

type InspectorState = {
  status: "idle" | "loading" | "ready" | "error";
  errorMessage?: string;
  seasons: SeasonCheck[];
  powerRankings?: PowerRankings;
  weeklyRecaps?: WeeklyRecaps;
  powerRankingsStatus?: string;
  weeklyRecapsStatus?: string;
};

function summarizeSeason(season: SeasonData) {
  return `${season.teams.length} teams • ${season.matchups.length} matchups • ${season.transactions.length} transactions • ${season.draft.length} draft picks`;
}

export function DataInspectorSection() {
  const [state, setState] = useState<InspectorState>({ status: "idle", seasons: [] });

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setState({ status: "loading", seasons: [] });
      try {
        const manifest = await dataLoader.loadManifest();
        const seasons = await Promise.all(
          manifest.years.map(async (year) => {
            const payload = await dataLoader.loadSeason(year);
            const parsed = SeasonSchema.safeParse(payload);
            return {
              year,
              status: parsed.success ? "valid" : "invalid",
              errors: parsed.success
                ? []
                : parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`),
              summary: summarizeSeason(payload),
            } satisfies SeasonCheck;
          })
        );

        const powerRankings = await dataLoader.loadPowerRankings();
        const powerRankingResult = PowerRankingsSchema.safeParse(powerRankings);
        const weeklyRecaps = await dataLoader.loadWeeklyRecaps();
        const weeklyRecapsResult = WeeklyRecapsSchema.safeParse(weeklyRecaps);

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
        });
      } catch (error) {
        if (!isMounted) return;
        setState({
          status: "error",
          seasons: [],
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section id="data-inspector" className="panel" aria-labelledby="data-inspector-title">
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
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-surface px-4 py-3">
                <h3 className="text-base font-semibold text-foreground">Supplemental Feeds</h3>
                <dl className="mt-2 space-y-2">
                  <div>
                    <dt className="font-medium text-foreground">Power Rankings</dt>
                    <dd>{state.powerRankingsStatus}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">Weekly Recaps</dt>
                    <dd>{state.weeklyRecapsStatus}</dd>
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
    </section>
  );
}
