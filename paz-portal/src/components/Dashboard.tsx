import { useMemo, useState } from "react";
import { BarChart, PieChart, LineChart } from "./Charts";
import { usePersistedState, clearPersisted } from "../lib/persist";
import { exportXlsxSheets, exportPdf } from "../lib/exporters";
import { availableDatasets } from "../lib/datasets";

type Parsed = { headers: string[]; rows: string[][] };

// Minimal CSV parser (handles quoted fields, commas, escaped quotes, CRLF).
function parseCsv(text: string): Parsed {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  const headers = rows.shift() ?? [];
  return { headers, rows };
}

function isNumericColumn(rows: string[][], idx: number): boolean {
  let n = 0, ok = 0;
  for (const r of rows.slice(0, 50)) {
    const v = (r[idx] ?? "").trim();
    if (v === "") continue;
    n++;
    if (!isNaN(Number(v))) ok++;
  }
  return n > 0 && ok / n > 0.8;
}

type Agg = "count" | "sum" | "avg" | "min" | "max";

export function Dashboard() {
  const [parsed, setParsed] = usePersistedState<Parsed | null>("dashboard.parsed", null);
  const [fileName, setFileName] = usePersistedState("dashboard.fileName", "");
  const [groupCol, setGroupCol] = usePersistedState<number>("dashboard.groupCol", 0);
  const [valueCol, setValueCol] = usePersistedState<number>("dashboard.valueCol", -1); // -1 = row count
  const [agg, setAgg] = usePersistedState<Agg>("dashboard.agg", "count");
  const [chartType, setChartType] = usePersistedState<"bar" | "pie" | "line">("dashboard.chartType", "bar");
  const [topN, setTopN] = usePersistedState<number>("dashboard.topN", 25);
  const [dateCol, setDateCol] = usePersistedState<number>("dashboard.dateCol", -1);
  const [sourceId, setSourceId] = usePersistedState("dashboard.sourceId", "");
  const [error, setError] = useState<string | null>(null);

  const liveSets = availableDatasets(); // reads persisted tab results

  function loadLive(id: string) {
    const ds = availableDatasets().find((d) => d.id === id);
    if (!ds) { setError("That dataset isn't available — run the source tab first."); return; }
    setParsed({ headers: ds.headers, rows: ds.rows });
    setFileName(ds.label);
    // Smart default group column, in priority order.
    let pref = -1;
    for (const p of ["account", "industry", "type", "kind", "stage", "owner"]) {
      const i = ds.headers.findIndex((h) => h.toLowerCase() === p);
      if (i >= 0) { pref = i; break; }
    }
    setGroupCol(pref >= 0 ? pref : 0);
    setValueCol(-1); setAgg("count"); setDateCol(-1); setError(null);
  }
  function pickSource(id: string) {
    setSourceId(id);
    if (id) loadLive(id);
  }

  function clear() {
    setSourceId("");
    setParsed(null); setFileName(""); setGroupCol(0); setValueCol(-1); setAgg("count");
    setChartType("bar"); setTopN(25); setDateCol(-1); setError(null);
    clearPersisted("dashboard");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const p = parseCsv(text);
      if (p.headers.length === 0) throw new Error("Empty or unreadable CSV.");
      setParsed(p);
      setFileName(file.name);
      setGroupCol(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setParsed(null);
    }
  }

  const groupCounts = useMemo(() => {
    if (!parsed) return [];
    // Bucket values per group, then apply the aggregation.
    const buckets = new Map<string, number[]>();
    for (const r of parsed.rows) {
      const key = (r[groupCol] ?? "").trim() || "(blank)";
      const v = valueCol >= 0 ? Number(r[valueCol]) : 1;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(isNaN(v) ? 0 : v);
    }
    const reduce = (arr: number[]): number => {
      if (agg === "count") return arr.length;
      if (arr.length === 0) return 0;
      const sum = arr.reduce((a, b) => a + b, 0);
      if (agg === "sum") return sum;
      if (agg === "avg") return sum / arr.length;
      if (agg === "min") return Math.min(...arr);
      if (agg === "max") return Math.max(...arr);
      return arr.length;
    };
    return Array.from(buckets.entries())
      .map(([label, vals]) => ({ label, value: Math.round(reduce(vals) * 100) / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);
  }, [parsed, groupCol, valueCol, agg, topN]);

  // Trend series: bucket a date column by month, aggregate the value.
  const lineSeries = useMemo(() => {
    if (!parsed || dateCol < 0) return [];
    const buckets = new Map<string, number[]>();
    for (const r of parsed.rows) {
      const raw = (r[dateCol] ?? "").trim();
      if (!raw) continue;
      const d = new Date(raw);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const v = valueCol >= 0 ? Number(r[valueCol]) : 1;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(isNaN(v) ? 0 : v);
    }
    const reduce = (arr: number[]): number => {
      if (agg === "count") return arr.length;
      if (arr.length === 0) return 0;
      const sum = arr.reduce((a, b) => a + b, 0);
      if (agg === "sum") return sum;
      if (agg === "avg") return sum / arr.length;
      if (agg === "min") return Math.min(...arr);
      if (agg === "max") return Math.max(...arr);
      return arr.length;
    };
    return Array.from(buckets.entries())
      .map(([label, vals]) => ({ label: label.slice(2), value: Math.round(reduce(vals) * 100) / 100 }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [parsed, dateCol, valueCol, agg]);

  function exportExcel() {
    if (!parsed) return;
    const rawRows = parsed.rows.map((r) => Object.fromEntries(parsed.headers.map((h, i) => [h || `col${i}`, r[i] ?? ""])));
    const rawCols = parsed.headers.map((h, i) => ({ key: h || `col${i}`, label: h || `col ${i + 1}` }));
    exportXlsxSheets([
      { name: "Summary", rows: groupCounts.map((g) => ({ group: g.label, value: g.value })), columns: [{ key: "group", label: parsed.headers[groupCol] || "Group" }, { key: "value", label: `${agg} ${valueCol >= 0 ? parsed.headers[valueCol] : ""}`.trim() }] },
      { name: "NumericStats", rows: numericStats, columns: [{ key: "column", label: "Column" }, { key: "count", label: "Count" }, { key: "sum", label: "Sum" }, { key: "avg", label: "Avg" }, { key: "min", label: "Min" }, { key: "max", label: "Max" }] },
      { name: "Raw", rows: rawRows, columns: rawCols },
    ], (fileName || "dashboard").replace(/\.csv$/, ""));
  }
  function exportReportPdf() {
    if (!parsed) return;
    exportPdf(
      groupCounts.map((g) => ({ group: g.label, value: g.value })),
      [{ key: "group", label: parsed.headers[groupCol] || "Group" }, { key: "value", label: `${agg}` }],
      (fileName || "dashboard").replace(/\.csv$/, "") + "-report",
      `${fileName || "Dashboard"} — ${agg}${valueCol >= 0 ? ` of ${parsed.headers[valueCol]}` : ""} by ${parsed.headers[groupCol]}`,
    );
  }

  const numericStats = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers
      .map((h, idx) => ({ h, idx }))
      .filter(({ idx }) => isNumericColumn(parsed.rows, idx))
      .map(({ h, idx }) => {
        const nums = parsed.rows.map((r) => Number(r[idx])).filter((v) => !isNaN(v));
        const sum = nums.reduce((a, b) => a + b, 0);
        return {
          column: h,
          count: nums.length,
          sum,
          avg: nums.length ? sum / nums.length : 0,
          min: nums.length ? Math.min(...nums) : 0,
          max: nums.length ? Math.max(...nums) : 0,
        };
      });
  }, [parsed]);

  return (
    <div className="report">
      <form className="card">
        <h2 className="card-title">Reports & Dashboard</h2>
        <p className="muted-line">
          Chart live results from any tab — no re-upload — or upload a CSV. Then switch chart types, aggregate, and export to Excel/PDF.
        </p>
        <div className="portfolio-controls">
          <label className="pf-field"><span>Data source</span>
            <select value={sourceId} onChange={(e) => pickSource(e.target.value)}>
              <option value="">Upload CSV…</option>
              {liveSets.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          {sourceId && (
            <button type="button" className="btn-secondary" onClick={() => loadLive(sourceId)}>↻ Refresh from source</button>
          )}
          {parsed && <button type="button" className="btn-secondary" onClick={clear}>Clear</button>}
        </div>
        {liveSets.length > 0 && (
          <div className="views-bar" style={{ marginTop: 10 }}>
            <span className="muted-line" style={{ margin: 0 }}>Live data:</span>
            {liveSets.map((d) => (
              <button type="button" key={d.id} className={`chip ${sourceId === d.id ? "chip-on" : ""}`} onClick={() => pickSource(d.id)}>{d.label}</button>
            ))}
          </div>
        )}
        {sourceId === "" && (
          <label className="file-drop" style={{ marginTop: 10 }}>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
            <span>{fileName && !sourceId ? `📄 ${fileName}` : "Choose a CSV file…"}</span>
          </label>
        )}
        {liveSets.length === 0 && sourceId === "" && (
          <div className="muted-line" style={{ marginTop: 8 }}>No live datasets yet — run Portfolio, Explore, Mentions, or Cross-Source Report to chart them here.</div>
        )}
        {error && <div className="error-banner">⚠ {error}</div>}
      </form>

      {parsed && (
        <>
          <div className="card">
            <div className="stat-row">
              <div className="stat"><div className="stat-value">{parsed.rows.length}</div><div className="stat-label">rows</div></div>
              <div className="stat"><div className="stat-value">{parsed.headers.length}</div><div className="stat-label">columns</div></div>
              <div className="stat"><div className="stat-value">{numericStats.length}</div><div className="stat-label">numeric cols</div></div>
              <div className="stat"><div className="stat-value">{groupCounts.length}</div><div className="stat-label">groups shown</div></div>
            </div>

            <div className="chart-box">
              <div className="chart-title-row" style={{ flexWrap: "wrap" }}>
                <span className="chart-title">
                  {agg === "count" ? "Count" : `${agg.toUpperCase()} of ${parsed.headers[valueCol] || "?"}`} by
                </span>
                {chartType === "line" ? (
                  <select value={dateCol} onChange={(e) => setDateCol(Number(e.target.value))} className="col-select">
                    <option value={-1}>(pick a date column)</option>
                    {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `col ${i + 1}`}</option>)}
                  </select>
                ) : (
                  <select value={groupCol} onChange={(e) => setGroupCol(Number(e.target.value))} className="col-select">
                    {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `col ${i + 1}`}</option>)}
                  </select>
                )}
                <select value={agg} onChange={(e) => { const a = e.target.value as Agg; setAgg(a); if (a !== "count" && valueCol < 0) setValueCol(parsed.headers.findIndex((_, i) => isNumericColumn(parsed.rows, i))); }} className="col-select">
                  {(["count", "sum", "avg", "min", "max"] as Agg[]).map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                {agg !== "count" && (
                  <select value={valueCol} onChange={(e) => setValueCol(Number(e.target.value))} className="col-select">
                    {parsed.headers.map((h, i) => isNumericColumn(parsed.rows, i) ? <option key={i} value={i}>{h || `col ${i + 1}`}</option> : null)}
                  </select>
                )}
                <span style={{ flex: 1 }} />
                <select value={chartType} onChange={(e) => setChartType(e.target.value as any)} className="col-select">
                  <option value="bar">Bar</option>
                  <option value="pie">Pie</option>
                  <option value="line">Trend (line)</option>
                </select>
                {chartType !== "line" && (
                  <select value={topN} onChange={(e) => setTopN(Number(e.target.value))} className="col-select">
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>top {n}</option>)}
                  </select>
                )}
              </div>
              {chartType === "bar" && <BarChart data={groupCounts} height={340} />}
              {chartType === "pie" && <PieChart data={groupCounts.slice(0, 12)} size={260} />}
              {chartType === "line" && (dateCol >= 0 ? <LineChart data={lineSeries} height={240} /> : <div className="empty">Pick a date column to plot the trend.</div>)}
            </div>

            <div className="report-actions">
              <span className="muted-line">Export the report:</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-secondary" onClick={exportExcel}>Excel (.xlsx)</button>
                <button className="btn-secondary" onClick={exportReportPdf}>PDF</button>
              </div>
            </div>
          </div>

          {numericStats.length > 0 && (
            <div className="card">
              <div className="subhead">Numeric columns</div>
              <div className="md-table-wrap">
                <table className="md-table">
                  <thead><tr><th>Column</th><th>Count</th><th>Sum</th><th>Avg</th><th>Min</th><th>Max</th></tr></thead>
                  <tbody>
                    {numericStats.map((s, i) => (
                      <tr key={i}>
                        <td>{s.column}</td><td>{s.count}</td>
                        <td>{s.sum.toLocaleString()}</td>
                        <td>{s.avg.toFixed(2)}</td>
                        <td>{s.min}</td><td>{s.max}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="subhead">Preview (first 50 rows)</div>
            <div className="md-table-wrap">
              <table className="md-table">
                <thead><tr>{parsed.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((r, i) => (
                    <tr key={i}>{parsed.headers.map((_, ci) => <td key={ci}>{(r[ci] ?? "").slice(0, 120)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
