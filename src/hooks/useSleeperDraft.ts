import { useEffect, useMemo, useState } from "react";

export interface SleeperDraftPick {
  pick_no?: number;
  round?: number;
  roster_id?: number;
  player_id?: string;
  is_keeper?: boolean;
  metadata?: Record<string, string>;
}

export function dedupeDraftPicks(rows: SleeperDraftPick[]): SleeperDraftPick[] {
  const byPick = new Map<number, SleeperDraftPick>();
  for (const row of rows) {
    const pickNo = Number(row.pick_no || 0);
    if (pickNo > 0) byPick.set(pickNo, row);
  }
  return [...byPick.values()].sort((a, b) => Number(a.pick_no) - Number(b.pick_no));
}

interface DraftConfig {
  status: string;
  draftEndpoint: string;
  picksEndpoint: string;
  pollingSeconds: number;
  backoffSeconds: number[];
  staticPicks: unknown[];
}

export function useSleeperDraft(config?: DraftConfig) {
  const [status, setStatus] = useState(config?.status || "unknown");
  const [picks, setPicks] = useState<SleeperDraftPick[]>(() => dedupeDraftPicks((config?.staticPicks || []) as SleeperDraftPick[]));
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    if (!config) return undefined;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const [draftResponse, picksResponse] = await Promise.all([
          fetch(config.draftEndpoint, { cache: "no-store" }),
          fetch(config.picksEndpoint, { cache: "no-store" }),
        ]);
        if (!draftResponse.ok || !picksResponse.ok) throw new Error("Sleeper draft feed unavailable");
        const draft = await draftResponse.json() as { status?: string };
        const nextPicks = dedupeDraftPicks(await picksResponse.json() as SleeperDraftPick[]);
        if (cancelled) return;
        setStatus(draft.status || config.status);
        setPicks(nextPicks);
        setLastVerifiedAt(new Date().toISOString());
        setFailureCount(0);
        const active = ["drafting", "in_progress"].includes(draft.status || "");
        if (active) timer = window.setTimeout(poll, config.pollingSeconds * 1000);
      } catch {
        if (cancelled) return;
        setFailureCount((current) => {
          const next = current + 1;
          const index = Math.min(next - 1, config.backoffSeconds.length - 1);
          timer = window.setTimeout(poll, config.backoffSeconds[index] * 1000);
          return next;
        });
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [config]);

  return useMemo(() => ({
    status,
    picks,
    lastVerifiedAt,
    failureCount,
    usingFallback: failureCount > 0,
  }), [failureCount, lastVerifiedAt, picks, status]);
}
