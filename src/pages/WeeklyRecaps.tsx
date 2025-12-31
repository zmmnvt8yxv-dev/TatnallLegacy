import { Card, Text, Title } from '@tremor/react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { dataLoader } from '@/data/loader';
import type { WeeklyRecapEntry, WeeklyRecaps as WeeklyRecapsResponse } from '@/data/schema';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

type MarkdownBlockProps = {
  content: string;
};

function MarkdownBlock({ content }: MarkdownBlockProps) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (index: number) => {
    if (!listItems.length) {
      return;
    }
    blocks.push(
      <ul key={`list-${index}`} className="list-disc space-y-1 pl-6 text-sm">
        {listItems.map((item, itemIndex) => (
          <li key={`${item}-${itemIndex}`} className="text-slate-300">
            {item}
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      listItems.push(trimmed.slice(2));
      return;
    }

    flushList(index);

    if (!trimmed) {
      blocks.push(<div key={`spacer-${index}`} className="h-2" />);
      return;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4 key={`h4-${index}`} className="text-sm font-semibold text-white">
          {trimmed.slice(4)}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h3 key={`h3-${index}`} className="text-base font-semibold text-white">
          {trimmed.slice(3)}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h2 key={`h2-${index}`} className="text-lg font-semibold text-white">
          {trimmed.slice(2)}
        </h2>
      );
      return;
    }

    blocks.push(
      <p key={`p-${index}`} className="text-sm text-slate-300">
        {trimmed}
      </p>
    );
  });

  flushList(lines.length + 1);

  return <div className="space-y-3">{blocks}</div>;
}

export function WeeklyRecaps() {
  const [data, setData] = useState<WeeklyRecapsResponse | null>(null);
  const [status, setStatus] = useState<LoadState>('idle');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setStatus('loading');
      try {
        const payload = await dataLoader.loadWeeklyRecaps();
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

  const currentRecap = useMemo(() => {
    if (selectedWeek === null) {
      return null;
    }
    return data?.entries.find((entry) => entry.week === selectedWeek) ?? null;
  }, [data, selectedWeek]);

  const headerTitle = currentRecap?.title ??
    (selectedWeek ? `Week ${selectedWeek} Recap` : 'Weekly Recaps');

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Weekly Recaps
          </p>
          <h2 className="text-2xl font-semibold text-white">
            Storylines, highlights, and awards for each matchup week.
          </h2>
          <p className="text-sm text-slate-300">
            {data?.season ? `Season ${data.season}` : 'Season TBD'} ·{' '}
            {data?.generated_at
              ? new Date(data.generated_at).toLocaleString()
              : 'Awaiting first recap'}
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
              <option value="">No recaps yet</option>
            )}
          </select>
        </div>
      </section>

      <Card className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <Title className="text-white">{headerTitle}</Title>
            <Text className="text-sm text-slate-300">
              Markdown uploads render as formatted stories. JSON uploads render as
              structured recap cards.
            </Text>
          </div>
          <Button variant="outline" size="sm" disabled={status === 'loading'}>
            Export Recap
          </Button>
        </div>
        <div className="mt-6 space-y-4">
          {status === 'loading' && (
            <Text className="text-sm text-slate-400">Loading recap...</Text>
          )}
          {status === 'error' && (
            <Text className="text-sm text-rose-300">
              Unable to load recaps. Check the data feed and retry.
            </Text>
          )}
          {status === 'loaded' && !currentRecap && (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
              No recaps posted yet. Upload markdown or JSON to the weekly-recaps.json
              file to publish a recap.
            </div>
          )}
          {currentRecap?.markdown && <MarkdownBlock content={currentRecap.markdown} />}
          {!currentRecap?.markdown && currentRecap?.content && (
            <pre className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-200">
              {typeof currentRecap.content === 'string'
                ? currentRecap.content
                : JSON.stringify(currentRecap.content, null, 2)}
            </pre>
          )}
          {!currentRecap?.markdown && !currentRecap?.content && currentRecap && (
            <div className="space-y-4">
              <Text className="text-sm text-slate-300">
                {currentRecap.summary ??
                  'Add a markdown recap or summary to highlight the week.'}
              </Text>
              {currentRecap.highlights?.length ? (
                <div>
                  <Text className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Highlights
                  </Text>
                  <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-slate-300">
                    {currentRecap.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {currentRecap.notable_teams?.length ? (
                <div>
                  <Text className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Notable teams
                  </Text>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currentRecap.notable_teams.map((team) => (
                      <span
                        key={team}
                        className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-200"
                      >
                        {team}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
