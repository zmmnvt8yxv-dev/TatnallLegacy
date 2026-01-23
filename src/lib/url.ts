const DEFAULT_BASE_URL = "/";

// Vite injects __APP_BASE_URL__ at build time via define config
// For tests, we use the globalThis fallback or the default
declare const __APP_BASE_URL__: string | undefined;

function getDefaultBase(): string {
  // Check for Vite's compile-time constant first
  if (typeof __APP_BASE_URL__ !== "undefined") {
    return __APP_BASE_URL__;
  }

  // Fallback for test environment (globalThis.import set in Jest setup)
  const testImportMeta = (globalThis as { import?: { meta?: { env?: { BASE_URL?: string } } } }).import;
  if (testImportMeta?.meta?.env?.BASE_URL) {
    return testImportMeta.meta.env.BASE_URL;
  }

  return DEFAULT_BASE_URL;
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
