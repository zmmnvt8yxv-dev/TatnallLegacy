const BLOCKED_PUBLIC_NAMES = [/only i can say the n-word/gi, /n-word/gi];

export function sanitizePublicString(value: string): string {
  return BLOCKED_PUBLIC_NAMES.reduce(
    (result, pattern) => result.replace(pattern, "Team Duncan"),
    value,
  );
}

export function sanitizePublicData<T>(value: T): T {
  if (typeof value === "string") return sanitizePublicString(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizePublicData(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizePublicData(item)]),
    ) as T;
  }
  return value;
}
