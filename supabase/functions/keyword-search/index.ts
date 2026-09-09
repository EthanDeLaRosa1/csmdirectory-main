// Keyword / mention search across Salesforce + Gong + Supabase for one account.
// e.g. "how many times has Disney mentioned ServiceNow" → per-source counts,
// snippets, a confidence score per hit (thresholdable), and a monthly timeline.

import { getSalesforceAccessToken, runSoql, runSosl, enrichAccounts, getAccountProductsByName } from "../_shared/salesforce.ts";
import { gongAuthHeader, gongSearch, gongRecentTranscripts } from "../_shared/gong.ts";
import { querySupabase, getServiceClient } from "../_shared/db.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function esc(s: string): string {
  return s.replace(/'/g, "\\'");
}
function reEsc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function strip(html: string): string {
  return (html || "").replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim();
}

type Hit = {
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

// Find every keyword occurrence in text; boundary matches score 1.0, partial 0.6.
function findHits(
  text: string,
  keyword: string,
  meta: { source: Hit["source"]; kind: string; title: string; date: string | null; account?: string },
): Hit[] {
  const hits: Hit[] = [];
  if (!text || !keyword) return hits;
  const boundary = new RegExp(`\\b${reEsc(keyword)}\\b`, "gi");
  const loose = new RegExp(reEsc(keyword), "gi");

  const boundaryIdx = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(text)) !== null) boundaryIdx.add(m.index);

  let l: RegExpExecArray | null;
  while ((l = loose.exec(text)) !== null) {
    const isBoundary = boundaryIdx.has(l.index);
    const start = Math.max(0, l.index - 60);
    const end = Math.min(text.length, l.index + keyword.length + 60);
    hits.push({
      source: meta.source,
      kind: meta.kind,
      title: meta.title,
      account: meta.account || "",
      snippet: (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : ""),
      confidence: isBoundary ? 1.0 : 0.6,
      date: meta.date,
    });
  }
  return hits;
}

function monthOf(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const accountName = String(body.accountName || "").trim();
    const products: string[] = Array.isArray(body.products)
      ? body.products.map((p: any) => String(p).trim().toLowerCase()).filter(Boolean)
      : (body.product ? [String(body.product).trim().toLowerCase()] : []);
    const keyword = String(body.keyword || "").trim();
    const daysBack = Math.min(Number(body.daysBack) || 365, 1460);
    const threshold = Math.min(Math.max(Number(body.confidenceThreshold ?? 0.6), 0), 1);
    const sources = body.sources || { salesforce: true, gong: true, supabase: true };
    // gongMode: "live" (scan Gong API) or "stored" (query ingested gong_transcripts — instant, unlimited).
    const gongMode = String(body.gongMode || "live");
    if (!keyword) return json({ error: "keyword is required" }, 400);

    // Account-less = global keyword search across ALL data.
    const global = accountName.length === 0;
    const like = `%${esc(accountName)}%`;
    // SOQL/SOSL datetime literal — no quotes, no milliseconds.
    const cutoff = new Date(Date.now() - daysBack * 864e5).toISOString().replace(/\.\d{3}Z$/, "Z");
    const allHits: Hit[] = [];
    const errors: string[] = [];
    let gongScanned = 0;
    let gongCapped = false;

    // Live global Gong is the slow leg (full-window transcript scan). Kick it off
    // up front so it runs concurrently with the Salesforce + Supabase queries.
    // (Skipped entirely in stored mode.)
    const globalGongAuth = global && sources.gong && gongMode === "live" ? gongAuthHeader() : null;
    // 1500 calls keeps memory/CPU under Supabase's per-request limit even when
    // Salesforce runs alongside (5000 blew the resource budget → HTTP 546).
    const globalGongPromise = globalGongAuth
      ? gongRecentTranscripts(daysBack, globalGongAuth, 1500)
      : null;

    // --- Salesforce: Cases, Tasks, Emails ---
    let sfDomains = new Set<string>();
    const sfAuth = sources.salesforce ? await getSalesforceAccessToken() : null;
    if (sources.salesforce) {
      const auth = sfAuth!;
      if (auth.error) {
        errors.push(`Salesforce: ${auth.error}`);
      } else if (global) {
        // Full-text search across objects (SOSL) — the keyword IS the query.
        // Respect the lookback window (SOSL RETURNING supports per-object WHERE).
        const { records, error } = await runSosl(auth, keyword, [
          `Case(CaseNumber, Subject, Description, CreatedDate, Account.Name WHERE CreatedDate >= ${cutoff})`,
          `Task(Subject, Description, CreatedDate WHERE CreatedDate >= ${cutoff})`,
          `EmailMessage(Subject, TextBody, MessageDate WHERE MessageDate >= ${cutoff})`,
        ]);
        if (error) errors.push(`SF SOSL: ${error}`);
        for (const r of records) {
          const kind = r._type === "EmailMessage" ? "email" : r._type === "Task" ? "task" : "case";
          const text = `${r.Subject || ""} ${strip(r.Description || r.TextBody || "")}`;
          allHits.push(...findHits(text, keyword, {
            source: "salesforce", kind,
            title: r.CaseNumber || r.Subject || kind,
            account: r.Account?.Name || "",
            date: r.CreatedDate || r.MessageDate || null,
          }));
        }
      } else {
        const [cases, tasks, emails, contacts] = await Promise.all([
          runSoql(auth, `SELECT CaseNumber, Subject, Description, CreatedDate FROM Case WHERE Account.Name LIKE '${like}' ORDER BY CreatedDate DESC LIMIT 2000`),
          runSoql(auth, `SELECT Subject, Description, CreatedDate FROM Task WHERE AccountId IN (SELECT Id FROM Account WHERE Name LIKE '${like}') ORDER BY CreatedDate DESC LIMIT 500`),
          runSoql(auth, `SELECT Subject, TextBody, HtmlBody, MessageDate FROM EmailMessage WHERE RelatedToId IN (SELECT Id FROM Account WHERE Name LIKE '${like}') AND MessageDate >= ${cutoff} ORDER BY MessageDate DESC LIMIT 200`),
          runSoql(auth, `SELECT Email FROM Contact WHERE Account.Name LIKE '${like}' LIMIT 200`),
        ]);
        if (cases.error) errors.push(`SF Case: ${cases.error}`);
        if (tasks.error) errors.push(`SF Task: ${tasks.error}`);
        if (emails.error) errors.push(`SF Email: ${emails.error}`);

        for (const c of cases.records) {
          allHits.push(...findHits(`${c.Subject || ""} ${strip(c.Description || "")}`, keyword, {
            source: "salesforce", kind: "case", title: c.CaseNumber || "Case", account: accountName, date: c.CreatedDate || null,
          }));
        }
        for (const t of tasks.records) {
          allHits.push(...findHits(`${t.Subject || ""} ${strip(t.Description || "")}`, keyword, {
            source: "salesforce", kind: "task", title: t.Subject || "Task", account: accountName, date: t.CreatedDate || null,
          }));
        }
        for (const e of emails.records) {
          allHits.push(...findHits(`${e.Subject || ""} ${strip(e.TextBody || e.HtmlBody || "")}`, keyword, {
            source: "salesforce", kind: "email", title: e.Subject || "Email", account: accountName, date: e.MessageDate || null,
          }));
        }
        for (const c of contacts.records) {
          const d = (c.Email || "").toLowerCase().split("@")[1];
          if (d) sfDomains.add(d);
        }
      }
    }

    // --- Supabase support_cases ---
    if (sources.supabase) {
      let rows: any[] = [];
      let error: string | null = null;
      if (global) {
        // Search subject/description directly for the keyword.
        const kw = `%${keyword}%`;
        const { data, error: e } = await getServiceClient()
          .from("support_cases")
          .select("*")
          .or(`subject.ilike.${kw},description.ilike.${kw}`)
          .limit(300);
        rows = data || [];
        error = e?.message || null;
      } else {
        const r = await querySupabase("support_cases", [{ column: "account_name", op: "ilike", value: accountName }], 300);
        rows = r.rows;
        error = r.error;
      }
      if (error) errors.push(`Supabase: ${error}`);
      for (const c of rows) {
        const d = (c.contact_email || "").toLowerCase().split("@")[1];
        if (d) sfDomains.add(d);
        allHits.push(...findHits(`${c.subject || ""} ${strip(c.description || "")}`, keyword, {
          source: "supabase", kind: "support_case", title: c.case_number || c.subject || "Case",
          account: c.account_name || accountName, date: c.date_opened || null,
        }));
      }
    }

    // --- Gong transcripts ---
    if (sources.gong && gongMode === "stored") {
      // Query the ingested transcript store — instant, unlimited coverage.
      // Full-text search (GIN index) to filter candidate transcripts fast;
      // findHits then counts exact occurrences in the returned text.
      let q = getServiceClient()
        .from("gong_transcripts")
        .select("call_id,title,parties,domains,call_date,transcript_text")
        .gte("call_date", cutoff)
        .textSearch("transcript_text", keyword, { type: "plain", config: "english" })
        .limit(3000);
      if (!global) {
        const doms = Array.from(sfDomains).filter((d) => !["gmail.com", "yahoo.com", "outlook.com"].includes(d));
        if (doms.length) q = q.overlaps("domains", doms);
      }
      const { data, error } = await q;
      if (error) errors.push(`Stored Gong: ${error.message}`);
      const rows = data || [];
      gongScanned = rows.length;
      gongCapped = rows.length >= 3000;
      for (const r of rows) {
        allHits.push(...findHits(r.transcript_text || "", keyword, {
          source: "gong", kind: "call", title: r.title || "Call",
          account: global ? "" : accountName, date: r.call_date || null,
        }));
      }
    } else if (sources.gong) {
      if (global) {
        // Await the scan we started up front (ran concurrently with SF/Supabase).
        if (!globalGongPromise) {
          errors.push("Gong: not configured");
        } else {
          const gr: any = await globalGongPromise;
          const { transcripts, status, error } = gr;
          gongScanned = gr.scanned ?? transcripts.length;
          gongCapped = !!gr.capped;
          if (error && transcripts.length === 0) errors.push(`Gong (${status}): ${error}`);
          // Global Gong calls aren't tied to a single account.
          for (const t of transcripts) {
            allHits.push(...findHits(t.text, keyword, { source: "gong", kind: "call", title: t.title || "Call", date: null }));
          }
        }
      } else {
        const authHeader = gongAuthHeader();
        if (!authHeader) {
          errors.push("Gong: not configured");
        } else {
          const gr: any = await gongSearch(
            accountName,
            Array.from(sfDomains).filter((d) => !["gmail.com", "yahoo.com", "outlook.com"].includes(d)),
            daysBack,
            authHeader,
          );
          const { transcripts, status, error } = gr;
          if (error && transcripts.length === 0) errors.push(`Gong (${status}): ${error}`);
          for (const t of transcripts) {
            allHits.push(...findHits(t.text, keyword, { source: "gong", kind: "call", title: t.title || "Call", account: accountName, date: null }));
          }
        }
      }
    }

    // --- Apply confidence threshold + aggregate ---
    const kept = allHits.filter((h) => h.confidence >= threshold);

    // Scope to accounts that OWN any of the selected products / contract
    // applications. Drops hits with no account (ownership can't be confirmed)
    // and recomputes all downstream aggregates from the filtered set.
    if (products.length && sfAuth && !sfAuth.error) {
      const acctNames = [...new Set(kept.map((h) => h.account).filter(Boolean))];
      const { map: prodMap } = acctNames.length
        ? await getAccountProductsByName(sfAuth, acctNames)
        : { map: new Map<string, string[]>() };
      const want = new Set(products);
      const owns = (name: string) => (prodMap.get(String(name).toLowerCase()) || []).some((p) => want.has(p.toLowerCase()));
      for (let i = kept.length - 1; i >= 0; i--) {
        if (!kept[i].account || !owns(kept[i].account)) kept.splice(i, 1);
      }
    }

    const bySource = { salesforce: 0, gong: 0, supabase: 0 };
    const byKind: Record<string, number> = {};
    const timelineMap: Record<string, number> = {};
    for (const h of kept) {
      bySource[h.source] += 1;
      byKind[h.kind] = (byKind[h.kind] || 0) + 1;
      const mo = monthOf(h.date);
      if (mo) timelineMap[mo] = (timelineMap[mo] || 0) + 1;
    }
    const timeline = Object.entries(timelineMap)
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Sort hits: highest confidence, then longest snippet; cap returned snippets.
    const hits = kept
      .sort((a, b) => b.confidence - a.confidence || b.snippet.length - a.snippet.length)
      .slice(0, 200);

    // Enrich returned hits with ARR + next renewal (from Salesforce) by account.
    let arrField: string | null = null;
    if (sfAuth && !sfAuth.error) {
      const names = [...new Set(hits.map((h) => h.account).filter(Boolean))];
      if (names.length) {
        const { map, arrField: af } = await enrichAccounts(sfAuth, names);
        arrField = af;
        const lookup = (name: string) => {
          const lc = name.toLowerCase();
          if (map.has(lc)) return map.get(lc);
          for (const [k, v] of map) if (k.includes(lc) || lc.includes(k)) return v;
          return null;
        };
        for (const h of hits) {
          const e = h.account ? lookup(h.account) : null;
          h.arr = e?.arr ?? null;
          h.renewalDate = e?.renewalDate ?? null;
          h.renewalOpp = e?.renewalOpp ?? null;
          h.products = e?.products ?? [];
        }
      }
    }

    return json({
      accountName, products, keyword, daysBack, confidenceThreshold: threshold,
      totalMentions: kept.length,
      bySource, byKind, timeline, hits, arrField,
      gongScanned, gongCapped,
      errors,
    }, 200);
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error" }, 200);
  }
});
