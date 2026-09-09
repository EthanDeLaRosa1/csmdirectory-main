import { readPersisted } from "./persist";
import type { PortfolioResult, InvestigateResult, KeywordResult, CrossSourceResult, BriefcaseResult } from "./api";

export type Dataset = { id: string; label: string; headers: string[]; rows: string[][] };

function cell(v: any): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Convert an array of record objects into a headers + string-rows table.
function toTable(objs: Record<string, any>[], drop: string[] = []): { headers: string[]; rows: string[][] } {
  const headers = Array.from(new Set(objs.flatMap((o) => Object.keys(o)))).filter((h) => !drop.includes(h));
  const rows = objs.map((o) => headers.map((h) => cell(o[h])));
  return { headers, rows };
}

// Build the list of live datasets currently available (from persisted results).
export function availableDatasets(): Dataset[] {
  const out: Dataset[] = [];

  const portfolio = readPersisted<PortfolioResult>("portfolio.result");
  if (portfolio?.rows?.length) {
    const t = toTable(portfolio.rows);
    out.push({ id: "portfolio", label: `Portfolio (${portfolio.rows.length})`, ...t });
  }

  const explore = readPersisted<InvestigateResult>("explore.result");
  if (explore?.rows?.length) {
    const t = toTable(explore.rows, ["raw"]);
    out.push({ id: "explore", label: `Explore (${explore.rows.length})`, ...t });
  }

  const mentions = readPersisted<KeywordResult>("mentions.result");
  if (mentions?.hits?.length) {
    out.push({ id: "mentions", label: `Mentions hits (${mentions.hits.length})`, ...toTable(mentions.hits) });
  }
  if (mentions?.timeline?.length) {
    out.push({ id: "mentions-timeline", label: `Mentions timeline (${mentions.timeline.length})`, ...toTable(mentions.timeline) });
  }

  const report = readPersisted<CrossSourceResult>("report.result");
  if (report?.crossReference?.people?.length) {
    out.push({ id: "crossref", label: `Cross-Ref people (${report.crossReference.people.length})`, ...toTable(report.crossReference.people) });
  }
  if (report?.salesforce?.cases?.length) {
    out.push({ id: "crossref-cases", label: `Cross-Ref SF cases (${report.salesforce.cases.length})`, ...toTable(report.salesforce.cases) });
  }
  if (report?.salesforce?.opportunities?.length) {
    out.push({ id: "crossref-opps", label: `Cross-Ref SF opps (${report.salesforce.opportunities.length})`, ...toTable(report.salesforce.opportunities) });
  }
  if (report?.salesforce?.contacts?.length) {
    out.push({ id: "crossref-contacts", label: `Cross-Ref SF contacts (${report.salesforce.contacts.length})`, ...toTable(report.salesforce.contacts) });
  }
  if (report?.gong?.transcripts?.length) {
    out.push({ id: "crossref-gong", label: `Cross-Ref Gong calls (${report.gong.transcripts.length})`, ...toTable(report.gong.transcripts) });
  }
  if (report?.supabase?.support_cases?.length) {
    out.push({ id: "crossref-support", label: `Cross-Ref support cases (${report.supabase.support_cases.length})`, ...toTable(report.supabase.support_cases) });
  }

  const collect = readPersisted<BriefcaseResult>("collect.result");
  if (collect?.cases?.length) {
    out.push({ id: "collect-cases", label: `Collect cases (${collect.cases.length})`, ...toTable(collect.cases) });
  }
  if (collect?.transcripts?.length) {
    out.push({ id: "collect-gong", label: `Collect Gong (${collect.transcripts.length})`, ...toTable(collect.transcripts) });
  }
  if (collect?.ebstaData?.contacts?.length) {
    out.push({ id: "collect-ebsta", label: `Collect EBSTA contacts (${collect.ebstaData.contacts.length})`, ...toTable(collect.ebstaData.contacts) });
  }

  return out;
}
