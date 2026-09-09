// Investigate — one query across everything. Fans out to Salesforce (Accounts,
// Contacts, Cases, Opportunities via SOSL full-text) + stored Gong transcripts,
// normalizes to a unified row shape, enriches with ARR/renewal, and returns a
// flat table the UI can filter / sort / group / export / drill into.

import { getSalesforceAccessToken, runSosl, describeObject, enrichAccounts } from "../_shared/salesforce.ts";
import { getServiceClient } from "../_shared/db.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });
}
const truncate = (s: string, n: number) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");
const strip = (h: string) => (h || "").replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim();

type Row = {
  source: string; type: string; account: string; title: string; detail: string;
  date: string | null; owner: string; email: string; stage: string; status: string;
  amount: number | null; arr: number | null; renewalDate: string | null; id: string; raw: any;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const keyword = String(body.keyword || body.query || "").trim();
    const accountName = String(body.accountName || "").trim();
    const sources = body.sources || { salesforce: true, gong: true };
    const allTypes = ["account", "contact", "case", "opportunity", "call"];
    const types: string[] = Array.isArray(body.types) && body.types.length ? body.types : allTypes;
    const minArr = body.minArr != null && body.minArr !== "" ? Number(body.minArr) : null;
    const maxArr = body.maxArr != null && body.maxArr !== "" ? Number(body.maxArr) : null;
    const renewalAfter = String(body.renewalAfter || "").trim();
    const renewalBefore = String(body.renewalBefore || "").trim();
    const perObject = Math.min(Math.max(Number(body.perObject) || 300, 10), 1000);

    // SOSL needs a search term — use the keyword, else the account name.
    const findTerm = (keyword || accountName).trim();
    if (findTerm.length < 2) return json({ error: "Enter a keyword or account name (min 2 chars)", rows: [] }, 400);
    const esc = (s: string) => s.replace(/'/g, "\\'");
    const acctWhere = accountName ? ` WHERE Account.Name LIKE '%${esc(accountName)}%'` : "";
    const acctWhereSelf = accountName ? ` WHERE Name LIKE '%${esc(accountName)}%'` : "";

    const rows: Row[] = [];
    const errors: string[] = [];
    const accountNames = new Set<string>();

    // ---- Salesforce (SOSL full-text across objects) ----
    let auth: any = null;
    const wantSf = sources.salesforce && types.some((t) => t !== "call");
    if (wantSf) {
      auth = await getSalesforceAccessToken();
      if (auth.error) {
        errors.push(`Salesforce: ${auth.error}`);
      } else {
        const { fields } = await describeObject(auth, "Account");
        const isNum = (f: any) => ["currency", "double", "int", "percent"].includes((f.type || "").toLowerCase());
        const arrF = fields.find((f) => /arr|recurring/i.test(f.name) && isNum(f)) || fields.find((f) => /^annualrevenue$/i.test(f.name));

        // Only request the object types the user selected; scope by account name if given.
        const returning: string[] = [];
        if (types.includes("account")) returning.push(`Account(Id, Name, Industry, Owner.Name${arrF ? `, ${arrF.name}` : ""}${acctWhereSelf} LIMIT ${perObject})`);
        if (types.includes("contact")) returning.push(`Contact(Id, Name, Title, Email, Account.Name${acctWhere} LIMIT ${perObject})`);
        if (types.includes("case")) returning.push(`Case(Id, CaseNumber, Subject, Status, CreatedDate, Account.Name${acctWhere} LIMIT ${perObject})`);
        if (types.includes("opportunity")) returning.push(`Opportunity(Id, Name, StageName, Amount, CloseDate, Account.Name${acctWhere} LIMIT ${perObject})`);

        const { records, error } = returning.length ? await runSosl(auth, findTerm, returning) : { records: [], error: undefined };
        if (error) errors.push(`SF SOSL: ${error}`);

        for (const r of records) {
          const acct = r.Account?.Name || (r._type === "Account" ? r.Name : "") || "";
          if (acct) accountNames.add(acct);
          const base = { source: "salesforce", account: acct, owner: r.Owner?.Name || "", email: r.Email || "", stage: r.StageName || "", status: r.Status || "", amount: r.Amount ?? null, arr: r._type === "Account" && arrF ? (r[arrF.name] ?? null) : null, renewalDate: null as string | null, products: [] as string[], id: r.Id || "", raw: r };
          if (r._type === "Account") {
            rows.push({ ...base, type: "account", title: r.Name || "Account", detail: r.Industry || "", date: null });
          } else if (r._type === "Contact") {
            rows.push({ ...base, type: "contact", title: r.Name || "Contact", detail: r.Title || "", date: null });
          } else if (r._type === "Case") {
            rows.push({ ...base, type: "case", title: r.CaseNumber || "Case", detail: truncate(strip(r.Subject), 200), date: r.CreatedDate || null });
          } else if (r._type === "Opportunity") {
            rows.push({ ...base, type: "opportunity", title: r.Name || "Opp", detail: r.StageName || "", date: r.CloseDate || null });
          }
        }
      }
    }

    // ---- Gong (stored transcripts, full-text) ----
    if (sources.gong && types.includes("call")) {
      try {
        const { data, error } = await getServiceClient()
          .from("gong_transcripts")
          .select("call_id,title,domains,call_date,transcript_text")
          .textSearch("transcript_text", findTerm, { type: "plain", config: "english" })
          .limit(perObject);
        if (error) errors.push(`Gong store: ${error.message}`);
        for (const t of data || []) {
          const idx = (t.transcript_text || "").toLowerCase().indexOf(findTerm.toLowerCase());
          const snippet = idx >= 0 ? truncate((t.transcript_text as string).slice(Math.max(0, idx - 60), idx + 120), 200) : "";
          rows.push({
            source: "gong", type: "call", account: "", title: t.title || "Call",
            detail: snippet, date: t.call_date || null, owner: "", email: "", stage: "", status: "",
            amount: null, arr: null, renewalDate: null, products: [], id: t.call_id, raw: { domains: t.domains },
          });
        }
      } catch (e: any) {
        errors.push(`Gong store: ${e?.message || e}`);
      }
    }

    // ---- Enrich rows with ARR / renewal by account ----
    if (auth && !auth.error && accountNames.size) {
      const { map } = await enrichAccounts(auth, Array.from(accountNames));
      const lookup = (name: string) => {
        const lc = name.toLowerCase();
        if (map.has(lc)) return map.get(lc);
        for (const [k, v] of map) if (k.includes(lc) || lc.includes(k)) return v;
        return null;
      };
      for (const row of rows) {
        if (!row.account) continue;
        const e = lookup(row.account);
        if (e) { if (row.arr == null) row.arr = e.arr ?? null; row.renewalDate = e.renewalDate ?? null; row.products = e.products ?? []; }
      }
    }

    // Structured post-filters (ARR range, renewal window). A row with no value
    // for a filtered field is excluded when that filter is active.
    let out = rows;
    if (minArr != null) out = out.filter((r) => r.arr != null && r.arr >= minArr);
    if (maxArr != null) out = out.filter((r) => r.arr != null && r.arr <= maxArr);
    if (renewalAfter) out = out.filter((r) => r.renewalDate && r.renewalDate >= renewalAfter);
    if (renewalBefore) out = out.filter((r) => r.renewalDate && r.renewalDate <= renewalBefore);

    // Sort: accounts/opps first, then by date desc.
    const typeRank: Record<string, number> = { account: 0, opportunity: 1, contact: 2, case: 3, call: 4 };
    out.sort((a, b) => (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9) ||
      (new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));

    const byType: Record<string, number> = {};
    const acctSet = new Set<string>();
    for (const r of out) { byType[r.type] = (byType[r.type] || 0) + 1; if (r.account) acctSet.add(r.account); }

    return json({ query: findTerm, count: out.length, byType, accounts: acctSet.size, rows: out, errors }, 200);
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error", rows: [] }, 200);
  }
});
