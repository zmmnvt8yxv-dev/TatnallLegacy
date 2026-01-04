const GA4_ID = import.meta.env.VITE_GA4_ID;

const ensureGtag = () => {
  if (typeof window === "undefined") return null;
  if (window.gtag) return window.gtag;
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  return gtag;
};

export const initAnalytics = () => {
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

export const trackPageView = (path) => {
  if (!GA4_ID || typeof window === "undefined") return;
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
};
