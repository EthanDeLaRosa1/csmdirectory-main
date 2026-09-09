import { useState } from "react";
import { runPortfolio, type PortfolioResult } from "../lib/api";
import { DataTable, type Column } from "./DataTable";
import { usePersistedState, clearPersisted } from "../lib/persist";

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
      <form className="card" onSubmit={run}>
        <h2 className="card-title">Portfolio — Book of Business</h2>
        <p className="muted-line">
          One row per account across ARR, next renewal, open/total cases, contacts, owner. Filter, sort, group, export.
        </p>
        <div className="portfolio-controls">
          <label className="pf-field"><span>Name contains</span>
            <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="(all)" disabled={loading} />
          </label>
          <label className="pf-field"><span>Min ARR</span>
            <input type="number" value={minArr} onChange={(e) => setMinArr(e.target.value)} placeholder="0" disabled={loading} />
          </label>
          <label className="pf-field"><span>Renewal before</span>
            <input type="date" value={renewalBefore} onChange={(e) => setRenewalBefore(e.target.value)} disabled={loading} />
          </label>
          <label className="pf-field"><span>Keyword (optional)</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. ServiceNow" disabled={loading} />
          </label>
          <label className="pf-field"><span>Max accounts</span>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} disabled={loading}>
              {[50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn-primary" disabled={loading}>{loading ? "Loading…" : "Build portfolio"}</button>
          <button type="button" className="btn-secondary" onClick={clear} disabled={loading}>Clear</button>
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
