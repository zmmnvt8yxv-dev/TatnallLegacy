import { Card, Metric, Text, Title } from '@tremor/react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { Button } from '@/components/ui/button';

const kpis = [
  {
    label: 'Active Teams',
    value: '12',
    detail: 'All franchises locked in for 2025'
  },
  {
    label: 'Open Trade Talks',
    value: '7',
    detail: '3 nearing acceptance'
  },
  {
    label: 'Projected Waiver Adds',
    value: '19',
    detail: 'Based on roster churn this week'
  }
];

const momentumData = [
  { week: 'W1', score: 108 },
  { week: 'W2', score: 112 },
  { week: 'W3', score: 101 },
  { week: 'W4', score: 119 },
  { week: 'W5', score: 124 },
  { week: 'W6', score: 118 }
];

export function Summary() {
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
            League Snapshot
          </p>
          <h2 className="text-2xl font-semibold text-white">
            Championship window analysis and week-ahead planning.
          </h2>
          <p className="text-sm text-slate-300">
            Centralize commissioner workflows, trade negotiations, and matchup prep.
          </p>
        </div>
        <Button variant="outline">Export Weekly Brief</Button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
          >
            <Text className="text-sm uppercase tracking-[0.2em] text-slate-400">
              {kpi.label}
            </Text>
            <Metric className="text-white">{kpi.value}</Metric>
            <Text className="text-sm text-slate-300">{kpi.detail}</Text>
          </Card>
        ))}
      </section>

      <section>
        <Card className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <Title className="text-white">Momentum Tracker</Title>
              <Text className="text-sm text-slate-300">
                Weekly scoring curve across the league average.
              </Text>
            </div>
            <Button variant="outline" size="sm">
              Adjust Filters
            </Button>
          </div>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={momentumData}>
                <XAxis dataKey="week" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '12px'
                  }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#38bdf8"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#38bdf8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

    </div>
  );
}
