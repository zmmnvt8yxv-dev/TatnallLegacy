import React from "react";
import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export function ArchiveLoading({ label = "Opening the archive" }: { label?: string }): React.ReactElement {
  return (
    <div className="archive-state" role="status">
      <span className="archive-spinner" aria-hidden="true" />
      <strong>{label}</strong>
      <span>Loading the smallest dataset needed for this page.</span>
    </div>
  );
}

export function ArchiveError({ error }: { error: Error | null }): React.ReactElement {
  return (
    <div className="archive-state archive-state--error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <strong>The archive could not be opened.</strong>
      <span>{error?.message || "The requested data is temporarily unavailable."}</span>
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="archive-eyebrow">{children}</div>;
}

export function PageIntro({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
}): React.ReactElement {
  return (
    <header className="archive-page-intro">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {aside ? <div className="archive-page-intro__aside">{aside}</div> : null}
    </header>
  );
}

export function CompletenessBadge({ status }: { status: string }): React.ReactElement {
  const normalized = status.replace("_", " ");
  return (
    <span className={`completeness completeness--${status}`}>
      {status === "complete" ? <CheckCircle2 aria-hidden="true" /> : <Database aria-hidden="true" />}
      {normalized}
    </span>
  );
}

export function CorrectedBadge(): React.ReactElement {
  return (
    <span className="corrected-badge" title="A documented league ruling is applied to the provider record.">
      <ShieldCheck aria-hidden="true" /> League ruling
    </span>
  );
}

export function OwnerLink({ uid, children }: { uid: string | null; children: React.ReactNode }): React.ReactElement {
  if (!uid) return <>{children}</>;
  return <Link to={`/owners/${uid}`} className="archive-link">{children}</Link>;
}

export function formatPct(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function formatFreshness(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
