import React, { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Layout from "./components/Layout.jsx";
import { ArchiveLoading } from "./components/v3/ArchiveUI";
import { features } from "./config/features";
import { initAnalytics, trackPageView } from "./utils/analytics";

const NowPage = lazy(() => import("./pages/v3/NowPage"));
const SeasonWeekPage = lazy(() => import("./pages/v3/SeasonWeekPage"));
const SeasonTeamPage = lazy(() => import("./pages/v3/SeasonTeamPage"));
const HistoryPage = lazy(() => import("./pages/v3/HistoryPage"));
const SeasonYearbookPage = lazy(() => import("./pages/v3/SeasonYearbookPage"));
const OwnersPage = lazy(() => import("./pages/v3/OwnersPage"));
const OwnerCareerPage = lazy(() => import("./pages/v3/OwnerCareerPage"));
const PlayersDirectoryPage = lazy(() => import("./pages/v3/PlayersDirectoryPage"));
const PlayerIntelligencePage = lazy(() => import("./pages/v3/PlayerIntelligencePage"));
const WarRoomPage = lazy(() => import("./pages/v3/WarRoomPage"));
const RecordsPage = lazy(() => import("./pages/v3/RecordsPage"));
const DataHealthPage = lazy(() => import("./pages/v3/DataHealthPage"));
const MatchupsPage = lazy(() => import("./pages/MatchupsPage.jsx"));
const MatchupDetailPage = lazy(() => import("./pages/MatchupDetailPage.jsx"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage.jsx"));
const StandingsPage = lazy(() => import("./pages/StandingsPage.jsx"));
const TeamsPage = lazy(() => import("./pages/TeamsPage.jsx"));
const HeadToHeadPage = lazy(() => import("./pages/HeadToHeadPage.jsx"));

function AnalyticsListener() {
  const location = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const path = `${location.pathname}${location.search}${location.hash}`;
    trackPageView(path);
  }, [location.hash, location.pathname, location.search]);

  return null;
}

export default function App() {
  const location = useLocation();

  return (
    <ErrorBoundary>
      <AnalyticsListener />
      <Layout>
        <AnimatePresence mode="wait">
          <Suspense fallback={<ArchiveLoading label="Opening this part of the archive" />}>
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<NowPage />} />
              <Route path="/2026" element={<NowPage />} />
              <Route path="/2026/weeks/:week" element={<SeasonWeekPage />} />
              <Route path="/2026/teams/:ownerId" element={<SeasonTeamPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/matchups" element={<MatchupsPage />} />
              <Route path="/matchups/:season/:week/:matchupId" element={<MatchupDetailPage />} />
              <Route path="/players/:playerId" element={features.playerIntelligenceV1 ? <PlayerIntelligencePage /> : <Navigate to="/players" replace />} />
              <Route path="/players" element={<PlayersDirectoryPage />} />
              <Route path="/war-room" element={features.playerIntelligenceV1 ? <WarRoomPage /> : <Navigate to="/" replace />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/standings" element={<StandingsPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/owners" element={<OwnersPage />} />
              <Route path="/owners/:ownerId" element={<OwnerCareerPage />} />
              <Route path="/seasons" element={<Navigate to="/history" replace />} />
              <Route path="/seasons/:season" element={<SeasonYearbookPage />} />
              <Route path="/records" element={<RecordsPage />} />
              <Route path="/head-to-head" element={<HeadToHeadPage />} />
              <Route path="/data-health" element={<DataHealthPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </Layout>
    </ErrorBoundary>
  );
}
