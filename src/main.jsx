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

window.addEventListener("unhandledrejection", (e) => {
  console.error("UNHANDLED_REJECTION", e.reason);
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
