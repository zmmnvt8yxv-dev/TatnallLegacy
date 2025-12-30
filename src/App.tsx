import { ThemeProvider } from "./components/ThemeProvider";
import { Header } from "./components/Header";
import { SummarySection } from "./sections/SummarySection";
import { TeamsSection } from "./sections/TeamsSection";
import { MatchupsSection } from "./sections/MatchupsSection";
import { TransactionsSection } from "./sections/TransactionsSection";
import { DraftSection } from "./sections/DraftSection";
import { MembersSection } from "./sections/MembersSection";
import { MostDraftedSection } from "./sections/MostDraftedSection";
import { LiveSection } from "./sections/LiveSection";

export function App() {
  return (
    <ThemeProvider>
      <Header />
      <main id="content" className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
        <SummarySection />
        <TeamsSection />
        <MatchupsSection />
        <TransactionsSection />
        <DraftSection />
        <MembersSection />
        <MostDraftedSection />
        <LiveSection />
      </main>
      <footer className="border-t border-border bg-surface py-6">
        <div className="mx-auto w-full max-w-6xl px-4 text-sm text-muted">
          Built from ESPN/Sleeper data. Static UI on GitHub Pages.
        </div>
      </footer>
      <noscript>
        <div className="panel mx-auto my-6 w-full max-w-4xl">Enable JavaScript to view league data.</div>
      </noscript>
    </ThemeProvider>
  );
}
