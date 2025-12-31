import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LoadingSection } from "./components/LoadingSection";
import { ThemeProvider } from "./components/ThemeProvider";
import { SeasonSelectionProvider } from "./hooks/useSeasonSelection";
import { navigationItems } from "./navigation";

export function App() {
  return (
    <ThemeProvider>
      <SeasonSelectionProvider>
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
      </SeasonSelectionProvider>
    </ThemeProvider>
  );
}
