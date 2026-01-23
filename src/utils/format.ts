/**
 * Safely converts a value to a number, returning a fallback if not finite
 * @param value - The value to convert
 * @param fallback - Value to return if conversion fails (default: 0)
 * @returns The numeric value or the fallback
 */
export function safeNumber(value: unknown, fallback: number): number;
export function safeNumber(value: unknown, fallback?: null): number | null;
export function safeNumber(value: unknown, fallback: number | null = 0): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Formats a numeric value as points with specified decimal places
 * @param value - The value to format
 * @param digits - Number of decimal places (default: 2)
 * @returns Formatted string or "—" if value is not a valid number
 */
export function formatPoints(value: unknown, digits: number = 2): string {
  const num = safeNumber(value, null);
  if (num === null) return "—";
  return num.toFixed(digits);
}

/** Generic row type with optional week field */
interface RowWithWeek {
  [key: string]: unknown;
}

/**
 * Filters rows to only include regular season weeks (1-18)
 * @param rows - Array of rows to filter
 * @param weekKey - The key to use for the week value (default: "week")
 * @returns Filtered array containing only regular season weeks
 */
export function filterRegularSeasonWeeks<T extends RowWithWeek>(
  rows: T[] | null | undefined,
  weekKey: string = "week"
): T[] {
  return (rows || []).filter((row) => {
    const week = Number(row?.[weekKey]);
    return Number.isFinite(week) && week >= 1 && week <= 18;
  });
}
