import { useState } from "react";
import { Search, Sparkles, Filter, X } from "lucide-react";
import { runInvestigate, type InvestigateResult, type InvestigateRow } from "@/lib/paz/api";
import { DataTable, type Column } from "./DataTable";
import { usePersistedState, clearPersisted } from "@/lib/paz/persist";

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
      <form className="bg-card text-card-foreground border border-border/60 shadow-sm rounded-xl p-6" onSubmit={run}>
        <h2 className="card-title inline-flex items-center gap-2"><Search className="w-5 h-5 text-muted-foreground" /> Explore — investigate everything</h2>
        <p className="muted-line">
          Fill any boxes to scope the search, then filter/sort/group/export the results and click a row to drill in.
        </p>
        <div className="views-bar flex flex-wrap items-center gap-3">
          <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow" onClick={saveView} disabled={loading}><Sparkles className="w-4 h-4" /> Save view</button>
          {views.map((v) => (
            <span className="view-chip inline-flex items-center gap-2" key={v.name}>
              <button type="button" className="text-sm text-foreground" onClick={() => loadView(v.f)} disabled={loading}>{v.name}</button>
              <button type="button" className="text-sm text-muted-foreground" onClick={() => delView(v.name)} title="Delete">×</button>
            </span>
          ))}
          {views.length === 0 && <span className="text-sm text-muted-foreground">No saved views yet — set filters and Save.</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end mt-3">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Keyword</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. PAZ" disabled={loading} autoFocus className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Account name</label>
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. Disney" disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">ARR min</label>
            <input type="number" value={minArr} onChange={(e) => setMinArr(e.target.value)} placeholder="0" disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm transition-colors" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">ARR max</label>
            <input type="number" value={maxArr} onChange={(e) => setMaxArr(e.target.value)} placeholder="∞" disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm transition-colors" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Renewal after</label>
            <input type="date" value={renewalAfter} onChange={(e) => setRenewalAfter(e.target.value)} disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm transition-colors" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Renewal before</label>
            <input type="date" value={renewalBefore} onChange={(e) => setRenewalBefore(e.target.value)} disabled={loading} className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm transition-colors" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">Types:</span>
            <div className="flex items-center gap-2">
              {ALL_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => toggleType(t)} disabled={loading} className={`${types.includes(t) ? "bg-muted/30" : "bg-background/0"} flex items-center gap-2 text-sm text-foreground px-3 py-1.5 rounded-lg border border-border/40`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">Sources:</span>
            <div className="flex items-center gap-2">
              {(["salesforce", "gong"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setSources((s) => ({ ...s, [k]: !s[k] }))} disabled={loading} className={`${sources[k] ? "bg-muted/30" : "bg-background/0"} flex items-center gap-2 text-sm text-foreground px-3 py-1.5 rounded-lg border border-border/40`}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90" disabled={loading || (keyword.trim().length < 2 && accountName.trim().length < 2)}>
            <Filter className="w-4 h-4" /> {loading ? "Searching…" : "Investigate"}
          </button>
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground" onClick={clear} disabled={loading}><X className="w-4 h-4" /> Clear</button>
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
            <div className="drawer-head inline-flex items-center justify-between w-full">
              <div className="inline-flex items-center gap-3">
                <span className={`src-tag src-${drill.source}`}>{drill.source}</span>
                <strong className="text-foreground">{drill.type} · {drill.title}</strong>
              </div>
              <button className="inline-flex items-center justify-center rounded-lg border border-input bg-background px-3 py-1 text-sm" onClick={() => setDrill(null)}><X className="w-4 h-4" /></button>
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
