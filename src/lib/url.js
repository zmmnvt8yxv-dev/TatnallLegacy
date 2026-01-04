const DEFAULT_BASE_URL = "/";

export function safeUrl(path, base = import.meta.env.BASE_URL || DEFAULT_BASE_URL) {
  if (!path) return base || DEFAULT_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;

  const resolvedBase = base || DEFAULT_BASE_URL;
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
