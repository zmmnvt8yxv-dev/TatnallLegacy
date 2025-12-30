import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import "./styles/globals.css";
import { dataLoader } from "./data/loader";

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

if (typeof window !== "undefined") {
  requestAnimationFrame(() => {
    void import("/app.js")
      .then(({ initLegacyApp }) => {
        initLegacyApp({ dataLoader });
      })
      .catch((error) => {
        console.error("Unable to initialize legacy app.js module", error);
      });
  });
}
