import { supabase } from "./supabase";

// When VITE_LOCAL_API is set, function calls go to the local Node API
// (paz-portal/local-api) instead of remote Supabase Edge Functions.
const LOCAL_API = (import.meta.env.VITE_LOCAL_API as string | undefined) || "";

// Invoke a backend function — local API if configured, else Supabase edge fn.
async function invokeFn<T>(name: string, body: unknown): Promise<T> {
  if (LOCAL_API) {
    const res = await fetch(`${LOCAL_API}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${name} failed (${res.status})`);
    const data = await res.json();
    if (data?.error) throw new Error(data.error);
    return data as T;
  }
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) throw new Error(error.message || `${name} failed`);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export type SupportCase = {
  case_number?: string;
  account_name?: string;
  subject?: string;
  status?: string;
  description?: string;
  date_opened?: string;
  contact_email?: string;
  case_owner?: string;
};

export type EbstaContact = { name: string; title: string; score: number; lastModified?: string };
export type EbstaOpp = { name: string; stage: string; score: number; lastModified?: string };
export type EbstaEmail = {
  id: string;
  subject: string;
  from: string;
  to: string;
  date?: string;
  body: string;
};

export type EbstaData = {
  score: number | null;
  lastActivity: string | null;
  accountId: string | null;
  contacts: EbstaContact[];
  opportunities: EbstaOpp[];
  emails: EbstaEmail[];
} | null;

export type GongTranscript = {
  callId?: string;
  title?: string;
  parties?: string[];
  transcript?: Array<{ speakerId?: string; sentences?: Array<{ text?: string }> }>;
};

export type BriefcaseResult = {
  accountName: string;
  daysBack: number;
  supportCaseCount: number;
  gongCallCount: number;
  transcriptCount: number;
  gongHttpStatus: number | null;
  gongErrorMessage: string;
  autoDomains: string[];
  cases: SupportCase[];
  salesforceCases: SupportCase[];
  transcripts: GongTranscript[];
  ebstaData: EbstaData;
  error?: string;
};

// Collect all data for an account (Salesforce cases + EBSTA + Gong) via the
// existing gong-it edge function. This reuses the tangoAI platform's Salesforce
// connection (SF refresh token held in Supabase secrets).
export async function collectBriefcase(
  accountName: string,
  daysBack: number,
): Promise<BriefcaseResult> {
  // Normalize account name and detect domain before invoking backend
  const normalized = normalizeAccountName(accountName || "");
  const domain = extractDomainFromQuery(accountName || "");
  const { data, error } = await supabase.functions.invoke("gong-it", {
    body: { accountName: normalized, daysBack, domain },
  });
  if (error) throw new Error(error.message || "Data collection failed");
  return data as BriefcaseResult;
}

// Normalize account display names by stripping punctuation and common suffixes
export function normalizeAccountName(name: string): string {
  if (!name) return "";
  let n = String(name || "").trim();
  // If it's an email, extract local-part or domain depending on format
  if (n.includes("@")) {
    n = n.split("@")[0];
  }
  // Remove commas and dots
  n = n.replace(/[.,]/g, " ");
  // Remove common corporate suffixes
  n = n.replace(/\b(inc|inc\.|llc|corp|corporation|co\.|ltd|pty)\b/gi, "");
  // Collapse whitespace and trim
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

export function extractDomainFromQuery(query: string): string | null {
  if (!query) return null;
  const q = query.trim();
  // If it's an email, return the domain
  if (q.includes("@")) {
    const parts = q.split("@");
    return parts[1]?.toLowerCase() || null;
  }
  // If it looks like a domain (contains a dot and no spaces), return it
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(q)) return q.toLowerCase();
  return null;
}

export type ResearchResult = {
  answer: string;
  highlights: string[];
  error?: string;
};

// Ask Tango AI to research the collected briefcase (paz-research edge function,
// which calls the Claude API server-side).
export async function askTangoAI(
  question: string,
  context: BriefcaseResult,
): Promise<ResearchResult> {
  return invokeFn<ResearchResult>("paz-research", { question, context });
}

// ---- Account mapping (agentic Tango AI over all sources) ----

export type ToolLogEntry = { tool: string; input: any; summary: string };
export type MappingResult = {
  report: string;
  toolLog: ToolLogEntry[];
  iterations: number;
  model?: string;
  error?: string;
};

export async function runAccountMapping(input: {
  accountName?: string;
  question?: string;
}): Promise<MappingResult> {
  return invokeFn<MappingResult>("tango-agent", input);
}

// ---- Streaming account mapping (SSE) ----

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "tool_call"; tool: string; input: any }
  | { type: "tool_result"; tool: string; summary: string }
  | { type: "report"; report: string }
  | { type: "done"; iterations: number; model: string }
  | { type: "error"; message: string };

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const STREAM_URL = LOCAL_API
  ? `${LOCAL_API}/tango-agent`
  : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tango-agent`;

// Streams the agent's exploration. Calls onEvent for each SSE event.
export async function streamAccountMapping(
  input: { accountName?: string; question?: string },
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!LOCAL_API) {
    headers.Authorization = `Bearer ${ANON_KEY}`;
    headers.apikey = ANON_KEY;
  }
  const res = await fetch(STREAM_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...input, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload) as AgentEvent);
      } catch {
        // ignore malformed frame
      }
    }
  }
}

// ---- Cross-source query / report builder ----

export type Person = {
  name: string;
  email: string;
  domain: string | null;
  account: string | null;
  products: string[];
  arr: number | null;
  renewalDate: string | null;
  renewalOpp: string | null;
  contractEnd: string | null;
  titles: string;
  inSalesforce: boolean;
  inGong: boolean;
  inCases: boolean;
  ebstaScore: number | null;
  sourceCount: number;
  signals: string;
};

export type CrossSourceResult = {
  accountName: string;
  daysBack: number;
  salesforce: {
    contacts: any[];
    cases: any[];
    opportunities: any[];
    ebstaContacts: any[];
    error: string | null;
  };
  gong: { transcripts: { title: string; parties: string[]; excerpt: string }[]; status: number | null; error: string | null };
  supabase: { support_cases: any[]; error: string | null };
  crossReference: {
    domains: string[];
    detected?: { arr: string | null; renewal: string | null; contractEnd: string | null };
    people: Person[];
  };
  error?: string;
};

export async function runCrossSourceQuery(input: {
  accountName: string;
  daysBack: number;
  sources: { salesforce: boolean; gong: boolean; supabase: boolean };
}): Promise<CrossSourceResult> {
  return invokeFn<CrossSourceResult>("cross-source-query", input);
}

// ---- Keyword / mention search ----

export type KeywordHit = {
  source: "salesforce" | "gong" | "supabase";
  kind: string;
  title: string;
  account: string;
  snippet: string;
  confidence: number;
  date: string | null;
  arr?: number | null;
  renewalDate?: string | null;
  renewalOpp?: string | null;
  products?: string[];
};

export type KeywordResult = {
  accountName: string;
  keyword: string;
  daysBack: number;
  confidenceThreshold: number;
  totalMentions: number;
  bySource: { salesforce: number; gong: number; supabase: number };
  byKind: Record<string, number>;
  timeline: { period: string; count: number }[];
  hits: KeywordHit[];
  arrField?: string | null;
  gongScanned?: number;
  gongCapped?: boolean;
  errors: string[];
  error?: string;
};

// ---- Portfolio / book of business ----

export type PortfolioResult = {
  rows: Record<string, any>[];
  arrField?: string | null;
  contractField?: string | null;
  productSource?: string | null;
  keyword?: string;
  count: number;
  error?: string;
};

export async function runPortfolio(input: {
  nameFilter?: string;
  minArr?: number;
  renewalBefore?: string;
  keyword?: string;
  limit?: number;
}): Promise<PortfolioResult> {
  return invokeFn<PortfolioResult>("portfolio", input);
}

// ---- Investigate (unified query across everything) ----

export type InvestigateRow = {
  source: string; type: string; account: string; title: string; detail: string;
  date: string | null; owner: string; email: string; stage: string; status: string;
  amount: number | null; arr: number | null; renewalDate: string | null; products: string[]; id: string; raw: any;
};

export type InvestigateResult = {
  query: string;
  count: number;
  byType: Record<string, number>;
  accounts: number;
  rows: InvestigateRow[];
  errors: string[];
  error?: string;
};

export async function runInvestigate(input: {
  keyword?: string;
  accountName?: string;
  types?: string[];
  minArr?: number | null;
  maxArr?: number | null;
  renewalAfter?: string;
  renewalBefore?: string;
  sources: { salesforce: boolean; gong: boolean };
  perObject?: number;
}): Promise<InvestigateResult> {
  return invokeFn<InvestigateResult>("investigate", input);
}

export type GongStoreStatus = {
  count: number;
  latestCall: string | null;
  earliestCall: string | null;
  lastIngest: string | null;
  lastRun: { ran_at: string; ingested: number; scanned: number; window_days: number; ok: boolean } | null;
  error?: string;
};

export async function getGongStoreStatus(): Promise<GongStoreStatus> {
  return invokeFn<GongStoreStatus>("gong-store-status", {});
}

export async function runKeywordSearch(input: {
  accountName: string;
  products?: string[];
  keyword: string;
  daysBack: number;
  confidenceThreshold: number;
  sources: { salesforce: boolean; gong: boolean; supabase: boolean };
  gongMode?: "live" | "stored";
}): Promise<KeywordResult> {
  return invokeFn<KeywordResult>("keyword-search", input);
}
