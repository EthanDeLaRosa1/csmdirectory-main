import { useState } from "react";
import { runPortfolio, type PortfolioResult } from "@/lib/paz/api";
import { DataTable, type Column } from "./DataTable";
import { usePersistedState, clearPersisted } from "@/lib/paz/persist";
import { Briefcase, FileSpreadsheet } from "lucide-react";

const BASE_COLS: Column[] = [
  { key: "account", label: "Account", type: "text" },
  { key: "products", label: "Products", type: "text" },
  { key: "arr", label: "ARR", type: "number" },
  { key: "renewalDate", label: "Renewal", type: "date" },
  { key: "renewalOpp", label: "Renewal Opp", type: "text" },
  { key: "contractEnd", label: "Contract End", type: "date" },
  { key: "openCases", label: "Open Cases", type: "number" },
  { key: "totalCases", label: "Total Cases", type: "number" },
  { key: "contacts", label: "Contacts", type: "number" },
  { key: "industry", label: "Industry", type: "text" },
  { key: "owner", label: "Owner", type: "text" },
];

export function Portfolio() {
  const [nameFilter, setNameFilter] = usePersistedState("portfolio.nameFilter", "");
  const [minArr, setMinArr] = usePersistedState("portfolio.minArr", "");
  const [renewalBefore, setRenewalBefore] = usePersistedState("portfolio.renewalBefore", "");
  const [keyword, setKeyword] = usePersistedState("portfolio.keyword", "");
  const [limit, setLimit] = usePersistedState("portfolio.limit", 200);
  const [result, setResult] = usePersistedState<PortfolioResult | null>("portfolio.result", null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clear() {
    setNameFilter(""); setMinArr(""); setRenewalBefore(""); setKeyword(""); setLimit(200);
    setResult(null); setError(null);
    clearPersisted("portfolio");
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runPortfolio({
        nameFilter: nameFilter.trim() || undefined,
        minArr: minArr ? Number(minArr) : undefined,
        renewalBefore: renewalBefore || undefined,
        keyword: keyword.trim() || undefined,
        limit,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const cols = result?.keyword
    ? [...BASE_COLS, { key: "keywordMentions", label: `“${result.keyword}” mentions`, type: "number" as const }]
    : BASE_COLS;

  const totalArr = result ? result.rows.reduce((s, r) => s + (Number(r.arr) || 0), 0) : 0;
  const openCases = result ? result.rows.reduce((s, r) => s + (Number(r.openCases) || 0), 0) : 0;

  return (
    <div className="report">
      <form className="bg-card text-card-foreground border border-border/60 shadow-sm rounded-xl p-6" onSubmit={run}>
        <h2 className="card-title inline-flex items-center gap-2"><Briefcase className="w-5 h-5 text-muted-foreground" /> Portfolio — Book of Business</h2>
        <p className="muted-line">
          One row per account across ARR, next renewal, open/total cases, contacts, owner. Filter, sort, group, export.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Name contains</label>
            <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="(all)" disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Min ARR</label>
            <input type="number" value={minArr} onChange={(e) => setMinArr(e.target.value)} placeholder="0" disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Renewal before</label>
            <input type="date" value={renewalBefore} onChange={(e) => setRenewalBefore(e.target.value)} disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Keyword (optional)</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. PAZ" disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Max accounts</label>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm">
              {[50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="col-span-3 flex items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow" disabled={loading}>{loading ? "Loading…" : "Build portfolio"}</button>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground" onClick={clear} disabled={loading}>Clear</button>
          </div>
        </div>
        {loading && <div className="thinking-row"><span className="spinner" /> Aggregating accounts…</div>}
        {error && <div className="error-banner">⚠ {error}</div>}
      </form>

      {result && (
        <div className="card">
          <div className="stat-row">
            <div className="stat"><div className="stat-value">{result.count}</div><div className="stat-label">accounts</div></div>
            <div className="stat"><div className="stat-value">{totalArr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div><div className="stat-label">Σ ARR</div></div>
            <div className="stat"><div className="stat-value">{openCases}</div><div className="stat-label">open cases</div></div>
            <div className="stat"><div className="stat-value">{result.arrField || "—"}</div><div className="stat-label">ARR field</div></div>
          </div>
          <DataTable rows={result.rows} columns={cols} csvName="portfolio.csv" />
        </div>
      )}
    </div>
  );
}
