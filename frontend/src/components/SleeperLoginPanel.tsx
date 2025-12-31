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

type SleeperLoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: SleeperUser) => void;
};

export function SleeperLoginModal({
  isOpen,
  onClose,
  onSuccess
}: SleeperLoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUser, setUser] = useState<SleeperUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, [isOpen]);

  const avatarUrl = useMemo(() => {
    if (!currentUser?.avatar) {
      return null;
    }

    return `${avatarBase}${currentUser.avatar}`;
  }, [currentUser]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmed || !trimmedPassword) {
      const message = 'Credentials failed. Enter a Sleeper username and password.';
      setErrorMessage(message);
      setStatus('error');
      window.alert(message);
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    try {
      const response = await fetch(
        `https://api.sleeper.app/v1/user/${encodeURIComponent(trimmed)}`
      );

      if (!response.ok) {
        throw new Error('Credentials failed. Sleeper account not found.');
      }

      const user = (await response.json()) as SleeperUser;

      if (!user.user_id) {
        throw new Error('Credentials failed. Unable to load Sleeper account.');
      }

      setCurrentUser(user);
      setUser(user);
      addUserLogEntry(createSleeperLogEntry(user));
      setUsername('');
      setPassword('');
      setStatus('idle');
      onSuccess(user);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Credentials failed.';
      setErrorMessage(message);
      setStatus('error');
      window.alert(message);
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setUser(null);
    setErrorMessage(null);
    setStatus('idle');
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-200 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
              Sleeper Login
            </p>
            <p className="text-base font-semibold text-white">
              Enter your Sleeper credentials
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        {currentUser ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${currentUser.username} avatar`}
                  className="h-10 w-10 rounded-full border border-slate-700"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-semibold">
                  {currentUser.username.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-white">
                  {currentUser.display_name || currentUser.username}
                </p>
                <p className="text-xs text-slate-400">@{currentUser.username}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Sleeper username"
                className="h-10 rounded-md border border-slate-700 bg-slate-950/60 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Sleeper password"
                className="h-10 rounded-md border border-slate-700 bg-slate-950/60 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <Button type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Checking…' : 'Log in'}
            </Button>
            {errorMessage ? (
              <p className="text-xs text-rose-300">{errorMessage}</p>
            ) : (
              <p className="text-xs text-slate-400">
                Log in to access the user log portal.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
