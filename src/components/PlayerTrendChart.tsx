import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PlayerSeasonSummary } from "../data/selectors";

type PlayerTrendChartProps = {
  data: PlayerSeasonSummary[];
};

export function PlayerTrendChart({ data }: PlayerTrendChartProps) {
  const chartData = data.map((season) => ({
    season: String(season.season),
    total: Number(season.totalPoints.toFixed(1)),
  }));

  return (
    <div className="player-profile__trend-chart" role="img" aria-label="Season totals trend">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <XAxis dataKey="season" stroke="#94a3b8" tickLine={false} axisLine={false} />
          <YAxis
            stroke="#94a3b8"
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={(value) => value.toFixed(0)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: "12px",
            }}
            itemStyle={{ color: "#e2e8f0" }}
            labelStyle={{ color: "#e2e8f0" }}
            formatter={(value) => [`${value} pts`, "Total"]}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#38bdf8"
            strokeWidth={3}
            dot={{ r: 4, fill: "#38bdf8" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
