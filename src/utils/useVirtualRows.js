import { useEffect, useMemo, useRef, useState } from "react";

export function useVirtualRows({ itemCount, rowHeight = 44, overscan = 6 }) {
  const containerRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => {
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
