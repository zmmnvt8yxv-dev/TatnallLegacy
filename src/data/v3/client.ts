import { safeUrl } from "../../lib/url";
import { sanitizePublicData } from "../../lib/publicIdentity";
import type { z } from "zod";

export async function getV3<T>(path: string, schema?: z.ZodType<T>): Promise<T> {
  const response = await fetch(safeUrl(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path} (${response.status})`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON from ${path}`);
  }
  const payload: unknown = sanitizePublicData(await response.json());
  return schema ? schema.parse(payload) : (payload as T);
}

export function fillPath(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
