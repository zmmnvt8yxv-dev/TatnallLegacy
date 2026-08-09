import React from "react";
import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import PageTransition from "../../components/PageTransition.jsx";
import { ArchiveError, ArchiveLoading, CompletenessBadge, Eyebrow, PageIntro } from "../../components/v3/ArchiveUI";
import { useIntegrityV3 } from "../../data/v3/hooks";

const DATASETS = ["matchups", "lineups", "transactions", "draft"];

export default function DataHealthPage(): React.ReactElement {
  const integrity = useIntegrityV3();
  if (integrity.isLoading) return <ArchiveLoading label="Running the public integrity report" />;
  if (integrity.error || !integrity.data) return <ArchiveError error={integrity.error} />;
  const data = integrity.data;

  return (
    <PageTransition>
      <PageIntro eyebrow="Trust, made visible" title="Data health." description="What the archive knows, what it does not know, and every league ruling that changes provider evidence. Warnings are published; critical failures block deployment." aside={<div className={`health-verdict health-verdict--${data.status}`}><CheckCircle2 /><strong>No critical failures</strong><span>{data.warnings.length} coverage warnings</span></div>} />

      <section className="archive-section">
        <div className="archive-section-heading"><div><Eyebrow>Coverage matrix</Eyebrow><h2>Evidence by season</h2></div><p>Partial and unavailable are explicit states. Neither is converted to zero.</p></div>
        <div className="coverage-matrix-wrap">
          <table className="coverage-matrix"><thead><tr><th>Season</th>{DATASETS.map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>
            {Object.entries(data.coverage).sort(([a], [b]) => Number(b) - Number(a)).map(([season, coverage]) => (
              <tr key={season}><th>{season}</th>{DATASETS.map((dataset) => <td key={dataset}><CompletenessBadge status={coverage[dataset] || "unknown"} /></td>)}</tr>
            ))}
          </tbody></table>
        </div>
      </section>

      <section className="health-grid">
        <article className="archive-panel"><ShieldCheck className="panel-icon" /><Eyebrow>Audit trail</Eyebrow><h2>{data.corrections.length} corrections applied</h2><div className="correction-list">{data.corrections.map((correction, index) => <div key={String(correction.correction_id || index)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{String(correction.correction_id || "Correction")}</strong><small>{String(correction.dataset || "dataset")} · {String(correction.field || "field")}</small></div><b>{String(correction.status || "applied")}</b></div>)}</div></article>
        <article className="archive-panel"><Database className="panel-icon" /><Eyebrow>Identity graph</Eyebrow><h2>{Number(data.identity.summary.canonical_players || 0).toLocaleString()} canonical players</h2><div className="identity-stats"><div><strong>{Number(data.identity.summary.provider_ids || 0).toLocaleString()}</strong><span>provider IDs linked</span></div><div><strong>{Number(data.identity.summary.safe_record_merges || 0).toLocaleString()}</strong><span>safe merges</span></div><div><strong>{Number(data.identity.summary.quarantined_provider_id_collisions || 0).toLocaleString()}</strong><span>ambiguous IDs quarantined</span></div></div><p>Ambiguous historical IDs are withheld instead of being assigned to the wrong player.</p></article>
      </section>

      <section className="archive-callout archive-callout--warning"><AlertTriangle /><div><Eyebrow>Still needs commissioner evidence</Eyebrow><h2>Open questions</h2><ul>{data.openQuestions.map((question) => <li key={question}>{question}</li>)}</ul></div></section>
    </PageTransition>
  );
}
