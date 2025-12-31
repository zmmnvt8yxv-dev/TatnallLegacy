import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toBlob, toPng } from "html-to-image";
import { SummaryChartsSkeleton } from "../components/ChartSkeletons";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { StatCard } from "../components/StatCard";
import {
  selectKpiStats,
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
  const userSelectedWeekRef = useRef(false);
  const [snapshotStatus, setSnapshotStatus] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<number | "all">("all");
  const availableWeeks = useMemo(() => (season ? selectVisibleWeeks(season) : []), [season]);
  const summaryStats = useMemo(() => (season ? selectSummaryStats(season) : []), [season]);
  const kpiStats = useMemo(() => (season ? selectKpiStats(season) : []), [season]);
  const highlights = useMemo(() => (season ? selectSeasonHighlights(season) : []), [season]);
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
    userSelectedWeekRef.current = false;
    setSelectedWeek("all");
  }, [year]);

  useEffect(() => {
    if (!season || year == null) {
      return;
    }
    if (userSelectedWeekRef.current) {
      return;
    }
    if (isCurrentSeason && availableWeeks.length > 0) {
      setSelectedWeek(availableWeeks[availableWeeks.length - 1]);
    }
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
  const scoreboardMatchups = useMemo(() => {
    if (selectedWeek === "all") {
      return [];
    }
    return visibleMatchups.filter((matchup) => matchup.week === selectedWeek);
  }, [selectedWeek, visibleMatchups]);
  const weekMatchups =
    selectedWeek === "all"
      ? visibleMatchups.length
      : scoreboardMatchups.length;
  const weekLabel = selectedWeek === "all" ? "Season to date" : `Week ${selectedWeek}`;
  const filteredSeason =
    selectedWeek === "all"
      ? season
      : {
          ...season,
          matchups: season.matchups.filter((matchup) => matchup.week === selectedWeek),
        };

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
              value={selectedWeek === "all" ? "all" : String(selectedWeek)}
              onChange={(event) => {
                const value = event.target.value;
                userSelectedWeekRef.current = true;
                setSelectedWeek(value === "all" ? "all" : Number(value));
              }}
              disabled={availableWeeks.length === 0}
            >
              <option value="all">Season to date</option>
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
            {scoreboardMatchups.length === 0 ? (
              <p className="text-sm text-muted">No matchups recorded for this week.</p>
            ) : (
              <div className="matchups-grid">
                {scoreboardMatchups.map((matchup) => {
                  const homeScore = matchup.home_score ?? null;
                  const awayScore = matchup.away_score ?? null;
                  const status = homeScore || awayScore ? "Final" : "Upcoming";
                  const homeTeam = matchup.home_team?.trim() || "Home";
                  const awayTeam = matchup.away_team?.trim() || "Away";
                  return (
                    <article
                      key={`${matchup.week}-${matchup.home_team}-${matchup.away_team}`}
                      className="matchup-card"
                    >
                      <div className="matchup-card__header">
                        <p className="matchup-card__week">Week {matchup.week}</p>
                        <span
                          className={`status-pill ${
                            status === "Final" ? "status-pill--active" : "status-pill--upcoming"
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      <div className="matchup-card__body">
                        <div className="matchup-card__team">
                          <span>{awayTeam}</span>
                          <strong>{awayScore != null ? awayScore.toFixed(1) : "—"}</strong>
                        </div>
                        <div className="matchup-card__team">
                          <span>{homeTeam}</span>
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
      </div>
    </SectionShell>
  );
}
