import { useState } from "react";
import { runCrossSourceQuery, type CrossSourceResult } from "../lib/api";
import { DataTable, type Column } from "./DataTable";
import { usePersistedState, clearPersisted } from "../lib/persist";

const RANGES = [
  { label: "180d", value: 180 },
  { label: "1y", value: 365 },
  { label: "2y", value: 730 },
];

const PEOPLE_COLS: Column[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "account", label: "Account", type: "text" },
  { key: "arr", label: "ARR", type: "number" },
  { key: "renewalDate", label: "Renewal", type: "date" },
  { key: "renewalOpp", label: "Renewal Opp", type: "text" },
  { key: "contractEnd", label: "Contract End", type: "date" },
  { key: "titles", label: "Title", type: "text" },
  { key: "ebstaScore", label: "EBSTA", type: "number" },
  { key: "inSalesforce", label: "SF", type: "text" },
  { key: "inGong", label: "Gong", type: "text" },
  { key: "inCases", label: "Cases", type: "text" },
  { key: "sourceCount", label: "Sources", type: "number" },
];

export function CrossSourceReport() {
  const [account, setAccount] = usePersistedState("report.account", "");
  const [daysBack, setDaysBack] = usePersistedState("report.daysBack", 365);
  const [sources, setSources] = usePersistedState("report.sources", { salesforce: true, gong: true, supabase: false });
  const [result, setResult] = usePersistedState<CrossSourceResult | null>("report.result", null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = usePersistedState<"people" | "salesforce" | "gong" | "supabase">("report.view", "people");

  function clear() {
    setAccount(""); setDaysBack(365);
    setSources({ salesforce: true, gong: true, supabase: false });
    setResult(null); setError(null); setView("people");
    clearPersisted("report");
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (account.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runCrossSourceQuery({ accountName: account.trim(), daysBack, sources }));
      setView("people");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function toggle(k: keyof typeof sources) {
    setSources((s) => ({ ...s, [k]: !s[k] }));
  }

  const people = result?.crossReference.people ?? [];

  return (
    <div className="report">
      <form className="card" onSubmit={run}>
        <h2 className="card-title">Cross-Source Report Builder</h2>
        <div className="map-inputs">
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="Account name"
            disabled={loading}
            autoFocus
          />
          <div className="range-row">
            {RANGES.map((r) => (
              <button
                type="button"
                key={r.value}
                className={`chip ${daysBack === r.value ? "chip-on" : ""}`}
                onClick={() => setDaysBack(r.value)}
                disabled={loading}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className="btn-primary" disabled={loading || account.trim().length < 2}>
            {loading ? "Querying…" : "Run"}
          </button>
          <button type="button" className="btn-secondary" onClick={clear} disabled={loading}>Clear</button>
        </div>
        <div className="src-toggles">
          {(["salesforce", "gong", "supabase"] as const).map((k) => (
            <label key={k} className={`src-toggle ${sources[k] ? "on" : ""}`}>
              <input type="checkbox" checked={sources[k]} onChange={() => toggle(k)} disabled={loading} />
              {k}
            </label>
          ))}
        </div>
        {loading && <div className="thinking-row"><span className="spinner" /> Pulling and joining sources…</div>}
        {error && <div className="error-banner">⚠ {error}</div>}
      </form>

      {result && (
        <div className="card">
          <SourceErrors result={result} />

          <div className="tabs">
            <button className={`tab ${view === "people" ? "tab-on" : ""}`} onClick={() => setView("people")}>
              Cross-Reference ({people.length})
            </button>
            <button className={`tab ${view === "salesforce" ? "tab-on" : ""}`} onClick={() => setView("salesforce")}>
              Salesforce
            </button>
            <button className={`tab ${view === "gong" ? "tab-on" : ""}`} onClick={() => setView("gong")}>
              Gong ({result.gong.transcripts.length})
            </button>
            <button className={`tab ${view === "supabase" ? "tab-on" : ""}`} onClick={() => setView("supabase")}>
              Supabase ({result.supabase.support_cases.length})
            </button>
          </div>

          {view === "people" && (
            <>
              <div className="muted-line">
                {result.crossReference.domains.length} domain(s): {result.crossReference.domains.join(", ") || "—"}
                {result.crossReference.detected?.arr && ` · ARR field: ${result.crossReference.detected.arr}`}
                {result.crossReference.detected?.renewal && ` · renewal: ${result.crossReference.detected.renewal}`}
              </div>
              <DataTable rows={people} columns={PEOPLE_COLS} csvName={`${result.accountName}-crossref.csv`} defaultGroupBy="account" />
            </>
          )}

          {view === "salesforce" && <SalesforceView result={result} />}

          {view === "gong" && (
            <div className="list">
              {result.gong.transcripts.length === 0 && <div className="empty">No Gong transcripts.</div>}
              {result.gong.transcripts.map((t, i) => (
                <div className="item" key={i}>
                  <div className="item-title">{t.title || "Untitled call"}</div>
                  <div className="item-meta">{t.parties.join(", ")}</div>
                  <div className="item-desc">{t.excerpt}</div>
                </div>
              ))}
            </div>
          )}

          {view === "supabase" && (
            <RowTable rows={result.supabase.support_cases} empty="No support_cases rows." />
          )}
        </div>
      )}
    </div>
  );
}

function SourceErrors({ result }: { result: CrossSourceResult }) {
  const errs = [
    result.salesforce.error && `Salesforce: ${result.salesforce.error}`,
    result.gong.error && `Gong: ${result.gong.error}`,
    result.supabase.error && `Supabase: ${result.supabase.error}`,
  ].filter(Boolean);
  if (errs.length === 0) return null;
  return <div className="warn-inline">{errs.join(" · ")}</div>;
}

function SalesforceView({ result }: { result: CrossSourceResult }) {
  const sf = result.salesforce;
  return (
    <div className="list">
      <div className="subhead">Contacts ({sf.contacts.length})</div>
      <RowTable rows={sf.contacts} empty="None." />
      <div className="subhead">Opportunities ({sf.opportunities.length})</div>
      <RowTable rows={sf.opportunities} empty="None." />
      <div className="subhead">Cases ({sf.cases.length})</div>
      <RowTable rows={sf.cases} empty="None." />
    </div>
  );
}

// Generic table for arbitrary record arrays (flattens nested objects to JSON).
function RowTable({ rows, empty }: { rows: any[]; empty: string }) {
  if (!rows || rows.length === 0) return <div className="empty">{empty}</div>;
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).slice(0, 8);
  return (
    <div className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((r, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const v = r[c];
                const s = v && typeof v === "object" ? JSON.stringify(v) : v ?? "";
                return <td key={c}>{String(s).slice(0, 120)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
