import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { toBlob, toPng } from "html-to-image";
import { SummaryChartsSkeleton } from "../components/ChartSkeletons";
import { LoadingSection } from "../components/LoadingSection";
import { SectionShell } from "../components/SectionShell";
import { StatCard } from "../components/StatCard";
import { selectKpiStats, selectSeasonHighlights, selectSummaryStats } from "../data/selectors";
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
  const { year } = useSeasonSelection();
  const { status, season, error } = useSeasonData(year);
  const snapshotRef = useRef<HTMLDivElement | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string>("");
  const summaryStats = useMemo(() => (season ? selectSummaryStats(season) : []), [season]);
  const kpiStats = useMemo(() => (season ? selectKpiStats(season) : []), [season]);
  const highlights = useMemo(() => (season ? selectSeasonHighlights(season) : []), [season]);
  const snapshotFilename = useMemo(() => {
    const date = new Date().toISOString().slice(0, 10);
    return `weekly-summary-${date}.png`;
  }, []);

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

  return (
    <SectionShell
      id="summary"
      title="Season Summary"
      subtitle="League-wide highlights and at-a-glance stats."
      actions={
        <>
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
            <StatCard key={item.label} label={item.label} value={item.value} caption={item.caption} />
          ))}
        </div>
        <Suspense fallback={<SummaryChartsSkeleton />}>
          <SummaryCharts />
        </Suspense>
      </div>
    </SectionShell>
  );
}
