import { SectionShell } from "../components/SectionShell";
import { StatCard } from "../components/StatCard";

const summaryStats = [
  { label: "Seasons Tracked", value: "—" },
  { label: "Active Teams", value: "—" },
  { label: "Playoff Spots", value: "—" },
  { label: "Weeks Played", value: "—" },
];

export function SummarySection() {
  return (
    <SectionShell
      id="summary"
      title="Season Summary"
      subtitle="League-wide highlights and at-a-glance stats."
    >
      <div id="summaryStats" className="grid-4">
        {summaryStats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>
    </SectionShell>
  );
}
