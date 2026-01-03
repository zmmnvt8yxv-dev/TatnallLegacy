import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import SummaryPage from "./pages/SummaryPage.jsx";
import MatchupsPage from "./pages/MatchupsPage.jsx";
import MatchupDetailPage from "./pages/MatchupDetailPage.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import StandingsPage from "./pages/StandingsPage.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<SummaryPage />} />
        <Route path="/matchups" element={<MatchupsPage />} />
        <Route path="/matchups/:season/:week/:matchupId" element={<MatchupDetailPage />} />
        <Route path="/players/:playerId" element={<PlayerPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/standings" element={<StandingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
