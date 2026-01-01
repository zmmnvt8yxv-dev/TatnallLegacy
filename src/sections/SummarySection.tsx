import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toBlob, toPng } from "html-to-image";
import { SummaryChartsSkeleton } from "../components/ChartSkeletons";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { AiHelperPanel } from "../components/AiHelperPanel";
import { StatCard } from "../components/StatCard";
import {
  selectKpiStats,
  selectStandingsHighlights,
  selectSeasonHighlights,
  selectSummaryStats,
  selectVisibleWeeks,
} from "../data/selectors";
import { useSeasonData } from "../hooks/useSeasonData";
import { useSeasonSelection } from "../hooks/useSeasonSelection";

const SummaryCharts = lazy(() => import("./SummaryCharts"));

const snapshotOptions = {
  cacheBust: true,
  pixelRatio: 2,
  backgroundColor: "#0f1116",
};

function MiniSparkline({ data, label }: { data: number[]; label: string }) {
  const max = Math.max(...data);
  return (
    <div className="sparkline" role="img" aria-label={`${label} trend`}>
      {data.map((value, index) => (
        <span
          key={`${label}-${index}`}
          className="sparkline__bar"
          style={{ height: `${Math.max((value / max) * 100, 12)}%` }}
        />
      ))}
    </div>
  );
}

export function SummarySection() {
  const { year, years } = useSeasonSelection();
  const { status, season, error } = useSeasonData(year);
  const snapshotRef = useRef<HTMLDivElement | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<number | "all" | "full">("all");
  const availableWeeks = useMemo(() => (season ? selectVisibleWeeks(season) : []), [season]);
  const summaryStats = useMemo(() => (season ? selectSummaryStats(season) : []), [season]);
  const highlights = useMemo(() => (season ? selectSeasonHighlights(season) : []), [season]);
  const standingsHighlights = useMemo(
    () => (season ? selectStandingsHighlights(season) : []),
    [season],
  );
  const lastYearRef = useRef<number | null>(null);
  const filteredSeason = useMemo(() => {
    if (!season) {
      return null;
    }
    if (selectedWeek === "all" || selectedWeek === "full") {
      return season;
    }
    return {
      ...season,
      matchups: season.matchups.filter((matchup) => matchup.week === selectedWeek),
    };
  }, [season, selectedWeek]);
  const kpiStats = useMemo(
    () => (filteredSeason ? selectKpiStats(filteredSeason) : []),
    [filteredSeason],
  );
  const champion = useMemo(() => {
    if (!season) {
      return null;
    }
    const byFinalRank = season.teams.find((team) => team.final_rank === 1);
    if (byFinalRank) {
      return byFinalRank;
    }
    const sorted = [...season.teams].sort(
      (a, b) => (a.regular_season_rank ?? 99) - (b.regular_season_rank ?? 99),
    );
    return sorted[0] ?? null;
  }, [season]);
  const finalMatchup = useMemo(() => {
    if (!season) {
      return null;
    }
    const playoffMatchups = season.matchups.filter((matchup) => matchup.is_playoff);
    if (playoffMatchups.length === 0) {
      return null;
    }
    const latestWeek = Math.max(...playoffMatchups.map((matchup) => matchup.week ?? 0));
    const finalWeekMatchups = playoffMatchups.filter(
      (matchup) => (matchup.week ?? 0) === latestWeek,
    );
    return finalWeekMatchups
      .map((matchup) => ({
        ...matchup,
        total: (matchup.home_score ?? 0) + (matchup.away_score ?? 0),
      }))
      .sort((a, b) => b.total - a.total)[0];
  }, [season]);
  const snapshotFilename = useMemo(() => {
    const date = new Date().toISOString().slice(0, 10);
    return `weekly-summary-${date}.png`;
  }, []);
  const isCurrentSeason = year != null && years.length > 0 && year === Math.max(...years);

  useEffect(() => {
    if (!season || year == null) {
      return;
    }
    if (lastYearRef.current === year) {
      return;
    }
    lastYearRef.current = year;
    if (isCurrentSeason && availableWeeks.length > 0) {
      setSelectedWeek(availableWeeks[availableWeeks.length - 1]);
      return;
    }
    setSelectedWeek("full");
  }, [availableWeeks, isCurrentSeason, season, year]);

  if (status === "loading") {
    return <LoadingSection title="Season Summary" subtitle="Loading season data…" />;
  }

  if (status === "error" || !season) {
    return (
      <SectionShell
        id="summary"
        title="Season Summary"
        subtitle="League-wide highlights and at-a-glance stats."
      >
        <p className="text-sm text-red-500">Unable to load season data: {error ?? "Unknown error"}</p>
      </SectionShell>
    );
  }

  const resetStatus = () => {
    setSnapshotStatus("");
  };

  const handleExport = async () => {
    resetStatus();
    if (!snapshotRef.current) {
      setSnapshotStatus("Snapshot is unavailable.");
      return;
    }
    try {
      setSnapshotStatus("Preparing snapshot…");
      const dataUrl = await toPng(snapshotRef.current, snapshotOptions);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = snapshotFilename;
      link.click();
      setSnapshotStatus("Snapshot downloaded.");
    } catch (error) {
      console.error("Unable to export snapshot", error);
      setSnapshotStatus("Unable to export snapshot.");
    }
  };

  const handleShare = async () => {
    resetStatus();
    if (!snapshotRef.current) {
      setSnapshotStatus("Snapshot is unavailable.");
      return;
    }
    try {
      setSnapshotStatus("Preparing share…");
      const blob = await toBlob(snapshotRef.current, snapshotOptions);
      if (blob) {
        const file = new File([blob], snapshotFilename, { type: blob.type || "image/png" });
        const canShare = typeof navigator !== "undefined" && "share" in navigator;
        if (canShare && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
          await navigator.share({
            title: "Tatnall Weekly Summary",
            text: "Weekly summary snapshot",
            files: [file],
          });
          setSnapshotStatus("Snapshot shared.");
          return;
        }
      }
      await navigator.clipboard?.writeText(window.location.href);
      setSnapshotStatus("Share link copied.");
    } catch (error) {
      console.error("Unable to share snapshot", error);
      setSnapshotStatus("Unable to share snapshot.");
    }
  };

  const visibleMatchups = season.matchups.filter(
    (matchup) => matchup.week != null && availableWeeks.includes(matchup.week),
  );
  const weekMatchups =
    selectedWeek === "all" || selectedWeek === "full"
      ? visibleMatchups.length
      : visibleMatchups.filter((matchup) => matchup.week === selectedWeek).length;
  const weekLabel =
    selectedWeek === "all"
      ? "Season to date"
      : selectedWeek === "full"
        ? "Full season"
        : `Week ${selectedWeek}`;
  const selectedWeekMatchups =
    selectedWeek === "all" || selectedWeek === "full"
      ? []
      : visibleMatchups.filter((matchup) => matchup.week === selectedWeek);
  const isFullSeason = selectedWeek === "full";
  const safeNumber = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const scoredMatchups = visibleMatchups.filter(
    (matchup) => safeNumber(matchup.home_score) || safeNumber(matchup.away_score),
  );
  const totalPoints = scoredMatchups.reduce(
    (sum, matchup) => sum + safeNumber(matchup.home_score) + safeNumber(matchup.away_score),
    0,
  );
  const totalMargins = scoredMatchups.reduce(
    (sum, matchup) =>
      sum + Math.abs(safeNumber(matchup.home_score) - safeNumber(matchup.away_score)),
    0,
  );
  const avgPointsPerMatchup = scoredMatchups.length
    ? totalPoints / scoredMatchups.length
    : 0;
  const avgMargin = scoredMatchups.length ? totalMargins / scoredMatchups.length : 0;
  const formatScore = (value: number) => value.toFixed(1);
  const formatMatchupLabel = (matchup: typeof scoredMatchups[number]) => {
    const week = matchup.week != null ? `Week ${matchup.week}` : "Week —";
    return `${matchup.away_team ?? "Away"} vs. ${matchup.home_team ?? "Home"} (${week})`;
  };
  const highestCombinedMatchup = scoredMatchups.reduce<typeof scoredMatchups[number] | null>(
    (best, matchup) => {
      if (!best) {
        return matchup;
      }
      const bestTotal = safeNumber(best.home_score) + safeNumber(best.away_score);
      const currentTotal = safeNumber(matchup.home_score) + safeNumber(matchup.away_score);
      return currentTotal > bestTotal ? matchup : best;
    },
    null,
  );
  const biggestBlowout = scoredMatchups.reduce<typeof scoredMatchups[number] | null>(
    (best, matchup) => {
      if (!best) {
        return matchup;
      }
      const bestMargin = Math.abs(safeNumber(best.home_score) - safeNumber(best.away_score));
      const currentMargin = Math.abs(
        safeNumber(matchup.home_score) - safeNumber(matchup.away_score),
      );
      return currentMargin > bestMargin ? matchup : best;
    },
    null,
  );
  const closestFinish = scoredMatchups.reduce<typeof scoredMatchups[number] | null>(
    (best, matchup) => {
      const currentMargin = Math.abs(
        safeNumber(matchup.home_score) - safeNumber(matchup.away_score),
      );
      if (!best) {
        return matchup;
      }
      const bestMargin = Math.abs(safeNumber(best.home_score) - safeNumber(best.away_score));
      if (currentMargin === 0 && bestMargin === 0) {
        return best;
      }
      if (bestMargin === 0) {
        return matchup;
      }
      return currentMargin < bestMargin ? matchup : best;
    },
    null,
  );
  const fullSeasonStats = [
    {
      label: "Champion",
      value: champion?.team_name ?? "—",
      caption: champion?.owner ?? "League winner",
    },
    {
      label: "Total Points Scored",
      value: formatScore(totalPoints),
      caption: `${scoredMatchups.length} matchups logged`,
    },
    {
      label: "Average Matchup Score",
      value: formatScore(avgPointsPerMatchup),
      caption: "Combined points per matchup",
    },
    {
      label: "Average Margin",
      value: formatScore(avgMargin),
      caption: "Typical win gap",
    },
  ];
  const fullSeasonInsights = standingsHighlights.map((item) => ({
    label: item.label,
    value: item.value,
    caption: "Season standings highlight",
  }));
  const funFacts = [
    {
      label: "Highest Combined Score",
      value: highestCombinedMatchup
        ? formatScore(
            safeNumber(highestCombinedMatchup.home_score) +
              safeNumber(highestCombinedMatchup.away_score),
          )
        : "—",
      caption: highestCombinedMatchup ? formatMatchupLabel(highestCombinedMatchup) : "—",
    },
    {
      label: "Biggest Blowout",
      value: biggestBlowout
        ? formatScore(
            Math.abs(safeNumber(biggestBlowout.home_score) - safeNumber(biggestBlowout.away_score)),
          )
        : "—",
      caption: biggestBlowout ? formatMatchupLabel(biggestBlowout) : "—",
    },
    {
      label: "Closest Finish",
      value: closestFinish
        ? formatScore(
            Math.abs(safeNumber(closestFinish.home_score) - safeNumber(closestFinish.away_score)),
          )
        : "—",
      caption: closestFinish ? formatMatchupLabel(closestFinish) : "—",
    },
    {
      label: "Finals Shootout",
      value: finalMatchup ? formatScore(finalMatchup.total) : "—",
      caption: finalMatchup
        ? `${finalMatchup.away_team} vs. ${finalMatchup.home_team} (Playoffs)`
        : "—",
    },
  ];

  return (
    <SectionShell
      id="summary"
      title="Season Summary"
      subtitle="League-wide highlights and at-a-glance stats."
      actions={
        <>
          <div className="summary-week-select">
            <label className="summary-week-select__label" htmlFor="summary-week-select">
              Week focus
            </label>
            <select
              id="summary-week-select"
              className="input"
              value={
                selectedWeek === "all"
                  ? "all"
                  : selectedWeek === "full"
                    ? "full"
                    : String(selectedWeek)
              }
              onChange={(event) => {
                const value = event.target.value;
                if (value === "all" || value === "full") {
                  setSelectedWeek(value);
                  return;
                }
                setSelectedWeek(Number(value));
              }}
              disabled={availableWeeks.length === 0}
            >
              <option value="all">Season to date</option>
              <option value="full">Full season</option>
              {availableWeeks.map((week) => (
                <option key={week} value={week}>
                  Week {week}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleExport}>
            Export snapshot
          </button>
          <button type="button" className="btn" onClick={handleShare}>
            Share summary
          </button>
          {snapshotStatus ? (
            <span className="text-xs text-muted" role="status" aria-live="polite">
              {snapshotStatus}
            </span>
          ) : null}
        </>
      }
    >
      <div id="summarySnapshot" ref={snapshotRef} className="space-y-6">
        {isFullSeason ? (
          <>
            <div className="summary-full-intro">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">Full season recap</p>
              <p className="text-sm text-muted">
                {weekMatchups} matchups archived • {formatScore(totalPoints)} total points
              </p>
            </div>

            <div id="summaryStats" className="grid-4">
              {fullSeasonStats.map((stat) => (
                <StatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  caption={stat.caption}
                />
              ))}
            </div>

            <div className="summary-block">
              <div className="section-heading">Season insights</div>
              <p className="section-caption">Standout performances across the full schedule.</p>
              <div className="summary-highlights">
                {fullSeasonInsights.map((item) => (
                  <StatCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    caption={item.caption}
                  />
                ))}
              </div>
            </div>

            <div className="summary-block">
              <div className="section-heading">Fun facts</div>
              <p className="section-caption">Moments that defined the season.</p>
              <div className="summary-highlights">
                {funFacts.map((item) => (
                  <StatCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    caption={item.caption}
                  />
                ))}
              </div>
            </div>

            <AiHelperPanel />

            <Suspense fallback={<SummaryChartsSkeleton />}>
              {filteredSeason ? <SummaryCharts season={filteredSeason} /> : null}
            </Suspense>
          </>
        ) : (
          <>
            <div id="summaryStats" className="grid-4">
              {summaryStats.map((stat) => (
                <StatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  caption={stat.caption}
                />
              ))}
            </div>

            <div className="summary-week-meta">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">{weekLabel}</p>
              <p className="text-sm text-muted">{weekMatchups} matchups in view.</p>
              {selectedWeek !== "all" && weekMatchups === 0 ? (
                <p className="text-xs text-amber-300">No matchup data for this week yet.</p>
              ) : null}
            </div>

            {selectedWeek !== "all" ? (
              <div className="summary-block">
                <div className="section-heading">Week {selectedWeek} Scoreboard</div>
                <p className="section-caption">Box score snapshots for each matchup.</p>
                {selectedWeekMatchups.length === 0 ? (
                  <p className="text-sm text-muted">No matchups recorded for this week.</p>
                ) : (
                  <div className="matchups-grid">
                    {selectedWeekMatchups.map((matchup) => {
                      const homeScore = matchup.home_score ?? null;
                      const awayScore = matchup.away_score ?? null;
                      const status = homeScore || awayScore ? "Final" : "Upcoming";
                      return (
                        <article
                          key={`${matchup.week}-${matchup.home_team}-${matchup.away_team}`}
                          className="matchup-card"
                        >
                          <div className="matchup-card__header">
                            <p className="matchup-card__week">Week {matchup.week}</p>
                            <span
                              className={`status-pill ${
                                status === "Final"
                                  ? "status-pill--active"
                                  : "status-pill--upcoming"
                              }`}
                            >
                              {status}
                            </span>
                          </div>
                          <div className="matchup-card__body">
                            <div className="matchup-card__team">
                              <span>{matchup.away_team}</span>
                              <strong>{awayScore != null ? awayScore.toFixed(1) : "—"}</strong>
                            </div>
                            <div className="matchup-card__team">
                              <span>{matchup.home_team}</span>
                              <strong>{homeScore != null ? homeScore.toFixed(1) : "—"}</strong>
                            </div>
                          </div>
                          <p className="matchup-card__kickoff">Box score summary</p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="summary-kpis">
              {kpiStats.map((stat) => (
                <div key={stat.label} className="kpi-card">
                  <div>
                    <p className="kpi-card__label">{stat.label}</p>
                    <div className="kpi-card__value-row">
                      <p className="kpi-card__value">{stat.value}</p>
                      <span className="kpi-card__change">{stat.change}</span>
                    </div>
                    <p className="kpi-card__caption">{stat.caption}</p>
                  </div>
                  <MiniSparkline data={stat.trend} label={stat.label} />
                </div>
              ))}
            </div>

            <div className="summary-highlights">
              {highlights.map((item) => (
                <StatCard
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  caption={item.caption}
                />
              ))}
            </div>
            <Suspense fallback={<SummaryChartsSkeleton />}>
              {filteredSeason ? <SummaryCharts season={filteredSeason} /> : null}
            </Suspense>
          </>
        )}
      </div>
    </SectionShell>
  );
}
