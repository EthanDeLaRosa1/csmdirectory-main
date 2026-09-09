import { useRef, useState } from "react";
import { streamAccountMapping, type AgentEvent } from "@/lib/paz/api";
import { Markdown } from "./Markdown";
import { usePersistedState, clearPersisted } from "@/lib/paz/persist";
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "@/components/ui/card";
import { GitMerge, Search, Sparkles, RefreshCw } from "lucide-react";

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
    setAccount("");
    setQuestion("");
    setSteps([]);
    setNarration("");
    setStatus("");
    setReport("");
    setError(null);
    clearPersisted("mapping");
  }

  function resetState() {
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
        setNarration((n) => n + e.text);
        break;
      case "tool_call":
        setStatus("");
        setSteps((s) => [...s, { tool: e.tool, input: e.input, summary: null }]);
        setNarration("");
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
    resetState();
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamAccountMapping({ accountName: name || undefined, question: q || undefined }, handleEvent, ctrl.signal);
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <GitMerge className="w-5 h-5 text-muted-foreground" />
          <div>
            <CardTitle>Tango AI — Account Mapping</CardTitle>
            <CardDescription>Streamed exploration across Salesforce, Gong, and Supabase.</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={run} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Account name</label>
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="Account name (e.g. Acme Corp)"
                disabled={running}
                autoFocus
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Question (optional)</label>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Optional: specific question to explore"
                disabled={running}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm"
              />
            </div>

            <div className="col-span-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={!account.trim() && !question.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow"
              >
                <Search className="w-4 h-4" /> Map account
              </button>

              {running ? (
                <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm">
                  <RefreshCw className="w-4 h-4" /> Stop
                </button>
              ) : (
                <button type="button" onClick={clearAll} className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                  <Sparkles className="w-4 h-4" /> Clear
                </button>
              )}
            </div>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </form>

        {(running || steps.length > 0 || report) && (
          <div className="mt-4 space-y-4">
            <div className="bg-muted/5 rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm">Exploration {running && <span className="ml-2 text-accent">● live</span>}</div>
                <div className="text-sm text-muted-foreground">{status}</div>
              </div>

              <div className="space-y-2">
                {steps.map((t, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`rounded-full px-2 py-1 text-xs bg-muted/10`}>{TOOL_LABEL[t.tool] || t.tool}</div>
                    <div className="flex-1">
                      <div className="text-sm">
                        {t.summary === null ? <span className="inline-block animate-pulse text-sm">Thinking…</span> : t.summary}
                      </div>
                      <code className="block text-xs text-muted-foreground mt-1">{JSON.stringify(t.input).slice(0, 160)}</code>
                    </div>
                  </div>
                ))}
              </div>

              {narration && <div className="mt-3 text-sm text-muted-foreground">{narration}</div>}
            </div>

            {report && (
              <div className="bg-card rounded-md p-4">
                <Markdown text={report} />
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter />
    </Card>
  );
}
