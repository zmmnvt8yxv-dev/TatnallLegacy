/**
 * Application Entry Point
 *
 * Phase 3: Proper configuration validation and monitoring initialization.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "./App.jsx";
import { DataProvider } from "./data/DataContext";
import { ThemeProvider } from "./lib/ThemeContext.jsx";
import "./styles.css";

// Phase 3: Configuration validation
import { initConfig, getSentryDsn, getGA4Id } from "./config";
import { initMonitoring } from "./services/monitoring";
import ReactGA from "react-ga4";

// =============================================================================
// CONFIGURATION INITIALIZATION
// =============================================================================

// Initialize and validate configuration first (fail fast on errors)
const config = initConfig();

// Initialize monitoring (Sentry if configured)
initMonitoring(getSentryDsn());

// Initialize Google Analytics if configured
const ga4Id = getGA4Id();
if (ga4Id) {
  ReactGA.initialize(ga4Id);
  ReactGA.send("pageview");
} else {
  console.info("ANALYTICS_INIT", "Google Analytics not configured - skipping initialization");
}

// =============================================================================
// REACT QUERY CLIENT
// =============================================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes default
      retry: 2,
    },
  },
});

// =============================================================================
// ROUTER CONFIGURATION
// =============================================================================

const routerBase = config.baseUrl !== "./" ? config.baseUrl : "/";

// =============================================================================
// RENDER
// =============================================================================

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
  </React.StrictMode>
);
