import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Layout from "./components/Layout.jsx";
import SummaryPage from "./pages/SummaryPage.jsx";
import MatchupsPage from "./pages/MatchupsPage.jsx";
import MatchupDetailPage from "./pages/MatchupDetailPage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import StandingsPage from "./pages/StandingsPage.jsx";
import TeamsPage from "./pages/TeamsPage.jsx";
import OwnerProfilePage from "./pages/OwnerProfilePage.jsx";
import SeasonPage from "./pages/SeasonPage.jsx";
import RecordsPage from "./pages/RecordsPage.jsx";
import HeadToHeadPage from "./pages/HeadToHeadPage.jsx";
import DataIntegrityPage from "./pages/DataIntegrityPage";
import { initAnalytics, trackPageView } from "./utils/analytics";

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
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<SummaryPage />} />
            <Route path="/matchups" element={<MatchupsPage />} />
            <Route path="/matchups/:season/:week/:matchupId" element={<MatchupDetailPage />} />
            <Route path="/players/:playerId" element={<PlayerPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/standings" element={<StandingsPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/owners/:ownerId" element={<OwnerProfilePage />} />
            <Route path="/seasons" element={<SeasonPage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/head-to-head" element={<HeadToHeadPage />} />
            <Route path="/data-health" element={<DataIntegrityPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </Layout>
    </ErrorBoundary>
  );
}

