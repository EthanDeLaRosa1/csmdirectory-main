import { useRef, useState } from "react";
import { streamAccountMapping, type AgentEvent } from "../lib/api";
import { Markdown } from "./Markdown";
import { usePersistedState, clearPersisted } from "../lib/persist";

const TOOL_LABEL: Record<string, string> = {
  salesforce_soql: "Salesforce",
  salesforce_describe: "Salesforce",
  gong_search: "Gong",
  supabase_query: "Supabase",
};

type Step = { tool: string; input: any; summary: string | null };

export function AccountMapping() {
  const [account, setAccount] = usePersistedState("mapping.account", "");
  const [question, setQuestion] = usePersistedState("mapping.question", "");
  const [steps, setSteps] = usePersistedState<Step[]>("mapping.steps", []);
  const [narration, setNarration] = useState("");
  const [status, setStatus] = useState("");
  const [report, setReport] = usePersistedState("mapping.report", "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function clearAll() {
    setAccount(""); setQuestion("");
    setSteps([]); setNarration(""); setStatus(""); setReport(""); setError(null);
    clearPersisted("mapping");
  }

  function reset() {
    setSteps([]);
    setNarration("");
    setStatus("");
    setReport("");
    setError(null);
  }

  function handleEvent(e: AgentEvent) {
    switch (e.type) {
      case "status":
        setStatus(e.message);
        break;
      case "delta":
        // While no final report yet, deltas are live narration.
        setNarration((n) => n + e.text);
        break;
      case "tool_call":
        setStatus("");
        setSteps((s) => [...s, { tool: e.tool, input: e.input, summary: null }]);
        setNarration(""); // narration led up to this call; clear for next thought
        break;
      case "tool_result":
        setSteps((s) => {
          const copy = [...s];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].tool === e.tool && copy[i].summary === null) {
              copy[i] = { ...copy[i], summary: e.summary };
              break;
            }
          }
          return copy;
        });
        break;
      case "report":
        setReport(e.report);
        setNarration("");
        break;
      case "done":
        setStatus("");
        setRunning(false);
        break;
      case "error":
        setError(e.message);
        setRunning(false);
        break;
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const name = account.trim();
    const q = question.trim();
    if (!name && !q) return;
    reset();
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamAccountMapping(
        { accountName: name || undefined, question: q || undefined },
        handleEvent,
        ctrl.signal,
      );
    } catch (err) {
      if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
    setStatus("");
  }

  return (
    <div className="mapping">
      <form className="card" onSubmit={run}>
        <h2 className="card-title"><span className="ai-dot" /> Tango AI — Account Mapping</h2>
        <p className="muted-line">
          Tango AI queries Salesforce, Gong, and Supabase live, cross-references contacts and domains,
          and returns a stakeholder map — streamed as it explores.
        </p>
        <div className="map-inputs">
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="Account name (e.g. Acme Corp)"
            disabled={running}
            autoFocus
          />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Optional: specific question to explore"
            disabled={running}
          />
          {running ? (
            <button type="button" className="btn-secondary" onClick={stop}>Stop</button>
          ) : (
            <button className="btn-primary" disabled={!account.trim() && !question.trim()}>Map account</button>
          )}
          {!running && <button type="button" className="btn-secondary" onClick={clearAll}>Clear</button>}
        </div>
        {error && <div className="error-banner">⚠ {error}</div>}
      </form>

      {(running || steps.length > 0 || report) && (
        <div className="card">
          <div className="toollog">
            <div className="toollog-head">
              Exploration {running && <span className="live-badge">● live</span>}
            </div>
            <div className="toollog-items">
              {steps.map((t, i) => (
                <div className="toollog-item" key={i}>
                  <span className={`src-tag src-${t.tool}`}>{TOOL_LABEL[t.tool] || t.tool}</span>
                  <span className="toollog-summary">
                    {t.summary === null ? <span className="spinner" /> : t.summary}
                  </span>
                  <code className="toollog-input">{JSON.stringify(t.input).slice(0, 140)}</code>
                </div>
              ))}
              {status && (
                <div className="toollog-item">
                  <span className="spinner" /> <span className="toollog-summary">{status}</span>
                </div>
              )}
            </div>
            {narration && <div className="narration">{narration}</div>}
          </div>

          {report && (
            <div className="report-body">
              <Markdown text={report} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
