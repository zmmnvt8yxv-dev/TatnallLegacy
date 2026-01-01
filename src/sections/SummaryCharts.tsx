import { BarChart, Bar, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "../components/ChartCard";
import { selectAwardCards, selectPointsTrend, selectRivalryHeatmap } from "../data/selectors";
import type { SeasonData } from "../data/schema";

type SummaryChartsProps = {
  season: SeasonData;
};

export default function SummaryCharts({ season }: SummaryChartsProps) {
  const pointsTrend = useMemo(() => selectPointsTrend(season), [season]);
  const rivalryData = useMemo(() => selectRivalryHeatmap(season), [season]);
  const awards = useMemo(() => selectAwardCards(season), [season]);
  const heatmapLowColor = "#ffffff";
  const heatmapHighColor = "#4b0b0b";
  const rivalryMax = useMemo(() => {
    const rivalryValues = rivalryData.matrix
      .flatMap((row) => row.values)
      .filter((value): value is number => value !== null);
    return Math.max(...rivalryValues, 1);
  }, [rivalryData.matrix]);

  return (
    <>
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
                <LineChart data={pointsTrend} margin={{ top: 12, right: 20, left: 0, bottom: 4 }}>
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
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-in-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="pointsAgainst"
                    stroke="var(--color-warning)"
                    strokeWidth={2}
                    dot={false}
                    name="Points Against"
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-in-out"
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
                <BarChart data={pointsTrend} margin={{ top: 12, right: 20, left: 0, bottom: 4 }}>
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
                  <Bar
                    dataKey="net"
                    fill="var(--color-positive)"
                    name="Net Margin"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-in-out"
                  />
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
          <div className="heatmap-scroll">
            <div
              className="heatmap"
              style={{
                gridTemplateColumns: `160px repeat(${rivalryData.teams.length}, minmax(120px, 1fr))`,
                minWidth: `${160 + rivalryData.teams.length * 120}px`,
              }}
            >
              <div className="heatmap__corner" aria-hidden="true" />
              {rivalryData.teams.map((team) => (
                <div key={`${team}-col`} className="heatmap__label heatmap__label--col">
                  {team}
                </div>
              ))}
              {rivalryData.matrix.map((row) => (
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
                          backgroundColor: `color-mix(in srgb, ${heatmapHighColor} ${mixPercent}%, ${heatmapLowColor})`,
                        }}
                        title={`${row.team} vs. ${rivalryData.teams[index]}: ${value.toFixed(1)} pts`}
                      >
                        {value.toFixed(1)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
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
          {awards.length === 0 ? (
            <p className="text-sm text-muted">No awards are available for this season yet.</p>
          ) : (
            <div className="awards-grid">
              {awards.map((award) => (
                <div key={award.title} className="award-card">
                  <p className="award-card__title">{award.title}</p>
                  <p className="award-card__value">{award.value}</p>
                  <p className="award-card__detail">{award.detail}</p>
                  {award.note ? <p className="award-card__note">{award.note}</p> : null}
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}
