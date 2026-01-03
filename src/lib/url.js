const DEFAULT_BASE_URL = "/";

export function safeUrl(path, base = import.meta.env.BASE_URL || DEFAULT_BASE_URL) {
  if (!path) return base || DEFAULT_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;

  const resolvedBase = base || DEFAULT_BASE_URL;
  const baseNormalized = resolvedBase.endsWith("/")
    ? resolvedBase.slice(0, -1)
    : resolvedBase;
  const pathNormalized = path.startsWith("/") ? path.slice(1) : path;

  if (!baseNormalized) return `/${pathNormalized}`;
  if (!pathNormalized) return `${baseNormalized}/`;
  return `${baseNormalized}/${pathNormalized}`;
}
