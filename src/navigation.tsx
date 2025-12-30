import type { ReactElement } from "react";
import { DataInspectorSection } from "./sections/DataInspectorSection";
import { DraftSection } from "./sections/DraftSection";
import { LiveSection } from "./sections/LiveSection";
import { MatchupsSection } from "./sections/MatchupsSection";
import { MembersSection } from "./sections/MembersSection";
import { MostDraftedSection } from "./sections/MostDraftedSection";
import { SummarySection } from "./sections/SummarySection";
import { TeamsSection } from "./sections/TeamsSection";
import { TransactionsSection } from "./sections/TransactionsSection";

export type NavigationItem = {
  path: string;
  label: string;
  element: ReactElement;
  liveDot?: boolean;
};

const baseNavigation: NavigationItem[] = [
  { path: "/", label: "Summary", element: <SummarySection /> },
  { path: "/teams", label: "Teams", element: <TeamsSection /> },
  { path: "/matchups", label: "Matchups", element: <MatchupsSection /> },
  { path: "/transactions", label: "Transactions", element: <TransactionsSection /> },
  { path: "/draft", label: "Draft", element: <DraftSection /> },
  { path: "/members", label: "Members", element: <MembersSection /> },
  { path: "/most-drafted", label: "Most Drafted", element: <MostDraftedSection /> },
  { path: "/live", label: "Live", element: <LiveSection />, liveDot: true },
];

const devNavigation: NavigationItem[] = import.meta.env.DEV
  ? [
      {
        path: "/data-inspector",
        label: "Data Inspector",
        element: <DataInspectorSection />,
      },
    ]
  : [];

export const navigationItems = [...baseNavigation, ...devNavigation];

export const externalNavigation = [{ href: "trade.html", label: "Trade Analysis" }];
