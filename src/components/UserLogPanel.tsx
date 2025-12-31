import { useEffect, useMemo, useState } from 'react';

import {
  getUserLog,
  subscribeToUserLog,
  type UserLogEntry
} from '@/lib/userLog';

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

export function UserLogPanel() {
  const [entries, setEntries] = useState<UserLogEntry[]>([]);

  useEffect(() => {
    setEntries(getUserLog());
    return subscribeToUserLog(() => setEntries(getUserLog()));
  }, []);

  const latestEntries = useMemo(() => entries.slice(0, 8), [entries]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">User Log</h3>
          <p className="text-sm text-slate-300">
            Tracks Sleeper logins and anonymous visitors for this browser.
          </p>
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          {entries.length} entries saved
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {latestEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">
            No user log entries yet.
          </div>
        ) : (
          latestEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-white">
                  {entry.type === 'sleeper'
                    ? entry.displayName || entry.username || 'Sleeper user'
                    : 'Guest visitor'}
                </p>
                <p className="text-xs text-slate-400">
                  {entry.type === 'sleeper'
                    ? `@${entry.username ?? 'unknown'} · ${entry.userId ?? ''}`
                    : `${entry.timezone ?? 'Unknown timezone'} · ${entry.userAgent ?? 'Unknown device'}`}
                </p>
              </div>
              <div className="text-xs text-slate-400">
                {formatTimestamp(entry.timestamp)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
