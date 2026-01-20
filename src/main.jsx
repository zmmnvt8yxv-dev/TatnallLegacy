import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const routerBase = (import.meta.env.BASE_URL && import.meta.env.BASE_URL !== "./") ? import.meta.env.BASE_URL : "/";
import App from "./App.jsx";
import { DataProvider } from "./data/DataContext.jsx";
import { ThemeProvider } from "./lib/ThemeContext.jsx";
import "./styles.css";

const queryClient = new QueryClient();
import * as Sentry from "@sentry/react";
import ReactGA from "react-ga4";

// Initialize Google Analytics with a placeholder ID
ReactGA.initialize("G-PLACEHOLDER");
// Send initial pageview
ReactGA.send("pageview");

const sentryDsn = import.meta.env.VITE_SENTRY_DSN || "https://placeholder-dsn@sentry.io/placeholder";

if (sentryDsn && !sentryDsn.includes("placeholder")) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
} else {
  console.log("Sentry initialization skipped: No valid DSN provided.");
}

window.addEventListener("unhandledrejection", (e) => {
  console.error("UNHANDLED_REJECTION", e.reason);
  Sentry.captureException(e.reason);
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={routerBase}>
        <ThemeProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
