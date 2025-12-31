import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { PlayerProfileProvider } from "./components/PlayerProfileProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import { SeasonSelectionProvider } from "./hooks/useSeasonSelection";
import "./styles/globals.css";
import "react-toastify/ReactToastify.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <SeasonSelectionProvider>
          <PlayerProfileProvider>
            <App />
          </PlayerProfileProvider>
        </SeasonSelectionProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>
);
