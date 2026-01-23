/** Google Analytics 4 Measurement ID from environment */
const GA4_ID = import.meta.env.VITE_GA4_ID as string | undefined;

/** Gtag function signature */
type GtagCommand = "js" | "config" | "event" | "set" | "get";

interface GtagFunction {
  (command: "js", date: Date): void;
  (command: "config", targetId: string, config?: Record<string, unknown>): void;
  (command: "event", eventName: string, eventParams?: Record<string, unknown>): void;
  (command: GtagCommand, ...args: unknown[]): void;
}

/** Extend Window interface for gtag */
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: GtagFunction;
  }
}

/**
 * Ensures gtag function exists on window, creating it if necessary
 * @returns The gtag function or null if not in browser environment
 */
const ensureGtag = (): GtagFunction | null => {
  if (typeof window === "undefined") return null;
  if (window.gtag) return window.gtag;
  window.dataLayer = window.dataLayer || [];
  // Using function declaration for gtag's arguments magic
  function gtag(...args: unknown[]): void {
    window.dataLayer.push(args);
  }
  window.gtag = gtag as GtagFunction;
  return window.gtag;
};

/**
 * Initializes Google Analytics 4 by loading the gtag script
 * Only loads once, subsequent calls are no-ops
 */
export const initAnalytics = (): void => {
  if (!GA4_ID || typeof document === "undefined") return;
  if (document.getElementById("ga4-script")) return;
  const script = document.createElement("script");
  script.id = "ga4-script";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(script);
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag("js", new Date());
  gtag("config", GA4_ID, { send_page_view: false });
};

/**
 * Tracks a page view event in Google Analytics
 * @param path - The page path to track
 */
export const trackPageView = (path: string): void => {
  if (!GA4_ID || typeof window === "undefined") return;
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
};
