const DEFAULT_BASE_URL = "/";

// Note: Vite injects import.meta.env at build time
// For Jest tests, this will use DEFAULT_BASE_URL
declare global {
  interface ImportMeta {
    env?: {
      BASE_URL?: string;
      DEV?: boolean;
      MODE?: string;
    };
  }
}

function getDefaultBase(): string {
  // Use globalThis.import for test environment compatibility
  const importMeta = (globalThis as { import?: { meta?: { env?: { BASE_URL?: string } } } }).import;
  return importMeta?.meta?.env?.BASE_URL || DEFAULT_BASE_URL;
}

export function safeUrl(path: string | null | undefined, base?: string): string {
  const effectiveBase = base ?? getDefaultBase();
  if (!path) return effectiveBase || DEFAULT_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;

  const resolvedBase = effectiveBase || DEFAULT_BASE_URL;
  const baseWithSlash = resolvedBase.endsWith("/") ? resolvedBase : `${resolvedBase}/`;
  const pathNormalized = path.startsWith("/") ? path.slice(1) : path;

  if (typeof window !== "undefined" && window.location?.origin) {
    const originBase = /^https?:\/\//i.test(baseWithSlash)
      ? baseWithSlash
      : `${window.location.origin}${baseWithSlash}`;
    try {
      return new URL(pathNormalized, originBase).toString();
    } catch {
      // Fall through to string concatenation.
    }
  }

  const baseNormalized = baseWithSlash.endsWith("/")
    ? baseWithSlash.slice(0, -1)
    : baseWithSlash;
  if (!baseNormalized) return `/${pathNormalized}`;
  if (!pathNormalized) return `${baseNormalized}/`;
  return `${baseNormalized}/${pathNormalized}`;
}
