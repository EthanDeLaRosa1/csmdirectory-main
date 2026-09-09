import { useEffect, useState } from "react";
import { runKeywordSearch, getGongStoreStatus, type KeywordResult, type GongStoreStatus } from "../lib/api";
import { BarChart, ColumnChart } from "./Charts";
import { DataTable, type Column } from "./DataTable";
import { usePersistedState, clearPersisted } from "../lib/persist";
import { PRODUCT_OPTIONS } from "../lib/products";

const HIT_COLS: Column[] = [
  { key: "account", label: "Account", type: "text" },
  { key: "arr", label: "ARR", type: "number" },
  { key: "renewalDate", label: "Renewal", type: "date" },
  { key: "renewalOpp", label: "Renewal Opp", type: "text" },
  { key: "source", label: "Source", type: "text" },
  { key: "kind", label: "Type", type: "text" },
  { key: "title", label: "Record", type: "text" },
  { key: "confidence", label: "Conf", type: "number" },
  { key: "date", label: "Date", type: "date" },
  { key: "snippet", label: "Snippet", type: "text" },
];

const RANGES = [
  { label: "180d", value: 180 },
  { label: "1y", value: 365 },
  { label: "2y", value: 730 },
  { label: "4y", value: 1460 },
];

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function hitsCsv(r: KeywordResult): string {
  const head = "source,kind,title,confidence,date,snippet";
  const rows = r.hits.map((h) =>
    [h.source, h.kind, h.title, h.confidence, h.date ?? "", h.snippet]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [head, ...rows].join("\n");
}

export function KeywordSearch() {
  const [account, setAccount] = usePersistedState("mentions.account", "");
  const [products, setProducts] = usePersistedState<string[]>("mentions.products", []);
  const [keyword, setKeyword] = usePersistedState("mentions.keyword", "");
  const [daysBack, setDaysBack] = usePersistedState("mentions.daysBack", 365);
  const [threshold, setThreshold] = usePersistedState("mentions.threshold", 0.6);
  const [gongMode, setGongMode] = usePersistedState<"live" | "stored">("mentions.gongMode", "live");
  const [sources, setSources] = usePersistedState("mentions.sources", { salesforce: true, gong: true, supabase: false });
  const [result, setResult] = usePersistedState<KeywordResult | null>("mentions.result", null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<GongStoreStatus | null>(null);

  function refreshStore() {
    getGongStoreStatus().then(setStore).catch(() => setStore(null));
  }
  useEffect(() => { refreshStore(); }, []);

  function clear() {
    setAccount(""); setProducts([]); setKeyword(""); setDaysBack(365); setThreshold(0.6); setGongMode("live");
    setSources({ salesforce: true, gong: true, supabase: false });
    setResult(null); setError(null);
    clearPersisted("mentions");
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (keyword.trim().length < 2) return; // account optional — blank = global
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await runKeywordSearch({
          accountName: account.trim(),
          products: products.length ? products : undefined,
          keyword: keyword.trim(),
          daysBack,
          confidenceThreshold: threshold,
          sources,
          gongMode,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function toggle(k: keyof typeof sources) {
    setSources((s) => ({ ...s, [k]: !s[k] }));
  }

  function toggleProduct(p: string) {
    setProducts((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));
  }

  const bySourceData = result
    ? [
        { label: "Salesforce", value: result.bySource.salesforce },
        { label: "Gong", value: result.bySource.gong },
        { label: "Supabase", value: result.bySource.supabase },
      ]
    : [];
  const byKindData = result
    ? Object.entries(result.byKind).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
    : [];

  return (
    <div className="report">
      <form className="card" onSubmit={run}>
        <h2 className="card-title">Mentions & Keyword Search</h2>
        <p className="muted-line">
          Account optional — leave <b>blank to search everywhere</b>. e.g. just keyword <b>ServiceNow</b> across all data,
          or account <b>Disney</b> + <b>ServiceNow</b> to scope it.
        </p>
        <div className="map-inputs">
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Account (optional — blank = everywhere)" disabled={loading} />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword (e.g. ServiceNow)" disabled={loading} />
          <div className="range-row">
            {RANGES.map((r) => (
              <button type="button" key={r.value} className={`chip ${daysBack === r.value ? "chip-on" : ""}`} onClick={() => setDaysBack(r.value)} disabled={loading}>
                {r.label}
              </button>
            ))}
          </div>
          <button className="btn-primary" disabled={loading || keyword.trim().length < 2}>
            {loading ? "Searching…" : "Count mentions"}
          </button>
          <button type="button" className="btn-secondary" onClick={clear} disabled={loading}>Clear</button>
        </div>
        <div className="product-row">
          <span className="product-row-label">Products / contract application</span>
          <button
            type="button"
            className={`chip ${products.length === 0 ? "chip-on" : ""}`}
            onClick={() => setProducts([])}
            disabled={loading}
          >
            All
          </button>
          {PRODUCT_OPTIONS.map((p) => (
            <button
              type="button"
              key={p}
              className={`chip ${products.includes(p) ? "chip-on" : ""}`}
              onClick={() => toggleProduct(p)}
              disabled={loading}
            >
              {p}
            </button>
          ))}
          {products.length > 0 && <span className="product-row-hint">{products.length} selected — matches accounts owning any</span>}
        </div>
        <div className="controls-row">
          <div className="src-toggles">
            {(["salesforce", "gong", "supabase"] as const).map((k) => (
              <label key={k} className={`src-toggle ${sources[k] ? "on" : ""}`}>
                <input type="checkbox" checked={sources[k]} onChange={() => toggle(k)} disabled={loading} />
                {k}
              </label>
            ))}
          </div>
          <label className="threshold">
            Confidence ≥ <b>{threshold.toFixed(2)}</b>
            <input type="range" min={0} max={1} step={0.1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} disabled={loading} />
          </label>
          <label className="threshold">
            Gong:
            <select value={gongMode} onChange={(e) => setGongMode(e.target.value as "live" | "stored")} disabled={loading} className="col-select">
              <option value="live">Live (scan API)</option>
              <option value="stored">Stored (fast, ingested)</option>
            </select>
          </label>
        </div>
        <div className="muted-line" style={{ marginTop: 8 }}>
          <span className="store-dot" />
          {!store ? "Gong store: …"
            : store.error ? "Gong store: unavailable"
            : store.count === 0 ? "Gong store: empty — run the ingest job to enable Stored mode"
            : `Gong store: ${store.count.toLocaleString()} transcripts` +
              (store.earliestCall && store.latestCall
                ? ` · ${new Date(store.earliestCall).toLocaleDateString()} – ${new Date(store.latestCall).toLocaleDateString()}`
                : "") +
              (store.lastRun
                ? ` · last ingest ${new Date(store.lastRun.ran_at).toLocaleString()} (+${store.lastRun.ingested} of ${store.lastRun.scanned})`
                : store.lastIngest ? ` · updated ${new Date(store.lastIngest).toLocaleString()}` : "")}
          <button type="button" className="dt-btn" style={{ marginLeft: 8, padding: "1px 8px" }} onClick={refreshStore}>↻</button>
        </div>
        {loading && <div className="thinking-row"><span className="spinner" /> Scanning sources for “{keyword}”…</div>}
        {error && <div className="error-banner">⚠ {error}</div>}
      </form>

      {result && (
        <div className="card">
          <div className="mentions-hero">
            <div className="big-stat">
              <div className="big-value">{result.totalMentions}</div>
              <div className="big-label">mentions of “{result.keyword}” · {result.accountName || "everywhere"}</div>
            </div>
            <button className="btn-secondary" disabled={result.hits.length === 0} onClick={() => download(`${result.accountName}-${result.keyword}-mentions.csv`, hitsCsv(result))}>
              Export CSV
            </button>
          </div>

          {result.gongScanned !== undefined && result.gongScanned > 0 && (
            <div className="muted-line">
              Gong: scanned {result.gongScanned} calls{result.gongCapped ? " (window truncated by time budget — narrow the date range for full coverage)" : " (full window)"}
            </div>
          )}
          {result.errors.length > 0 && <div className="warn-inline">{result.errors.join(" · ")}</div>}

          <div className="chart-grid">
            <div className="chart-box">
              <div className="chart-title">By source</div>
              <BarChart data={bySourceData} />
            </div>
            <div className="chart-box">
              <div className="chart-title">By record type</div>
              <BarChart data={byKindData} color="#3fd07a" />
            </div>
          </div>
          <div className="chart-box">
            <div className="chart-title">Timeline (mentions / month)</div>
            <ColumnChart data={result.timeline.map((t) => ({ label: t.period.slice(2), value: t.count }))} />
          </div>

          <div className="subhead">Matched mentions ({result.hits.length}) — filter, sort, group by account, export</div>
          <DataTable
            rows={result.hits}
            columns={HIT_COLS}
            csvName={`${result.accountName || "all"}-${result.keyword}-mentions.csv`}
            defaultGroupBy="account"
          />
        </div>
      )}
    </div>
  );
}
