import { SectionShell } from "../components/SectionShell";
import { StatCard } from "../components/StatCard";

const summaryStats = [
  { label: "Seasons Tracked", value: "12", caption: "2013–2024 archive" },
  { label: "Active Teams", value: "14", caption: "2 divisions" },
  { label: "Playoff Spots", value: "6", caption: "Top 3 per division" },
  { label: "Weeks Played", value: "8", caption: "Regular season midpoint" },
];

const kpiStats = [
  {
    label: "League Scoring Pace",
    value: "126.4",
    change: "+3.8%",
    caption: "vs. last season",
    trend: [62, 71, 68, 82, 76, 88, 91, 86],
  },
  {
    label: "Average Margin",
    value: "11.2",
    change: "-1.4 pts",
    caption: "tighter games",
    trend: [20, 18, 16, 14, 13, 12, 11, 10],
  },
  {
    label: "Upset Rate",
    value: "33%",
    change: "+6%",
    caption: "favorites falling",
    trend: [24, 28, 26, 31, 33, 35, 32, 34],
  },
];

const highlights = [
  {
    label: "Highest Score",
    value: "172.8",
    caption: "Lightning Bolts vs. Monarchs",
  },
  {
    label: "Longest Win Streak",
    value: "5",
    caption: "Midnight Riders",
  },
  {
    label: "Top Waiver Adds",
    value: "14",
    caption: "Season-to-date claims",
  },
];

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
  return (
    <SectionShell
      id="summary"
      title="Season Summary"
      subtitle="League-wide highlights and at-a-glance stats."
    >
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
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            caption={item.caption}
          />
        ))}
      </div>
    </SectionShell>
  );
}
