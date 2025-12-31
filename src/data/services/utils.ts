export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toStringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

export function extractNumericStats(source: unknown): Record<string, number> {
  const record = getRecord(source);
  const stats: Record<string, number> = {};

  Object.entries(record).forEach(([key, value]) => {
    const num = toNumber(value);
    if (num !== null) {
      stats[key] = num;
    }
  });

  return stats;
}

export function pickFirstRecord(...values: unknown[]): UnknownRecord | null {
  for (const value of values) {
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
}
