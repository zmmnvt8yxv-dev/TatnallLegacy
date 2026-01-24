import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

/** Options for the useVirtualRows hook */
export interface UseVirtualRowsOptions {
  /** Total number of items in the list */
  itemCount: number;
  /** Height of each row in pixels (default: 44) */
  rowHeight?: number;
  /** Number of extra rows to render above/below viewport (default: 6) */
  overscan?: number;
}

/** Return type for useVirtualRows hook */
export interface UseVirtualRowsResult {
  /** Ref to attach to the scrollable container */
  containerRef: RefObject<HTMLDivElement>;
  /** Index of the first row to render */
  start: number;
  /** Index of the last row to render (exclusive) */
  end: number;
  /** Padding to apply at the top of the list (in pixels) */
  topPadding: number;
  /** Padding to apply at the bottom of the list (in pixels) */
  bottomPadding: number;
}

/**
 * Hook for virtualizing long lists of rows
 * Only renders rows that are visible in the viewport plus an overscan buffer
 *
 * @param options - Configuration options
 * @returns Virtual row state including container ref and render boundaries
 *
 * @example
 * ```tsx
 * const { containerRef, start, end, topPadding, bottomPadding } = useVirtualRows({
 *   itemCount: items.length,
 *   rowHeight: 44,
 * });
 *
 * return (
 *   <div ref={containerRef} style={{ height: 400, overflow: "auto" }}>
 *     <div style={{ paddingTop: topPadding, paddingBottom: bottomPadding }}>
 *       {items.slice(start, end).map((item, i) => (
 *         <Row key={start + i} item={item} />
 *       ))}
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualRows({
  itemCount,
  rowHeight = 44,
  overscan = 6,
}: UseVirtualRowsOptions): UseVirtualRowsResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = (): void => {
      setViewportHeight(el.clientHeight);
      setScrollTop(el.scrollTop);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return useMemo(() => {
    if (!itemCount || !viewportHeight) {
      return {
        containerRef,
        start: 0,
        end: itemCount,
        topPadding: 0,
        bottomPadding: 0,
      };
    }
    const visibleCount = Math.ceil(viewportHeight / rowHeight);
    const rawStart = Math.floor(scrollTop / rowHeight);
    const start = Math.max(0, rawStart - overscan);
    const end = Math.min(itemCount, rawStart + visibleCount + overscan);
    const topPadding = start * rowHeight;
    const bottomPadding = Math.max(0, (itemCount - end) * rowHeight);
    return { containerRef, start, end, topPadding, bottomPadding };
  }, [itemCount, viewportHeight, scrollTop, rowHeight, overscan]);
}
