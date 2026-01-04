import React, { useEffect, useRef, useState } from "react";

export default function DeferredSection({ onVisible, children, rootMargin = "200px", placeholder = null }) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) return undefined;
    const target = ref.current;
    if (!target) return undefined;
    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      if (onVisible) onVisible();
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          if (onVisible) onVisible();
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isVisible, onVisible, rootMargin]);

  return <div ref={ref}>{isVisible ? children : placeholder}</div>;
}
