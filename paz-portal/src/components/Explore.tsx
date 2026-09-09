import { useState } from "react";
import { runInvestigate, type InvestigateResult, type InvestigateRow } from "../lib/api";
import { DataTable, type Column } from "./DataTable";
import { usePersistedState, clearPersisted } from "../lib/persist";

const COLS: Column[] = [
  { key: "type", label: "Type", type: "text" },
  { key: "account", label: "Account", type: "text" },
  { key: "title", label: "Title", type: "text" },
  { key: "detail", label: "Detail", type: "text" },
  { key: "date", label: "Date", type: "date" },
  { key: "arr", label: "ARR", type: "number" },
  { key: "renewalDate", label: "Renewal", type: "date" },
  { key: "amount", label: "Amount", type: "number" },
  { key: "stage", label: "Stage", type: "text" },
  { key: "status", label: "Status", type: "text" },
  { key: "owner", label: "Owner", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "source", label: "Source", type: "text" },
];

const ALL_TYPES = ["account", "contact", "case", "opportunity", "call"] as const;

export function Explore() {
  const [keyword, setKeyword] = usePersistedState("explore.keyword", "");
  const [accountName, setAccountName] = usePersistedState("explore.accountName", "");
  const [types, setTypes] = usePersistedState<string[]>("explore.types", [...ALL_TYPES]);
  const [minArr, setMinArr] = usePersistedState("explore.minArr", "");
  const [maxArr, setMaxArr] = usePersistedState("explore.maxArr", "");
  const [renewalAfter, setRenewalAfter] = usePersistedState("explore.renewalAfter", "");
  const [renewalBefore, setRenewalBefore] = usePersistedState("explore.renewalBefore", "");
  const [sources, setSources] = usePersistedState("explore.sources", { salesforce: true, gong: true });
  const [views, setViews] = usePersistedState<{ name: string; f: any }[]>("explore.views", []);
  const [result, setResult] = usePersistedState<InvestigateResult | null>("explore.result", null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<InvestigateRow | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (keyword.trim().length < 2 && accountName.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setDrill(null);
    try {
      setResult(await runInvestigate({
        keyword: keyword.trim() || undefined,
        accountName: accountName.trim() || undefined,
        types,
        minArr: minArr ? Number(minArr) : null,
        maxArr: maxArr ? Number(maxArr) : null,
        renewalAfter: renewalAfter || undefined,
        renewalBefore: renewalBefore || undefined,
        sources,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setKeyword(""); setAccountName(""); setTypes([...ALL_TYPES]);
    setMinArr(""); setMaxArr(""); setRenewalAfter(""); setRenewalBefore("");
    setSources({ salesforce: true, gong: true });
    setResult(null); setError(null); setDrill(null);
    clearPersisted("explore");
  }

  function toggleType(t: string) {
    setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  }

  function saveView() {
    const name = window.prompt("Name this view:");
    if (!name?.trim()) return;
    const f = { keyword, accountName, types, minArr, maxArr, renewalAfter, renewalBefore, sources };
    setViews((v) => [...v.filter((x) => x.name !== name.trim()), { name: name.trim(), f }]);
  }
  function loadView(f: any) {
    setKeyword(f.keyword || ""); setAccountName(f.accountName || ""); setTypes(f.types || [...ALL_TYPES]);
    setMinArr(f.minArr || ""); setMaxArr(f.maxArr || "");
    setRenewalAfter(f.renewalAfter || ""); setRenewalBefore(f.renewalBefore || "");
    setSources(f.sources || { salesforce: true, gong: true });
  }
  function delView(name: string) {
    setViews((v) => v.filter((x) => x.name !== name));
  }

  return (
    <div className="report">
      <form className="card" onSubmit={run}>
        <h2 className="card-title">Explore — investigate everything</h2>
        <p className="muted-line">
          Fill any boxes to scope the search, then filter/sort/group/export the results and click a row to drill in.
        </p>
        <div className="views-bar">
          <button type="button" className="dt-btn" onClick={saveView} disabled={loading}>★ Save view</button>
          {views.map((v) => (
            <span className="view-chip" key={v.name}>
              <button type="button" onClick={() => loadView(v.f)} disabled={loading}>{v.name}</button>
              <button type="button" className="view-del" onClick={() => delView(v.name)} title="Delete">×</button>
            </span>
          ))}
          {views.length === 0 && <span className="muted-line" style={{ margin: 0 }}>No saved views yet — set filters and Save.</span>}
        </div>
        <div className="portfolio-controls">
          <label className="pf-field"><span>Keyword</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. ServiceNow" disabled={loading} autoFocus />
          </label>
          <label className="pf-field"><span>Account name</span>
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. Disney" disabled={loading} />
          </label>
          <label className="pf-field"><span>ARR min</span>
            <input type="number" value={minArr} onChange={(e) => setMinArr(e.target.value)} placeholder="0" disabled={loading} />
          </label>
          <label className="pf-field"><span>ARR max</span>
            <input type="number" value={maxArr} onChange={(e) => setMaxArr(e.target.value)} placeholder="∞" disabled={loading} />
          </label>
          <label className="pf-field"><span>Renewal after</span>
            <input type="date" value={renewalAfter} onChange={(e) => setRenewalAfter(e.target.value)} disabled={loading} />
          </label>
          <label className="pf-field"><span>Renewal before</span>
            <input type="date" value={renewalBefore} onChange={(e) => setRenewalBefore(e.target.value)} disabled={loading} />
          </label>
        </div>
        <div className="controls-row">
          <div className="src-toggles">
            <span className="muted-line" style={{ margin: 0 }}>Types:</span>
            {ALL_TYPES.map((t) => (
              <label key={t} className={`src-toggle ${types.includes(t) ? "on" : ""}`}>
                <input type="checkbox" checked={types.includes(t)} onChange={() => toggleType(t)} disabled={loading} />
                {t}
              </label>
            ))}
          </div>
          <div className="src-toggles">
            {(["salesforce", "gong"] as const).map((k) => (
              <label key={k} className={`src-toggle ${sources[k] ? "on" : ""}`}>
                <input type="checkbox" checked={sources[k]} onChange={() => setSources((s) => ({ ...s, [k]: !s[k] }))} disabled={loading} />
                {k}
              </label>
            ))}
          </div>
        </div>
        <div className="map-inputs" style={{ marginTop: 12 }}>
          <button className="btn-primary" disabled={loading || (keyword.trim().length < 2 && accountName.trim().length < 2)}>
            {loading ? "Searching…" : "Investigate"}
          </button>
          <button type="button" className="btn-secondary" onClick={clear} disabled={loading}>Clear</button>
        </div>
        {loading && <div className="thinking-row"><span className="spinner" /> Fanning out across sources…</div>}
        {error && <div className="error-banner">⚠ {error}</div>}
      </form>

      {result && (
        <div className="card">
          <div className="stat-row">
            <div className="stat"><div className="stat-value">{result.count}</div><div className="stat-label">records</div></div>
            <div className="stat"><div className="stat-value">{result.accounts}</div><div className="stat-label">accounts</div></div>
            {Object.entries(result.byType).slice(0, 2).map(([t, n]) => (
              <div className="stat" key={t}><div className="stat-value">{n}</div><div className="stat-label">{t}</div></div>
            ))}
          </div>
          {result.errors.length > 0 && <div className="warn-inline">{result.errors.join(" · ")}</div>}
          <DataTable rows={result.rows} columns={COLS} csvName={`explore-${result.query}.csv`} onRowClick={(r) => setDrill(r as InvestigateRow)} />
        </div>
      )}

      {drill && (
        <div className="drawer-overlay" onClick={() => setDrill(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <span className={`src-tag src-${drill.source}`}>{drill.source}</span>
                <strong style={{ marginLeft: 8 }}>{drill.type} · {drill.title}</strong>
              </div>
              <button className="dt-btn" onClick={() => setDrill(null)}>✕</button>
            </div>
            <div className="drawer-body">
              <table className="md-table">
                <tbody>
                  {Object.entries(drill).filter(([k]) => k !== "raw").map(([k, v]) => (
                    <tr key={k}><td className="drawer-key">{k}</td><td>{v == null ? "" : String(v)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="subhead">Raw record</div>
              <pre className="drawer-raw">{JSON.stringify(drill.raw, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
