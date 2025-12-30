import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "../components/ChartCard";
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

const pointsTrend = [
  { week: "W1", pointsFor: 121.4, pointsAgainst: 117.2, net: 4.2 },
  { week: "W2", pointsFor: 128.9, pointsAgainst: 120.5, net: 8.4 },
  { week: "W3", pointsFor: 134.6, pointsAgainst: 126.7, net: 7.9 },
  { week: "W4", pointsFor: 129.8, pointsAgainst: 124.2, net: 5.6 },
  { week: "W5", pointsFor: 138.1, pointsAgainst: 132.4, net: 5.7 },
  { week: "W6", pointsFor: 132.3, pointsAgainst: 129.1, net: 3.2 },
  { week: "W7", pointsFor: 140.7, pointsAgainst: 135.9, net: 4.8 },
  { week: "W8", pointsFor: 137.5, pointsAgainst: 131.8, net: 5.7 },
];

const rivalryTeams = [
  "Midnight Riders",
  "Neon Knights",
  "Emerald City",
  "Lightning Bolts",
  "Monarchs",
];

const rivalryMatrix = [
  { team: "Midnight Riders", values: [null, 4.2, 3.1, 4.8, 2.5] },
  { team: "Neon Knights", values: [4.2, null, 2.7, 3.8, 4.1] },
  { team: "Emerald City", values: [3.1, 2.7, null, 4.4, 2.2] },
  { team: "Lightning Bolts", values: [4.8, 3.8, 4.4, null, 3.6] },
  { team: "Monarchs", values: [2.5, 4.1, 2.2, 3.6, null] },
];

const awards = [
  {
    title: "Biggest Upset",
    value: "+28.4 pts",
    detail: "Ironclads over Midnight Riders",
    note: "Week 4 underdog win",
  },
  {
    title: "Highest Score",
    value: "172.8 pts",
    detail: "Lightning Bolts",
    note: "Week 6 vs. Monarchs",
  },
  {
    title: "Lowest Score",
    value: "74.1 pts",
    detail: "Coastal Kings",
    note: "Week 2 slump",
  },
  {
    title: "Closest Finish",
    value: "0.6 pts",
    detail: "Emerald City over Golden State",
    note: "Week 7 nail-biter",
  },
  {
    title: "Most Points in a Loss",
    value: "148.3 pts",
    detail: "Monarchs",
    note: "Week 5 heartbreak",
  },
  {
    title: "Largest Blowout",
    value: "49.7 pts",
    detail: "Midnight Riders",
    note: "Week 1 statement",
  },
];

const rivalryValues = rivalryMatrix
  .flatMap((row) => row.values)
  .filter((value): value is number => value !== null);
const rivalryMax = Math.max(...rivalryValues, 1);

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
          <StatCard key={item.label} label={item.label} value={item.value} caption={item.caption} />
        ))}
      </div>

      <div className="summary-block">
        <div className="section-heading">Points For/Against Trends</div>
        <p className="section-caption">Weekly scoring swings show how offense and defense have evolved.</p>
        <div className="chart-grid">
          <ChartCard
            title="Points For vs. Against"
            subtitle="Weekly league average"
            description="Tracking the gap between total offense and defense by week."
          >
            <div className="chart-card__chart" aria-label="Points for and against trends">
              <ResponsiveContainer>
                <LineChart data={pointsTrend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="week" stroke="var(--color-muted)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "0.75rem",
                      color: "var(--color-foreground)",
                      fontSize: "0.75rem",
                    }}
                    labelStyle={{ color: "var(--color-muted)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pointsFor"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    dot={false}
                    name="Points For"
                  />
                  <Line
                    type="monotone"
                    dataKey="pointsAgainst"
                    stroke="var(--color-warning)"
                    strokeWidth={2}
                    dot={false}
                    name="Points Against"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Net Scoring Margin"
            subtitle="Points for minus points against"
            description="Positive weeks highlight offense-heavy stretches."
          >
            <div className="chart-card__chart" aria-label="Net scoring margin by week">
              <ResponsiveContainer>
                <BarChart data={pointsTrend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="week" stroke="var(--color-muted)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "0.75rem",
                      color: "var(--color-foreground)",
                      fontSize: "0.75rem",
                    }}
                    labelStyle={{ color: "var(--color-muted)" }}
                  />
                  <Bar dataKey="net" fill="var(--color-positive)" name="Net Margin" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>

      <div className="summary-block">
        <div className="section-heading">Head-to-Head Rivalry Heatmap</div>
        <p className="section-caption">
          Quick look at the most intense rivalries based on total points scored in matchups.
        </p>
        <ChartCard
          title="Rivalry Intensity"
          subtitle="Total points scored in matchups"
          description="Darker squares indicate higher combined scoring in head-to-head meetings."
        >
          <div
            className="heatmap"
            style={{ gridTemplateColumns: `140px repeat(${rivalryTeams.length}, minmax(0, 1fr))` }}
          >
            <div className="heatmap__corner" aria-hidden="true" />
            {rivalryTeams.map((team) => (
              <div key={`${team}-col`} className="heatmap__label heatmap__label--col">
                {team}
              </div>
            ))}
            {rivalryMatrix.map((row) => (
              <div key={row.team} className="heatmap__row">
                <div className="heatmap__label heatmap__label--row">{row.team}</div>
                {row.values.map((value, index) => {
                  if (value === null) {
                    return (
                      <div key={`${row.team}-${index}`} className="heatmap__cell heatmap__cell--empty">
                        —
                      </div>
                    );
                  }
                  const intensity = value / rivalryMax;
                  const mixPercent = Math.round(25 + intensity * 60);
                  return (
                    <div
                      key={`${row.team}-${index}`}
                      className="heatmap__cell"
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--color-accent) ${mixPercent}%, var(--color-surface-alt))`,
                      }}
                      title={`${row.team} vs. ${rivalryTeams[index]}: ${value.toFixed(1)} pts`}
                    >
                      {value.toFixed(1)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="heatmap__legend">
            <span>Lower intensity</span>
            <div className="heatmap__legend-bar" aria-hidden="true" />
            <span>Higher intensity</span>
          </div>
        </ChartCard>
      </div>

      <div className="summary-block">
        <div className="section-heading">Seasonal Awards Dashboard</div>
        <p className="section-caption">Season-defining moments and standout performances.</p>
        <ChartCard
          title="Awards & Superlatives"
          subtitle="League highlights"
          description="Tracking the biggest upsets, wildest finishes, and record-setting performances."
        >
          <div className="awards-grid">
            {awards.map((award) => (
              <div key={award.title} className="award-card">
                <p className="award-card__title">{award.title}</p>
                <p className="award-card__value">{award.value}</p>
                <p className="award-card__detail">{award.detail}</p>
                <p className="award-card__note">{award.note}</p>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </SectionShell>
  );
}
