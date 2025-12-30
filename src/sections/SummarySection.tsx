export function SummarySection() {
  return (
    <section id="summary" className="panel" aria-labelledby="summary-title">
      <div className="section-header">
        <div className="space-y-1">
          <h2 id="summary-title" className="text-xl font-semibold">
            Season Summary
          </h2>
          <p className="section-subtitle">League-wide highlights and at-a-glance stats.</p>
        </div>
      </div>
      <div id="summaryStats" className="grid-4" />
    </section>
  );
}
