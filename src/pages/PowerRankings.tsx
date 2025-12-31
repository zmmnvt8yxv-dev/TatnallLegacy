import { Card, Text, Title } from '@tremor/react';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { dataLoader } from '@/data/loader';
import type { PowerRankingEntry, PowerRankings as PowerRankingsResponse } from '@/data/schema';
import { cn } from '@/lib/utils';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

const githubEditUrl =
  'https://github.com/your-org/tatnall-legacy/edit/main/public/data/power-rankings.json';

export function PowerRankings() {
  const [data, setData] = useState<PowerRankingsResponse | null>(null);
  const [status, setStatus] = useState<LoadState>('idle');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setStatus('loading');
      try {
        const payload = await dataLoader.loadPowerRankings();
        if (active) {
          setData(payload);
          setStatus('loaded');
        }
      } catch (error) {
        if (active) {
          setStatus('error');
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const weeks = useMemo(() => {
    if (!data?.entries?.length) {
      return [] as number[];
    }
    return Array.from(new Set(data.entries.map((entry) => entry.week))).sort(
      (a, b) => a - b
    );
  }, [data]);

  useEffect(() => {
    if (!weeks.length) {
      setSelectedWeek(null);
      return;
    }
    if (selectedWeek === null || !weeks.includes(selectedWeek)) {
      setSelectedWeek(weeks[weeks.length - 1]);
    }
  }, [selectedWeek, weeks]);

  const previousWeek = useMemo(() => {
    if (selectedWeek === null) {
      return null;
    }
    const index = weeks.indexOf(selectedWeek);
    if (index <= 0) {
      return null;
    }
    return weeks[index - 1] ?? null;
  }, [selectedWeek, weeks]);

  const previousWeekMap = useMemo(() => {
    if (!previousWeek || !data?.entries?.length) {
      return new Map<string, number>();
    }
    return new Map(
      data.entries
        .filter((entry) => entry.week === previousWeek)
        .map((entry) => [entry.team, entry.rank])
    );
  }, [data, previousWeek]);

  const currentEntries = useMemo(() => {
    if (!data?.entries?.length || selectedWeek === null) {
      return [] as PowerRankingEntry[];
    }
    return data.entries
      .filter((entry) => entry.week === selectedWeek)
      .sort((a, b) => a.rank - b.rank);
  }, [data, selectedWeek]);

  const updatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleString()
    : 'Not yet published';

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Power Rankings
          </p>
          <h2 className="text-2xl font-semibold text-white">
            Weekly ladder movement with momentum indicators.
          </h2>
          <p className="text-sm text-slate-300">
            Updated: {updatedAt} · {data?.season ? `Season ${data.season}` : 'Season TBD'}
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Select week
          </label>
          <select
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 md:w-40"
            value={selectedWeek ?? ''}
            onChange={(event) => setSelectedWeek(Number(event.target.value))}
            disabled={!weeks.length}
          >
            {weeks.length ? (
              weeks.map((week) => (
                <option key={week} value={week}>
                  Week {week}
                </option>
              ))
            ) : (
              <option value="">No rankings yet</option>
            )}
          </select>
        </div>
      </section>

      <Card className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <Title className="text-white">Week {selectedWeek ?? '—'} standings</Title>
            <Text className="text-sm text-slate-300">
              Delta indicators compare against Week {previousWeek ?? '—'} rankings.
            </Text>
          </div>
          <Button variant="outline" size="sm" disabled={status === 'loading'}>
            Export Snapshot
          </Button>
        </div>
        <div className="mt-6">
          {status === 'loading' && (
            <Text className="text-sm text-slate-400">Loading rankings...</Text>
          )}
          {status === 'error' && (
            <Text className="text-sm text-rose-300">
              Unable to load rankings. Check the data feed and retry.
            </Text>
          )}
          {status === 'loaded' && !currentEntries.length && (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
              No rankings posted yet. Upload a CSV/JSON file or edit the rankings JSON
              to publish the first week.
            </div>
          )}
          {!!currentEntries.length && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-y-2 text-sm">
                <thead className="text-left text-slate-400">
                  <tr>
                    <th className="py-2 pl-4">Rank</th>
                    <th className="py-2">Team</th>
                    <th className="py-2">Record</th>
                    <th className="py-2">Points For</th>
                    <th className="py-2">Delta</th>
                    <th className="py-2 pr-4">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {currentEntries.map((entry) => {
                    const previousRank = previousWeekMap.get(entry.team);
                    const delta =
                      previousRank === undefined ? null : previousRank - entry.rank;
                    const deltaLabel =
                      delta === null
                        ? '—'
                        : delta === 0
                          ? '0'
                          : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}`;
                    const deltaClass =
                      delta === null || delta === 0
                        ? 'text-slate-400'
                        : delta > 0
                          ? 'text-emerald-300'
                          : 'text-rose-300';

                    return (
                      <tr
                        key={`${entry.week}-${entry.team}`}
                        className="rounded-xl bg-slate-950/40"
                      >
                        <td className="py-3 pl-4 font-semibold text-white">
                          {entry.rank}
                        </td>
                        <td className="py-3 text-slate-100">{entry.team}</td>
                        <td className="py-3 text-slate-300">
                          {entry.record ?? '—'}
                        </td>
                        <td className="py-3 text-slate-300">
                          {entry.points_for ?? '—'}
                        </td>
                        <td className={cn('py-3 font-medium', deltaClass)}>
                          {deltaLabel}
                        </td>
                        <td className="py-3 pr-4 text-slate-300">
                          {entry.note ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <Title className="text-white">Post rankings</Title>
          <Text className="mt-2 text-sm text-slate-300">
            Upload weekly rankings in CSV or JSON format. Required fields: week, team,
            rank. Optional: record, points_for, note.
          </Text>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
            <input
              type="file"
              accept=".csv,.json,application/json,text/csv"
              onChange={handleFileChange}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 file:mr-4 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:text-slate-200"
            />
            <Button disabled={!selectedFile}>Queue upload</Button>
          </div>
          {selectedFile && (
            <Text className="mt-3 text-xs text-slate-400">
              Ready to upload: {selectedFile.name}
            </Text>
          )}
        </Card>
        <Card className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <Title className="text-white">Edit in GitHub</Title>
          <Text className="mt-2 text-sm text-slate-300">
            Prefer editing directly in GitHub? Update the power-rankings.json file and
            commit your changes to publish instantly.
          </Text>
          <a
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'mt-4 inline-flex w-fit'
            )}
            href={githubEditUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open GitHub editor
          </a>
          <Text className="mt-2 text-xs text-slate-400">
            Update the link to match your repository URL.
          </Text>
        </Card>
      </section>
    </div>
  );
}
