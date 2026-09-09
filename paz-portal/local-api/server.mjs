// Paz local API — runs the edge-function logic on your machine so the portal
// works without deploying to Supabase. Reads secrets from repo-root paz.env.

import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { getSalesforceAccessToken, runSoql, runSosl, describeObject } from "./lib/salesforce.mjs";
import { gongAuthHeader, gongSearch, gongRecentTranscripts } from "./lib/gong.mjs";
import { querySupabase, getServiceClient, ALLOWED_TABLES, getAnthropicKey, AI_KEY_NAMES } from "./lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", "..", "paz.env") });

const MODEL = "claude-opus-4-8";
const PORT = Number(process.env.PAZ_LOCAL_PORT) || 8787;

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

const truncate = (s, n) => (s.length > n ? s.slice(0, n) + "…[truncated]" : s);
const strip = (html) => (html || "").replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/'/g, "\\'");
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function anthropic() {
  const key = getAnthropicKey();
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    gong: !!gongAuthHeader(),
    anthropic: !!getAnthropicKey(),
    salesforce: !!(process.env.SF_INSTANCE_URL && process.env.SF_REFRESH_TOKEN),
    supabase: !!(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
});

// ---------------- tango-agent ----------------

const SYSTEM_PROMPT = `You are Tango AI, an account-mapping and cross-source research agent for a Customer Success / Sales team.

You have live read access to three data sources via tools:
1. salesforce_soql — run read-only SOQL. Useful objects: Account, Contact, Opportunity, Case, Task, EmailMessage, and EBSTA scoring objects (Account_Ebsta_Score__c, Contact_Ebsta_Score__c, Opportunity_Ebsta_Score__c). Filter accounts with "WHERE Account.Name LIKE '%Name%'". If a field or object name errors, read the error and adjust.
2. gong_search — find and read Gong call transcripts for an account (by name + email domains).
3. supabase_query — read app tables (${ALLOWED_TABLES.join(", ")}). support_cases holds synced support cases.

Prioritise the LIVE sources — Salesforce and Gong — to gather first-hand data. Use supabase_query only as a supplement.

As you work, briefly narrate what you are about to check before each tool call (one short sentence).

Work efficiently: a few well-chosen queries per source. When you have enough, STOP calling tools and write the final report.

Final report format (markdown):
## <Account> — Account Map
**Summary:** 2-3 sentences on account health and key finding.
### Stakeholders
Table: Name | Title | Role/Signal | Sources (SF/Gong/Cases) | Engagement
### Opportunities & Cases
### Call & Engagement Themes
### Cross-Source Notes
Never invent data. If a source returns nothing, say so.`;

const tools = [
  { name: "salesforce_soql", description: "Run a read-only Salesforce SOQL SELECT query.", input_schema: { type: "object", additionalProperties: false, properties: { soql: { type: "string" } }, required: ["soql"] } },
  { name: "salesforce_describe", description: "List fields of a Salesforce sObject (metadata over memory).", input_schema: { type: "object", additionalProperties: false, properties: { object: { type: "string" } }, required: ["object"] } },
  { name: "gong_search", description: "Find Gong calls for an account and return transcript snippets.", input_schema: { type: "object", additionalProperties: false, properties: { accountName: { type: "string" }, domains: { type: "array", items: { type: "string" } }, daysBack: { type: "number" } }, required: ["accountName"] } },
  { name: "supabase_query", description: `Query an app table. Allowed: ${ALLOWED_TABLES.join(", ")}.`, input_schema: { type: "object", additionalProperties: false, properties: { table: { type: "string", enum: ALLOWED_TABLES }, filters: { type: "array", items: { type: "object", additionalProperties: false, properties: { column: { type: "string" }, op: { type: "string", enum: ["eq", "ilike", "gte", "lte", "gt", "lt", "neq"] }, value: { type: "string" } }, required: ["column", "op", "value"] } }, limit: { type: "number" } }, required: ["table"] } },
];

function makeExecutor() {
  let sfAuth = null;
  return async function execute(name, input) {
    if (name === "salesforce_soql") {
      if (!sfAuth) sfAuth = await getSalesforceAccessToken();
      const { records, error } = await runSoql(sfAuth, String(input.soql || ""));
      if (error) return { text: `ERROR: ${error}`, summary: `SOQL error: ${truncate(error, 80)}` };
      return { text: truncate(JSON.stringify(records.slice(0, 50)), 6000), summary: `${records.length} record(s)` };
    }
    if (name === "salesforce_describe") {
      if (!sfAuth) sfAuth = await getSalesforceAccessToken();
      const { fields, error } = await describeObject(sfAuth, String(input.object || ""));
      if (error) return { text: `ERROR: ${error}`, summary: `describe error` };
      return { text: truncate(JSON.stringify(fields), 6000), summary: `${input.object}: ${fields.length} field(s)` };
    }
    if (name === "gong_search") {
      const authHeader = gongAuthHeader();
      if (!authHeader) return { text: "ERROR: Gong not configured.", summary: "Gong not configured" };
      const domains = Array.isArray(input.domains) ? input.domains.map(String) : [];
      const daysBack = Math.min(Number(input.daysBack) || 365, 1460);
      const { transcripts, status, error } = await gongSearch(String(input.accountName || ""), domains, daysBack, authHeader);
      if (error && transcripts.length === 0) return { text: `ERROR (${status}): ${error}`, summary: `Gong error ${status}` };
      const slim = transcripts.map((t) => ({ title: t.title, parties: t.parties, excerpt: truncate(t.text, 800) }));
      return { text: truncate(JSON.stringify(slim), 8000), summary: `${transcripts.length} transcript(s)` };
    }
    if (name === "supabase_query") {
      const { rows, error } = await querySupabase(String(input.table || ""), input.filters || [], Number(input.limit) || 100);
      if (error) return { text: `ERROR: ${error}`, summary: `DB error` };
      return { text: truncate(JSON.stringify(rows), 6000), summary: `${input.table} → ${rows.length} row(s)` };
    }
    return { text: `ERROR: unknown tool ${name}`, summary: `unknown tool ${name}` };
  };
}

async function runAgent(client, task, emit) {
  const execute = makeExecutor();
  const messages = [{ role: "user", content: task }];
  const toolLog = [];
  let report = "";
  let iterations = 0;
  const MAX_ITERATIONS = 12;

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;
    emit({ type: "status", message: `Reasoning (step ${iterations})…` });

    const stream = client.messages.stream({
      model: MODEL, max_tokens: 4096, system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" }, tools, messages,
    });
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") emit({ type: "delta", text: ev.delta.text });
    }
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") { report = "Tango AI declined this request."; break; }

    messages.push({ role: "assistant", content: response.content });
    const textNow = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (textNow) report = textNow;

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const toolResults = [];
    for (const tu of toolUses) {
      emit({ type: "tool_call", tool: tu.name, input: tu.input });
      const { text, summary } = await execute(tu.name, tu.input);
      toolLog.push({ tool: tu.name, input: tu.input, summary });
      emit({ type: "tool_result", tool: tu.name, summary });
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: text });
    }
    messages.push({ role: "user", content: toolResults });
  }
  return { report, toolLog, iterations };
}

app.post("/tango-agent", async (req, res) => {
  try {
    const { accountName, question, stream: wantStream } = req.body || {};
    const task = String(question || (accountName ? `Map the account "${accountName}".` : "")).trim();
    if (!task) return res.json({ error: "accountName or question is required" });
    const client = anthropic();
    if (!client) return res.json({ error: `Tango AI key not found. Set one of: ${AI_KEY_NAMES.join(", ")}` });

    if (!wantStream) {
      const { report, toolLog, iterations } = await runAgent(client, task, () => {});
      return res.json({ report, toolLog, iterations, model: MODEL });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const emit = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    try {
      const { report, iterations } = await runAgent(client, task, emit);
      emit({ type: "report", report });
      emit({ type: "done", iterations, model: MODEL });
    } catch (err) {
      emit({ type: "error", message: err?.message || String(err) });
    } finally {
      res.end();
    }
  } catch (err) {
    res.json({ error: err?.message || String(err) });
  }
});

// ---------------- cross-source-query ----------------

const IGNORED_DOMAINS = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "salesforce.com", "copado.com"]);
const domainOf = (email) => {
  if (!email || !email.includes("@")) return null;
  const d = email.toLowerCase().split("@")[1];
  return d && !IGNORED_DOMAINS.has(d) ? d : null;
};

app.post("/cross-source-query", async (req, res) => {
  try {
    const body = req.body || {};
    const accountName = String(body.accountName || "").trim();
    const daysBack = Math.min(Number(body.daysBack) || 365, 1460);
    const sources = body.sources || { salesforce: true, gong: true, supabase: false };
    if (!accountName) return res.json({ error: "accountName is required" });
    const like = `%${esc(accountName)}%`;

    const sf = { contacts: [], cases: [], opportunities: [], ebstaContacts: [], error: null };
    if (sources.salesforce) {
      const auth = await getSalesforceAccessToken();
      if (auth.error) sf.error = auth.error;
      else {
        const [contacts, cases, opps, ebsta] = await Promise.all([
          runSoql(auth, `SELECT Id, Name, Title, Email, Account.Name FROM Contact WHERE Account.Name LIKE '${like}' LIMIT 100`),
          runSoql(auth, `SELECT Id, CaseNumber, Subject, Status, ContactEmail, Owner.Name, CreatedDate FROM Case WHERE Account.Name LIKE '${like}' ORDER BY CreatedDate DESC LIMIT 100`),
          runSoql(auth, `SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunity WHERE Account.Name LIKE '${like}' ORDER BY CloseDate DESC LIMIT 50`),
          runSoql(auth, `SELECT Id, Ebsta_Score__c, Contact__r.Name, Contact__r.Title, Contact__r.Email FROM Contact_Ebsta_Score__c WHERE Contact__r.Account.Name LIKE '${like}' ORDER BY Ebsta_Score__c DESC LIMIT 50`),
        ]);
        sf.contacts = contacts.records; sf.cases = cases.records;
        sf.opportunities = opps.records; sf.ebstaContacts = ebsta.records;
        sf.error = contacts.error || cases.error || opps.error || ebsta.error || null;
      }
    }

    const db = { support_cases: [], error: null };
    if (sources.supabase) {
      const { rows, error } = await querySupabase("support_cases", [{ column: "account_name", op: "ilike", value: accountName }], 200);
      db.support_cases = rows; db.error = error;
    }

    const domains = new Set();
    for (const c of sf.contacts) { const d = domainOf(c.Email); if (d) domains.add(d); }
    for (const c of db.support_cases) { const d = domainOf(c.contact_email); if (d) domains.add(d); }

    const gong = { transcripts: [], status: null, error: null };
    if (sources.gong) {
      const authHeader = gongAuthHeader();
      if (!authHeader) gong.error = "Gong not configured";
      else {
        const r = await gongSearch(accountName, Array.from(domains), daysBack, authHeader);
        gong.transcripts = r.transcripts.map((t) => ({ title: t.title, parties: t.parties, excerpt: t.text.slice(0, 600) }));
        gong.status = r.status; gong.error = r.error || null;
      }
    }

    const people = new Map();
    const keyOf = (email, name) => (email && email.toLowerCase()) || (name && `name:${name.toLowerCase()}`) || null;
    function upsert(email, name) {
      const key = keyOf(email, name);
      if (!key) return null;
      let p = people.get(key);
      if (!p) {
        p = { name: name || email || "Unknown", email: (email || "").toLowerCase(), domain: domainOf(email), titles: new Set(), inSalesforce: false, inGong: false, inCases: false, ebstaScore: null, signals: [] };
        people.set(key, p);
      }
      if (name && (!p.name || p.name === p.email)) p.name = name;
      if (email && !p.email) p.email = email.toLowerCase();
      return p;
    }
    for (const c of sf.contacts) { const p = upsert(c.Email, c.Name); if (p) { p.inSalesforce = true; if (c.Title) p.titles.add(c.Title); } }
    for (const e of sf.ebstaContacts) { const p = upsert(e.Contact__r?.Email, e.Contact__r?.Name); if (p) { p.inSalesforce = true; p.ebstaScore = e.Ebsta_Score__c ?? p.ebstaScore; if (e.Contact__r?.Title) p.titles.add(e.Contact__r.Title); } }
    for (const c of db.support_cases) { const p = upsert(c.contact_email, undefined); if (p) { p.inCases = true; p.signals.push(`case: ${c.subject || c.case_number || "?"}`); } }
    for (const t of gong.transcripts) { for (const email of t.parties || []) { const p = upsert(email, undefined); if (p) p.inGong = true; } }

    const crossReference = {
      domains: Array.from(domains),
      people: Array.from(people.values()).map((p) => ({
        name: p.name, email: p.email, domain: p.domain, titles: Array.from(p.titles),
        inSalesforce: p.inSalesforce, inGong: p.inGong, inCases: p.inCases, ebstaScore: p.ebstaScore,
        sourceCount: [p.inSalesforce, p.inGong, p.inCases].filter(Boolean).length, signals: p.signals.slice(0, 5),
      })).sort((a, b) => b.sourceCount - a.sourceCount || (b.ebstaScore ?? -1) - (a.ebstaScore ?? -1)),
    };

    res.json({ accountName, daysBack, salesforce: sf, gong, supabase: db, crossReference });
  } catch (err) {
    res.json({ error: err?.message || String(err) });
  }
});

// ---------------- keyword-search ----------------

function findHits(text, keyword, meta) {
  const hits = [];
  if (!text || !keyword) return hits;
  const boundary = new RegExp(`\\b${reEsc(keyword)}\\b`, "gi");
  const loose = new RegExp(reEsc(keyword), "gi");
  const boundaryIdx = new Set();
  let m;
  while ((m = boundary.exec(text)) !== null) boundaryIdx.add(m.index);
  let l;
  while ((l = loose.exec(text)) !== null) {
    const isBoundary = boundaryIdx.has(l.index);
    const start = Math.max(0, l.index - 60);
    const end = Math.min(text.length, l.index + keyword.length + 60);
    hits.push({
      source: meta.source, kind: meta.kind, title: meta.title,
      snippet: (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : ""),
      confidence: isBoundary ? 1.0 : 0.6, date: meta.date,
    });
  }
  return hits;
}
const monthOf = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

app.post("/keyword-search", async (req, res) => {
  try {
    const body = req.body || {};
    const accountName = String(body.accountName || "").trim();
    const keyword = String(body.keyword || "").trim();
    const daysBack = Math.min(Number(body.daysBack) || 365, 1460);
    const threshold = Math.min(Math.max(Number(body.confidenceThreshold ?? 0.6), 0), 1);
    const sources = body.sources || { salesforce: true, gong: true, supabase: false };
    if (!keyword) return res.json({ error: "keyword is required" });

    const global = accountName.length === 0;
    const like = `%${esc(accountName)}%`;
    const cutoff = new Date(Date.now() - daysBack * 864e5).toISOString();
    const allHits = [];
    const errors = [];
    const domains = new Set();

    if (sources.salesforce) {
      const auth = await getSalesforceAccessToken();
      if (auth.error) errors.push(`Salesforce: ${auth.error}`);
      else if (global) {
        const { records, error } = await runSosl(auth, keyword, [
          "Case(CaseNumber, Subject, Description, CreatedDate)",
          "Task(Subject, Description, CreatedDate)",
          "EmailMessage(Subject, TextBody, MessageDate)",
        ]);
        if (error) errors.push(`SF SOSL: ${error}`);
        for (const r of records) {
          const kind = r._type === "EmailMessage" ? "email" : r._type === "Task" ? "task" : "case";
          const text = `${r.Subject || ""} ${strip(r.Description || r.TextBody || "")}`;
          allHits.push(...findHits(text, keyword, { source: "salesforce", kind, title: r.CaseNumber || r.Subject || kind, date: r.CreatedDate || r.MessageDate || null }));
        }
      } else {
        const [cases, tasks, emails, contacts] = await Promise.all([
          runSoql(auth, `SELECT CaseNumber, Subject, Description, CreatedDate FROM Case WHERE Account.Name LIKE '${like}' ORDER BY CreatedDate DESC LIMIT 200`),
          runSoql(auth, `SELECT Subject, Description, CreatedDate FROM Task WHERE AccountId IN (SELECT Id FROM Account WHERE Name LIKE '${like}') ORDER BY CreatedDate DESC LIMIT 200`),
          runSoql(auth, `SELECT Subject, TextBody, HtmlBody, MessageDate FROM EmailMessage WHERE RelatedToId IN (SELECT Id FROM Account WHERE Name LIKE '${like}') AND MessageDate >= ${cutoff} ORDER BY MessageDate DESC LIMIT 200`),
          runSoql(auth, `SELECT Email FROM Contact WHERE Account.Name LIKE '${like}' LIMIT 200`),
        ]);
        if (cases.error) errors.push(`SF Case: ${cases.error}`);
        if (tasks.error) errors.push(`SF Task: ${tasks.error}`);
        if (emails.error) errors.push(`SF Email: ${emails.error}`);
        for (const c of cases.records) allHits.push(...findHits(`${c.Subject || ""} ${strip(c.Description)}`, keyword, { source: "salesforce", kind: "case", title: c.CaseNumber || "Case", date: c.CreatedDate || null }));
        for (const t of tasks.records) allHits.push(...findHits(`${t.Subject || ""} ${strip(t.Description)}`, keyword, { source: "salesforce", kind: "task", title: t.Subject || "Task", date: t.CreatedDate || null }));
        for (const e of emails.records) allHits.push(...findHits(`${e.Subject || ""} ${strip(e.TextBody || e.HtmlBody)}`, keyword, { source: "salesforce", kind: "email", title: e.Subject || "Email", date: e.MessageDate || null }));
        for (const c of contacts.records) { const d = (c.Email || "").toLowerCase().split("@")[1]; if (d) domains.add(d); }
      }
    }

    if (sources.supabase) {
      let rows = [], error = null;
      if (global) {
        const kw = `%${keyword}%`;
        const { data, error: e } = await getServiceClient().from("support_cases").select("*").or(`subject.ilike.${kw},description.ilike.${kw}`).limit(300);
        rows = data || []; error = e?.message || null;
      } else {
        const r = await querySupabase("support_cases", [{ column: "account_name", op: "ilike", value: accountName }], 300);
        rows = r.rows; error = r.error;
      }
      if (error) errors.push(`Supabase: ${error}`);
      for (const c of rows) {
        const d = (c.contact_email || "").toLowerCase().split("@")[1]; if (d) domains.add(d);
        allHits.push(...findHits(`${c.subject || ""} ${strip(c.description)}`, keyword, { source: "supabase", kind: "support_case", title: c.case_number || c.subject || "Case", date: c.date_opened || null }));
      }
    }

    if (sources.gong) {
      const authHeader = gongAuthHeader();
      if (!authHeader) errors.push("Gong: not configured");
      else {
        const { transcripts, status, error } = global
          ? await gongRecentTranscripts(daysBack, authHeader, 150)
          : await gongSearch(accountName, Array.from(domains).filter((d) => !["gmail.com", "yahoo.com", "outlook.com"].includes(d)), daysBack, authHeader);
        if (error && transcripts.length === 0) errors.push(`Gong (${status}): ${error}`);
        for (const t of transcripts) allHits.push(...findHits(t.text, keyword, { source: "gong", kind: "call", title: t.title || "Call", date: null }));
      }
    }

    const kept = allHits.filter((h) => h.confidence >= threshold);
    const bySource = { salesforce: 0, gong: 0, supabase: 0 };
    const byKind = {};
    const timelineMap = {};
    for (const h of kept) {
      bySource[h.source] += 1;
      byKind[h.kind] = (byKind[h.kind] || 0) + 1;
      const mo = monthOf(h.date);
      if (mo) timelineMap[mo] = (timelineMap[mo] || 0) + 1;
    }
    const timeline = Object.entries(timelineMap).map(([period, count]) => ({ period, count })).sort((a, b) => a.period.localeCompare(b.period));
    const hits = kept.sort((a, b) => b.confidence - a.confidence || b.snippet.length - a.snippet.length).slice(0, 200);

    res.json({ accountName, keyword, daysBack, confidenceThreshold: threshold, totalMentions: kept.length, bySource, byKind, timeline, hits, errors });
  } catch (err) {
    res.json({ error: err?.message || String(err) });
  }
});

// ---------------- paz-research ----------------

app.post("/paz-research", async (req, res) => {
  try {
    const { question, context } = req.body || {};
    if (!question) return res.json({ error: "question is required" });
    if (!context) return res.json({ error: "context is required" });
    const client = anthropic();
    if (!client) return res.json({ answer: `Tango AI not configured. Set one of: ${AI_KEY_NAMES.join(", ")}.`, highlights: [] });

    const buildContext = (ctx) => {
      const parts = [`Account: ${ctx?.accountName ?? "unknown"}`];
      for (const c of (ctx?.cases || []).slice(0, 25)) parts.push(`- [${c.case_number ?? "?"}] ${c.status ?? "?"} — ${truncate(c.subject ?? "", 120)} :: ${truncate(c.description ?? "", 300)}`);
      const eb = ctx?.ebstaData;
      if (eb) {
        parts.push(`EBSTA score ${eb.score ?? "n/a"}`);
        for (const c of (eb.contacts || []).slice(0, 10)) parts.push(`- contact: ${c.name} (${c.title}) ${c.score}`);
      }
      for (const t of (ctx?.transcripts || []).slice(0, 12)) {
        const text = Array.isArray(t.transcript) ? t.transcript.flatMap((s) => (s.sentences || []).map((x) => x.text || "")).join(" ") : "";
        parts.push(`- call ${truncate(t.title || "", 80)}: ${truncate(text, 500)}`);
      }
      return parts.join("\n");
    };

    const msg = await client.messages.create({
      model: MODEL, max_tokens: 2048,
      system: "You are Tango AI. Answer using ONLY the provided briefcase. Reply as JSON {answer, highlights}.",
      output_config: { format: { type: "json_schema", schema: { type: "object", additionalProperties: false, properties: { answer: { type: "string" }, highlights: { type: "array", items: { type: "string" } } }, required: ["answer", "highlights"] } } },
      messages: [{ role: "user", content: `BRIEFCASE:\n${buildContext(context)}\n\nQUESTION: ${question}` }],
    });
    if (msg.stop_reason === "refusal") return res.json({ error: "Tango AI declined." });
    const raw = msg.content.find((b) => b.type === "text")?.text ?? "{}";
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { answer: raw, highlights: [] }; }
    res.json({ answer: parsed.answer ?? "No answer.", highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [] });
  } catch (err) {
    res.json({ error: err?.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Paz local API → http://localhost:${PORT}`);
  console.log(`  health: http://localhost:${PORT}/health\n`);
});
