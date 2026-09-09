import { useState } from "react";
import { CollectForm } from "./components/CollectForm";
import { DataDisplay } from "./components/DataDisplay";
import { ResearchPanel } from "./components/ResearchPanel";
import { AccountMapping } from "./components/AccountMapping";
import { CrossSourceReport } from "./components/CrossSourceReport";
import { KeywordSearch } from "./components/KeywordSearch";
import { Dashboard } from "./components/Dashboard";
import { Portfolio } from "./components/Portfolio";
import { Explore } from "./components/Explore";
import { collectBriefcase, type BriefcaseResult } from "./lib/api";
import { usePersistedState } from "./lib/persist";

type Tab = "collect" | "mapping" | "report" | "mentions" | "dashboard" | "portfolio" | "explore";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "explore", label: "Explore", hint: "One query across everything + drill-down" },
  { id: "portfolio", label: "Portfolio", hint: "Book of business — ARR, renewals, cases" },
  { id: "mapping", label: "Account Mapping", hint: "Tango AI explores all sources" },
  { id: "mentions", label: "Mentions", hint: "Keyword counts + confidence" },
  { id: "report", label: "Cross-Source Report", hint: "Query & join SF · Gong · Supabase" },
  { id: "dashboard", label: "Dashboard", hint: "Charts from CSV data" },
  { id: "collect", label: "Collect", hint: "Raw briefcase + Q&A" },
];

export function App() {
  const [tab, setTab] = usePersistedState<Tab>("tab", "portfolio");

  const [result, setResult] = usePersistedState<BriefcaseResult | null>("collect.result", null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCollect(accountName: string, daysBack: number) {
    setLoading(true);
    setError(null);
    try {
      setResult(await collectBriefcase(accountName, daysBack));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span> Paz Portal
        </div>
        <div className="brand-sub">Salesforce · Gong · Supabase — mapping, cross-referencing & Tango AI</div>
      </header>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`navtab ${tab === t.id ? "navtab-on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="navtab-label">{t.label}</span>
            <span className="navtab-hint">{t.hint}</span>
          </button>
        ))}
      </nav>

      <main className="main-single">
        {tab === "explore" && <Explore />}
        {tab === "portfolio" && <Portfolio />}
        {tab === "mapping" && <AccountMapping />}
        {tab === "mentions" && <KeywordSearch />}
        {tab === "report" && <CrossSourceReport />}
        {tab === "dashboard" && <Dashboard />}
        {tab === "collect" && (
          <div className="layout">
            <section className="col col-left">
              <CollectForm onCollect={handleCollect} loading={loading} />
              {error && <div className="error-banner">⚠ {error}</div>}
              {result && <DataDisplay result={result} />}
            </section>
            <aside className="col col-right">
              <ResearchPanel context={result} />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
