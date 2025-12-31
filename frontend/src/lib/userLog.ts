export type UserLogEntry = {
  id: string;
  timestamp: string;
  type: 'guest' | 'sleeper';
  userId?: string;
  username?: string;
  displayName?: string;
  avatar?: string;
  userAgent?: string;
  timezone?: string;
};

export type SleeperUser = {
  user_id: string;
  username: string;
  display_name?: string;
  avatar?: string;
};

const LOG_STORAGE_KEY = 'tatnall-user-log';
const CURRENT_USER_KEY = 'tatnall-current-user';
const SESSION_KEY = 'tatnall-session-id';
const USER_LOG_EVENT = 'tatnall-user-log-update';

const fallbackId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getNavigatorInfo = () => {
  if (typeof navigator === 'undefined') {
    return { userAgent: undefined, timezone: undefined };
  }

  return {
    userAgent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
};

const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const dispatchLogUpdate = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(USER_LOG_EVENT));
};

export const getUserLog = (): UserLogEntry[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  return parseJson<UserLogEntry[]>(window.localStorage.getItem(LOG_STORAGE_KEY), []);
};

const setUserLog = (entries: UserLogEntry[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries));
};

export const addUserLogEntry = (entry: UserLogEntry) => {
  const entries = getUserLog();
  const nextEntries = [entry, ...entries].slice(0, 100);
  setUserLog(nextEntries);
  dispatchLogUpdate();
};

export const getCurrentUser = (): SleeperUser | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return parseJson<SleeperUser | null>(
    window.localStorage.getItem(CURRENT_USER_KEY),
    null
  );
};

export const setCurrentUser = (user: SleeperUser | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (user) {
    window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(CURRENT_USER_KEY);
  }

  dispatchLogUpdate();
};

export const ensureGuestLog = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const sessionId = window.sessionStorage.getItem(SESSION_KEY);
  if (sessionId) {
    return;
  }

  const nextSessionId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : fallbackId();

  window.sessionStorage.setItem(SESSION_KEY, nextSessionId);

  const { userAgent, timezone } = getNavigatorInfo();

  addUserLogEntry({
    id: nextSessionId,
    timestamp: new Date().toISOString(),
    type: 'guest',
    userAgent,
    timezone
  });
};

export const createSleeperLogEntry = (user: SleeperUser): UserLogEntry => {
  const { userAgent, timezone } = getNavigatorInfo();

  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : fallbackId(),
    timestamp: new Date().toISOString(),
    type: 'sleeper',
    userId: user.user_id,
    username: user.username,
    displayName: user.display_name,
    avatar: user.avatar,
    userAgent,
    timezone
  };
};

export const subscribeToUserLog = (callback: () => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = () => callback();

  window.addEventListener(USER_LOG_EVENT, handler);
  window.addEventListener('storage', handler);

  return () => {
    window.removeEventListener(USER_LOG_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
};
