import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

const routerBase = (import.meta.env.BASE_URL && import.meta.env.BASE_URL !== "./") ? import.meta.env.BASE_URL : "/";
import App from "./App.jsx";
import { DataProvider } from "./data/DataContext.jsx";
import "./styles.css";

window.addEventListener("unhandledrejection", (e) => {
  console.error("UNHANDLED_REJECTION", e.reason);
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBase}>
      <DataProvider>
        <App />
      </DataProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
