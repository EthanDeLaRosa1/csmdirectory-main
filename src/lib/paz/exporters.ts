import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type Col = { key: string; label: string };

function cell(v: any): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Export rows (shaped by the given columns) to a real .xlsx workbook.
export function exportXlsx(rows: Record<string, any>[], columns: Col[], filename: string, sheetName = "Data") {
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => {
    const v = r[c.key];
    return typeof v === "number" ? v : cell(v);
  }));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  // Auto-ish column widths.
  ws["!cols"] = columns.map((c) => ({ wch: Math.min(40, Math.max(c.label.length + 2, 12)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

// Export multiple sheets in one workbook (for dashboard reports).
export function exportXlsxSheets(sheets: { name: string; rows: Record<string, any>[]; columns: Col[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const header = s.columns.map((c) => c.label);
    const body = s.rows.map((r) => s.columns.map((c) => {
      const v = r[c.key];
      return typeof v === "number" ? v : cell(v);
    }));
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

// Export rows to a PDF table (landscape when wide).
export function exportPdf(rows: Record<string, any>[], columns: Col[], filename: string, title?: string) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "pt" });
  let startY = 40;
  if (title) {
    doc.setFontSize(14);
    doc.text(title, 40, 30);
    doc.setFontSize(9);
    doc.text(`${rows.length} rows · ${new Date().toLocaleString()}`, 40, 46);
    startY = 60;
  }
  autoTable(doc, {
    startY,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => cell(r[c.key]).slice(0, 90))),
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [30, 45, 70] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
