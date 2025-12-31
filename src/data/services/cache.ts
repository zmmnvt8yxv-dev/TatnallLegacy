export type CacheEntry<T> = {
  value: Promise<T>;
  expiresAt: number | null;
};

export type RequestCache<T> = {
  get: (key: string) => Promise<T> | null;
  set: (key: string, value: Promise<T>, ttlMs?: number | null) => void;
  delete: (key: string) => void;
  clear: () => void;
};

export function createRequestCache<T>(): RequestCache<T> {
  const store = new Map<string, CacheEntry<T>>();

  const get = (key: string): Promise<T> | null => {
    const entry = store.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  };

  const set = (key: string, value: Promise<T>, ttlMs?: number | null) => {
    store.set(key, {
      value,
      expiresAt: typeof ttlMs === "number" ? Date.now() + ttlMs : null,
    });
  };

  const remove = (key: string) => {
    store.delete(key);
  };

  const clear = () => {
    store.clear();
  };

  return {
    get,
    set,
    delete: remove,
    clear,
  };
}

export async function getOrSetCached<T>(
  cache: RequestCache<T>,
  key: string,
  factory: () => Promise<T>,
  ttlMs?: number | null,
): Promise<T> {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const promise = factory();
  cache.set(key, promise, ttlMs);
  try {
    return await promise;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}
