import React, { useState } from "react";
import { runCrossSourceQuery, type CrossSourceResult } from "@/lib/paz/api";
import { DataTable, type Column } from "./DataTable";
import { usePersistedState, clearPersisted } from "@/lib/paz/persist";
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Search, Sparkles, RefreshCw } from "lucide-react";

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

export function CrossSourceReport(): JSX.Element {
  const [account, setAccount] = usePersistedState("report.account", "");
  const [dateRange, setDateRange] = usePersistedState("report.dateRange", 365);
  const [sources, setSources] = usePersistedState("report.sources", { salesforce: true, gong: true, supabase: false });
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = usePersistedState<CrossSourceResult | null>("report.data", null);
  const [error, setError] = useState<string | null>(null);

  function handleToggle(key: "salesforce" | "gong" | "supabase") {
    setSources((s: any) => ({ ...s, [key]: !s[key] }));
  }

  async function handleRun(e?: React.FormEvent) {
    e?.preventDefault();
    if (!account || account.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runCrossSourceQuery({ accountName: account.trim(), daysBack: Number(dateRange), sources });
      setReportData(res as CrossSourceResult);
    } catch (err: any) {
      setError(err?.message || String(err));
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setAccount("");
    setDateRange(365);
    setSources({ salesforce: true, gong: true, supabase: false });
    setReportData(null);
    setError(null);
    clearPersisted("report");
  }

  const people = reportData?.crossReference?.people ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <div>
            <CardTitle>Cross-Source Report Builder</CardTitle>
            <CardDescription>Query multiple sources and produce a consolidated cross-reference.</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleRun} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Account</label>
              <div className="flex items-center gap-2">
                <input
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="Account name"
                  disabled={loading}
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => { setAccount(""); }} className="inline-flex items-center p-2 rounded-md text-sm text-foreground bg-muted/5">
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Date range</label>
              <div className="flex gap-2">
                {RANGES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setDateRange(r.value)}
                    disabled={loading}
                    className={`inline-flex items-center rounded-lg px-3 py-1 text-sm ${Number(dateRange) === r.value ? "bg-primary text-primary-foreground" : "bg-muted/10 text-foreground"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2 flex items-center gap-3">
              <button
                type="submit"
                onClick={handleRun}
                disabled={loading || !account || account.trim().length < 2}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow"
              >
                <Search className="w-4 h-4" />
                {loading ? "Querying…" : "Run"}
              </button>

              <button type="button" onClick={handleClear} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm">
                <RefreshCw className="w-4 h-4" />
                Clear
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(["salesforce", "gong", "supabase"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={sources[k]} onChange={() => handleToggle(k)} disabled={loading} className="w-4 h-4" />
                <span className="capitalize">{k}</span>
              </label>
            ))}
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </form>

        {reportData && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Cross-Reference: {reportData.crossReference.domains.length} domain(s)</div>
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center gap-2 rounded-md bg-muted/10 px-3 py-2 text-sm">Export</button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-medium">People</h3>
                <DataTable rows={people} columns={PEOPLE_COLS} csvName={`${reportData.accountName}-crossref.csv`} defaultGroupBy="account" />
              </div>

              <div>
                <h3 className="font-medium">Salesforce</h3>
                <pre className="rounded-md bg-muted/5 p-3 text-sm overflow-auto">
                  {JSON.stringify(reportData.salesforce, null, 2)}
                </pre>
              </div>

              <div>
                <h3 className="font-medium">Gong</h3>
                <pre className="rounded-md bg-muted/5 p-3 text-sm overflow-auto">
                  {JSON.stringify(reportData.gong, null, 2)}
                </pre>
              </div>

              <div>
                <h3 className="font-medium">Supabase</h3>
                <pre className="rounded-md bg-muted/5 p-3 text-sm overflow-auto">
                  {JSON.stringify(reportData.supabase, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter />
    </Card>
  );
}
