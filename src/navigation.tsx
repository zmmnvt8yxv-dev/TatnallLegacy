import { lazy, type ReactElement } from "react";

const SummarySection = lazy(async () => ({
  default: (await import("./sections/SummarySection")).SummarySection,
}));
const TeamsSection = lazy(async () => ({
  default: (await import("./sections/TeamsSection")).TeamsSection,
}));
const MatchupsSection = lazy(async () => ({
  default: (await import("./sections/MatchupsSection")).MatchupsSection,
}));
const TransactionsSection = lazy(async () => ({
  default: (await import("./sections/TransactionsSection")).TransactionsSection,
}));
const DraftSection = lazy(async () => ({
  default: (await import("./sections/DraftSection")).DraftSection,
}));
const MembersSection = lazy(async () => ({
  default: (await import("./sections/MembersSection")).MembersSection,
}));
const MostDraftedSection = lazy(async () => ({
  default: (await import("./sections/MostDraftedSection")).MostDraftedSection,
}));
const LiveSection = lazy(async () => ({
  default: (await import("./sections/LiveSection")).LiveSection,
}));
const DataInspectorSection = lazy(async () => ({
  default: (await import("./sections/DataInspectorSection")).DataInspectorSection,
}));

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
