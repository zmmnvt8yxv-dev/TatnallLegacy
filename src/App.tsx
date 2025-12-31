import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LoadingSection } from "./components/LoadingSection";
import { PlayerProfileProvider } from "./components/PlayerProfileProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import { SeasonSelectionProvider } from "./hooks/useSeasonSelection";
import { navigationItems } from "./navigation";

const PlayerProfilePage = lazy(async () => ({
  default: (await import("./sections/PlayerProfilePage")).PlayerProfilePage,
}));

export function App() {
  return (
    <ThemeProvider>
      <SeasonSelectionProvider>
        <PlayerProfileProvider>
          <Routes>
            <Route element={<AppLayout />}>
              {navigationItems.map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={<Suspense fallback={<LoadingSection />}>{item.element}</Suspense>}
                />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </PlayerProfileProvider>
      </SeasonSelectionProvider>
    </ThemeProvider>
  );
}
