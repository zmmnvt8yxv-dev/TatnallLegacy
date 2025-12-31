import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  addUserLogEntry,
  createSleeperLogEntry,
  getCurrentUser,
  setCurrentUser,
  type SleeperUser
} from '@/lib/userLog';

const avatarBase = 'https://sleepercdn.com/avatars/';

export function SleeperLoginPanel() {
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUser, setUser] = useState<SleeperUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const avatarUrl = useMemo(() => {
    if (!currentUser?.avatar) {
      return null;
    }

    return `${avatarBase}${currentUser.avatar}`;
  }, [currentUser]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = username.trim();

    if (!trimmed) {
      setErrorMessage('Enter a Sleeper username to continue.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    try {
      const response = await fetch(
        `https://api.sleeper.app/v1/user/${encodeURIComponent(trimmed)}`
      );

      if (!response.ok) {
        throw new Error('Sleeper account not found.');
      }

      const user = (await response.json()) as SleeperUser;

      if (!user.user_id) {
        throw new Error('Unable to load Sleeper account details.');
      }

      setCurrentUser(user);
      setUser(user);
      addUserLogEntry(createSleeperLogEntry(user));
      setUsername('');
      setStatus('idle');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to reach Sleeper.';
      setErrorMessage(message);
      setStatus('error');
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setUser(null);
    setErrorMessage(null);
    setStatus('idle');
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
            Sleeper Login
          </p>
          <p className="text-sm text-slate-200">
            Connect a Sleeper account to personalize the user log.
          </p>
        </div>
        {currentUser ? (
          <div className="flex items-center gap-2">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${currentUser.username} avatar`}
                className="h-9 w-9 rounded-full border border-slate-700"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-semibold">
                {currentUser.username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="text-right">
              <p className="text-sm font-semibold text-white">
                {currentUser.display_name || currentUser.username}
              </p>
              <p className="text-xs text-slate-400">@{currentUser.username}</p>
            </div>
          </div>
        ) : null}
      </div>

      {currentUser ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleSignOut}>
            Sign out
          </Button>
          <p className="text-xs text-slate-400">
            You can still browse without signing in.
          </p>
        </div>
      ) : (
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Sleeper username"
              className="h-10 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <Button size="sm" type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Connecting…' : 'Connect Sleeper'}
            </Button>
          </div>
          {errorMessage ? (
            <p className="text-xs text-rose-300">{errorMessage}</p>
          ) : (
            <p className="text-xs text-slate-400">
              Use any Sleeper username to log the account connection.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
