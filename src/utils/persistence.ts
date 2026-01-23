/**
 * Checks if localStorage is available
 * @returns true if localStorage can be used
 */
const storageAvailable = (): boolean => {
  try {
    return typeof window !== "undefined" && "localStorage" in window;
  } catch {
    return false;
  }
};

/**
 * Reads a value from localStorage, parsing it as JSON
 * @param key - The storage key to read
 * @param fallback - Value to return if key doesn't exist or parsing fails
 * @returns The parsed value or the fallback
 */
export const readStorage = <T>(key: string, fallback: T): T => {
  if (!storageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/**
 * Writes a value to localStorage as JSON
 * @param key - The storage key to write
 * @param value - The value to store (will be JSON stringified)
 */
export const writeStorage = <T>(key: string, value: T): void => {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
};
