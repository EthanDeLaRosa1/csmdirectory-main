import { useMemo, useState } from "react";
import { exportXlsx, exportPdf } from "@/lib/paz/exporters";

// Reusable results table: filter (text/number/date), sort, show/hide + reorder
// columns, group-by, and shaped CSV export. Works on any array of row objects.

type ColType = "text" | "number" | "date";
export type Column = { key: string; label: string; type: ColType };

type FilterRule = { col: string; op: string; val: string; val2?: string };

const OPS: Record<ColType, { v: string; label: string }[]> = {
  text: [
    { v: "contains", label: "contains" },
    { v: "eq", label: "=" },
    { v: "ncontains", label: "not contains" },
  ],
  number: [
    { v: "eq", label: "=" },
    { v: "gte", label: "≥" },
    { v: "lte", label: "≤" },
    { v: "between", label: "between" },
  ],
  date: [
    { v: "gte", label: "on/after" },
    { v: "lte", label: "on/before" },
    { v: "between", label: "between" },
  ],
};

function looksNumeric(vals: string[]): boolean {
  let n = 0, ok = 0;
  for (const v of vals) { if (v === "" || v == null) continue; n++; if (isFinite(Number(v))) ok++; }
  return n > 0 && ok / n > 0.7;
}
function looksDate(vals: string[]): boolean {
  let n = 0, ok = 0;
  for (const v of vals) {
    if (!v) continue; n++;
    if (/[-/]/.test(v) && !isNaN(new Date(v).getTime())) ok++;
  }
  return n > 0 && ok / n > 0.7;
}

function inferColumns(rows: Record<string, any>[]): Column[] {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return keys.map((key) => {
    const vals = rows.slice(0, 60).map((r) => {
      const v = r[key];
      return v && typeof v === "object" ? JSON.stringify(v) : v == null ? "" : String(v);
    });
    const type: ColType = looksNumeric(vals) ? "number" : looksDate(vals) ? "date" : "text";
    return { key, label: key, type };
  });
}

function cellString(v: any): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// A "products" cell may arrive as an array or a "; "/","-joined string.
function productList(v: any): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[;,]/);
  return arr.map((x) => String(x).trim()).filter(Boolean);
}

// Locate the products column key (Products / products) in columns or raw rows.
function findProductKey(rows: Record<string, any>[], cols: Column[]): string | null {
  const hit = cols.find((c) => /^products?$/i.test(c.key));
  if (hit) return hit.key;
  for (const r of rows.slice(0, 20)) {
    const k = Object.keys(r).find((key) => /^products?$/i.test(key));
    if (k) return k;
  }
  return null;
}

function matches(rule: FilterRule, raw: any, type: ColType): boolean {
  const s = cellString(raw);
  if (type === "text") {
    const a = s.toLowerCase(), b = rule.val.toLowerCase();
    if (rule.op === "contains") return a.includes(b);
    if (rule.op === "ncontains") return !a.includes(b);
    if (rule.op === "eq") return a === b;
  }
  if (type === "number") {
    const n = Number(s), v = Number(rule.val);
    if (!isFinite(n)) return false;
    if (rule.op === "eq") return n === v;
    if (rule.op === "gte") return n >= v;
    if (rule.op === "lte") return n <= v;
    if (rule.op === "between") return n >= Number(rule.val) && n <= Number(rule.val2 || rule.val);
  }
  if (type === "date") {
    const t = new Date(s).getTime();
    if (isNaN(t)) return false;
    const a = new Date(rule.val).getTime();
    if (rule.op === "gte") return t >= a;
    if (rule.op === "lte") return t <= a;
    if (rule.op === "between") return t >= a && t <= new Date(rule.val2 || rule.val).getTime();
  }
  return true;
}

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export function DataTable({
  rows,
  columns,
  csvName = "export.csv",
  defaultGroupBy,
  onRowClick,
}: {
  rows: Record<string, any>[];
  columns?: Column[];
  csvName?: string;
  defaultGroupBy?: string;
  onRowClick?: (row: Record<string, any>) => void;
}) {
  const cols = useMemo(() => {
    const base = columns ?? inferColumns(rows);
    // Make sure an existing products field is a real column (visible + exported).
    const pk = findProductKey(rows, base);
    if (pk && !base.some((c) => c.key === pk)) {
      return [...base, { key: pk, label: "Products", type: "text" as const }];
    }
    return base;
  }, [columns, rows]);
  const productKey = useMemo(() => findProductKey(rows, cols), [rows, cols]);
  const allProducts = useMemo(() => {
    if (!productKey) return [] as string[];
    const s = new Set<string>();
    for (const r of rows) for (const p of productList(r[productKey])) s.add(p);
    return Array.from(s).sort();
  }, [rows, productKey]);

  const [order, setOrder] = useState<string[]>(cols.map((c) => c.key));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [selProducts, setSelProducts] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [groupBy, setGroupBy] = useState<string>(defaultGroupBy ?? "");
  const [showCols, setShowCols] = useState(false);

  const colMap = useMemo(() => Object.fromEntries(cols.map((c) => [c.key, c])), [cols]);
  // Honour saved order, then append any columns not yet in it (e.g. Products).
  const effectiveOrder = useMemo(() => {
    const extra = cols.map((c) => c.key).filter((k) => !order.includes(k));
    return [...order, ...extra];
  }, [order, cols]);
  const visibleCols = effectiveOrder.filter((k) => !hidden.has(k)).map((k) => colMap[k]).filter(Boolean);

  const filtered = useMemo(() => {
    let out = rows;
    if (productKey && selProducts.size) {
      out = out.filter((r) => productList(r[productKey]).some((p) => selProducts.has(p)));
    }
    if (text.trim()) {
      const q = text.toLowerCase();
      out = out.filter((r) => visibleCols.some((c) => cellString(r[c.key]).toLowerCase().includes(q)));
    }
    for (const rule of filters) {
      if (!rule.val && rule.op !== "between") continue;
      const type = colMap[rule.col]?.type ?? "text";
      out = out.filter((r) => matches(rule, r[rule.col], type));
    }
    if (sort) {
      const type = colMap[sort.col]?.type ?? "text";
      out = [...out].sort((a, b) => {
        const av = a[sort.col], bv = b[sort.col];
        let c: number;
        if (type === "number") c = (Number(av) || 0) - (Number(bv) || 0);
        else if (type === "date") c = (new Date(cellString(av)).getTime() || 0) - (new Date(cellString(bv)).getTime() || 0);
        else c = cellString(av).localeCompare(cellString(bv));
        return c * sort.dir;
      });
    }
    return out;
  }, [rows, text, filters, sort, colMap, visibleCols, productKey, selProducts]);

  // Group + rollups (sum ARR-like numeric cols, earliest renewal-like date col).
  const groups = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, Record<string, any>[]>();
    for (const r of filtered) {
      const key = cellString(r[groupBy]) || "(blank)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const arrCol = visibleCols.find((c) => c.type === "number" && /arr|revenue|amount/i.test(c.key));
    const renewCol = visibleCols.find((c) => c.type === "date" && /renew|contract|end|close/i.test(c.key));
    return Array.from(map.entries()).map(([key, rs]) => ({
      key, rows: rs, count: rs.length,
      arr: arrCol ? rs.reduce((s, r) => s + (Number(r[arrCol.key]) || 0), 0) : null,
      arrCol: arrCol?.key,
      nextRenewal: renewCol
        ? rs.map((r) => new Date(cellString(r[renewCol.key])).getTime()).filter((t) => !isNaN(t)).sort()[0]
        : null,
      renewCol: renewCol?.key,
    })).sort((a, b) => b.count - a.count);
  }, [filtered, groupBy, visibleCols]);

  function toggleSort(key: string) {
    setSort((s) => (s?.col === key ? { col: key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { col: key, dir: 1 }));
  }
  function move(key: string, dir: -1 | 1) {
    setOrder((o) => {
      const i = o.indexOf(key), j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const copy = [...o];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function exportCsv() {
    const head = visibleCols.map((c) => csvEscape(c.label)).join(",");
    const body = filtered.map((r) => visibleCols.map((c) => csvEscape(cellString(r[c.key]))).join(","));
    const blob = new Blob([[head, ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = csvName; a.click();
    URL.revokeObjectURL(url);
  }

  function toggleProduct(p: string) {
    setSelProducts((s) => {
      const n = new Set(s);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });
  }

  return (
    <div className="dt">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-sm transition hover:bg-accent"
      >
        <span aria-hidden="true">↑</span>
        Top
      </button>

      {allProducts.length > 0 && (
        <div className="dt-products">
          <span className="dt-products-label">Product</span>
          <button
            className={`dt-chip ${selProducts.size === 0 ? "dt-chip-on" : ""}`}
            onClick={() => setSelProducts(new Set())}
          >
            All
          </button>
          {allProducts.map((p) => (
            <button
              key={p}
              className={`dt-chip ${selProducts.has(p) ? "dt-chip-on" : ""}`}
              onClick={() => toggleProduct(p)}
            >
              {p}
            </button>
          ))}
          {selProducts.size > 0 && (
            <span className="dt-products-hint">{selProducts.size} selected</span>
          )}
        </div>
      )}
      <div className="dt-toolbar">
        <input className="dt-search" placeholder="Filter…" value={text} onChange={(e) => setText(e.target.value)} />
        {allProducts.length > 0 && (
          <select
            className="dt-select dt-product-select"
            value={selProducts.size === 1 ? [...selProducts][0] : ""}
            onChange={(e) => setSelProducts(e.target.value ? new Set([e.target.value]) : new Set())}
            title="Filter by product / contract application"
          >
            <option value="">All products</option>
            {allProducts.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <select className="dt-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="">No grouping</option>
          {cols.map((c) => <option key={c.key} value={c.key}>Group by {c.label}</option>)}
        </select>
        <button className="dt-btn" onClick={() => setShowCols((v) => !v)}>Columns ▾</button>
        <button className="dt-btn" onClick={() => setFilters((f) => [...f, { col: cols[0]?.key, op: "contains", val: "" }])}>+ Filter</button>
        <button className="dt-btn" onClick={exportCsv}>CSV</button>
        <button className="dt-btn" onClick={() => exportXlsx(filtered, visibleCols, csvName.replace(/\.csv$/, ""))}>Excel</button>
        <button className="dt-btn" onClick={() => exportPdf(filtered, visibleCols, csvName.replace(/\.csv$/, ""), csvName.replace(/\.csv$/, ""))}>PDF</button>
        <span className="dt-count">{filtered.length} / {rows.length}</span>
      </div>

      {showCols && (
        <div className="dt-cols">
          {effectiveOrder.map((k) => {
            const c = colMap[k];
            if (!c) return null;
            return (
              <div className="dt-col-item" key={k}>
                <label>
                  <input type="checkbox" checked={!hidden.has(k)} onChange={() => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; })} />
                  {c.label} <em>{c.type}</em>
                </label>
                <span className="dt-move">
                  <button onClick={() => move(k, -1)}>↑</button>
                  <button onClick={() => move(k, 1)}>↓</button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {filters.length > 0 && (
        <div className="dt-filters">
          {filters.map((f, i) => {
            const type = colMap[f.col]?.type ?? "text";
            return (
              <div className="dt-filter" key={i}>
                <select value={f.col} onChange={(e) => setFilters((fs) => fs.map((x, xi) => xi === i ? { ...x, col: e.target.value, op: OPS[colMap[e.target.value]?.type ?? "text"][0].v } : x))}>
                  {cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select value={f.op} onChange={(e) => setFilters((fs) => fs.map((x, xi) => xi === i ? { ...x, op: e.target.value } : x))}>
                  {OPS[type].map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
                <input type={type === "date" ? "date" : type === "number" ? "number" : "text"} value={f.val} onChange={(e) => setFilters((fs) => fs.map((x, xi) => xi === i ? { ...x, val: e.target.value } : x))} />
                {f.op === "between" && (
                  <input type={type === "date" ? "date" : "number"} value={f.val2 ?? ""} onChange={(e) => setFilters((fs) => fs.map((x, xi) => xi === i ? { ...x, val2: e.target.value } : x))} />
                )}
                <button className="dt-x" onClick={() => setFilters((fs) => fs.filter((_, xi) => xi !== i))}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="md-table-wrap" style={{ overflowX: "auto", margin: "10px 0" }}>
        <table className="md-table dt-table" style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: "900px", fontSize: "13px" }}>
          <thead>
            <tr>
              {visibleCols.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)} className="dt-th" style={{ border: "1px solid hsl(var(--border))", padding: "12px 14px", textAlign: "left", verticalAlign: "top", whiteSpace: "nowrap", background: "hsl(var(--muted)/0.06)" }}>
                  {c.label}{sort?.col === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!groups && filtered.slice(0, 500).map((r, i) => (
              <tr key={i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? "dt-click" : ""}>
                {visibleCols.map((c) => <td key={c.key} style={{ border: "1px solid hsl(var(--border))", padding: "10px 14px", textAlign: "left", verticalAlign: "top", lineHeight: 1.45 }}>{cellString(r[c.key]).slice(0, 200)}</td>)}
              </tr>
            ))}
            {groups && groups.map((g) => (
              <GroupRows key={g.key} g={g} visibleCols={visibleCols} onRowClick={onRowClick} />
            ))}
            {filtered.length === 0 && <tr><td colSpan={visibleCols.length} className="empty" style={{ border: "1px solid hsl(var(--border))", padding: "12px 14px" }}>No rows match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ g, visibleCols, onRowClick }: { g: any; visibleCols: Column[]; onRowClick?: (row: Record<string, any>) => void }) {
  const [open, setOpen] = useState(true);
  const roll: string[] = [`${g.count} row(s)`];
  if (g.arr != null) roll.push(`Σ ${g.arrCol}: ${g.arr.toLocaleString()}`);
  if (g.nextRenewal) roll.push(`next ${g.renewCol}: ${new Date(g.nextRenewal).toLocaleDateString()}`);
  return (
    <>
      <tr className="dt-group" onClick={() => setOpen((o) => !o)}>
        <td colSpan={visibleCols.length} style={{ border: "1px solid hsl(var(--border))", padding: "10px 14px", background: "hsl(var(--muted)/0.04)" }}>
          <strong>{open ? "▾" : "▸"} {g.key}</strong> <span className="dt-roll">{roll.join(" · ")}</span>
        </td>
      </tr>
      {open && g.rows.slice(0, 300).map((r: any, i: number) => (
        <tr key={i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? "dt-click" : ""}>
          {visibleCols.map((c) => <td key={c.key} style={{ border: "1px solid hsl(var(--border))", padding: "10px 14px", textAlign: "left", verticalAlign: "top", lineHeight: 1.45 }}>{cellString(r[c.key]).slice(0, 200)}</td>)}
        </tr>
      ))}
    </>
  );
}
