// Cross-source query — deterministic pull from Salesforce + Gong + Supabase for
// one account, plus a joined "people" cross-reference. Powers the report builder.

import { getSalesforceAccessToken, runSoql, describeObject, getAccountProductsByName } from "../_shared/salesforce.ts";
import { gongAuthHeader, gongSearch } from "../_shared/gong.ts";
import { querySupabase } from "../_shared/db.ts";

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

const IGNORED_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "salesforce.com", "copado.com",
]);

function esc(s: string): string {
  return s.replace(/'/g, "\\'");
}

function domainOf(email?: string): string | null {
  if (!email || !email.includes("@")) return null;
  const d = email.toLowerCase().split("@")[1];
  return d && !IGNORED_DOMAINS.has(d) ? d : null;
}

// Auto-detect ARR / renewal / contract-end fields on Account (metadata over
// memory), then fetch them for the matching accounts.
async function fetchAccounts(auth: any, like: string) {
  const { fields } = await describeObject(auth, "Account");
  const isNum = (f: any) => ["currency", "double", "int", "percent"].includes((f.type || "").toLowerCase());
  const isDate = (f: any) => ["date", "datetime"].includes((f.type || "").toLowerCase());
  const arrF = fields.find((f) => /arr|recurring/i.test(f.name) && isNum(f)) || fields.find((f) => /^annualrevenue$/i.test(f.name));
  const renewF = fields.find((f) => /(renew|expir|subscription.?end|term.?end)/i.test(f.name) && isDate(f));
  // Require "contract" to avoid false positives like CI_CD_..._End_Date.
  const contractF = fields.find((f) => /(contract.?end|end.?of.?contract)/i.test(f.name) && isDate(f));
  const sel = [...new Set(["Id", "Name", arrF?.name, renewF?.name, contractF?.name].filter(Boolean))] as string[];
  const { records, error } = await runSoql(auth, `SELECT ${sel.join(", ")} FROM Account WHERE Name LIKE '${like}' LIMIT 50`);
  const accounts = records.map((r: any) => ({
    name: r.Name,
    arr: arrF ? (r[arrF.name] ?? null) : null,
    renewalDate: renewF ? (r[renewF.name] ?? null) : null,
    contractEnd: contractF ? (r[contractF.name] ?? null) : null,
    products: [] as string[],
  }));
  return { accounts, detected: { arr: arrF?.name || null, renewal: renewF?.name || null, contractEnd: contractF?.name || null }, error };
}

// Derive the next renewal date per account from its Opportunities.
// Prefers renewal-type opps, then the soonest future close date, then latest.
function renewalFromOpps(opps: any[]): Map<string, { renewalDate: string; renewalOpp: string; stage: string }> {
  const byAcct = new Map<string, any[]>();
  for (const o of opps) {
    const acct = (o.Account?.Name || "").toLowerCase();
    if (!acct) continue;
    if (!byAcct.has(acct)) byAcct.set(acct, []);
    byAcct.get(acct)!.push(o);
  }
  const now = Date.now();
  const out = new Map<string, { renewalDate: string; renewalOpp: string; stage: string }>();
  for (const [acct, list] of byAcct) {
    const renewals = list.filter((o) => /renew/i.test(o.Type || "") || /renew/i.test(o.Name || ""));
    const open = list.filter((o) => o.IsClosed === false);
    const pool = renewals.length ? renewals : open.length ? open : list;
    const cands = pool
      .map((o) => ({ ...o, t: new Date(o.CloseDate).getTime() }))
      .filter((o) => !isNaN(o.t));
    if (cands.length === 0) continue;
    const future = cands.filter((o) => o.t >= now).sort((a, b) => a.t - b.t);
    const pick = future[0] || cands.sort((a, b) => b.t - a.t)[0];
    if (pick) out.set(acct, { renewalDate: pick.CloseDate, renewalOpp: pick.Name, stage: pick.StageName });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const accountName = String(body.accountName || "").trim();
    const daysBack = Math.min(Number(body.daysBack) || 365, 1460);
    const sources = body.sources || { salesforce: true, gong: true, supabase: true };
    if (!accountName) return json({ error: "accountName is required" }, 400);

    const like = `%${esc(accountName)}%`;

    // --- Salesforce + Supabase run concurrently (independent) ---
    const sf: any = { accounts: [], detected: {}, contacts: [], cases: [], opportunities: [], ebstaContacts: [], error: null };
    const db: any = { support_cases: [], error: null };

    await Promise.all([
      (async () => {
        if (!sources.salesforce) return;
        const auth = await getSalesforceAccessToken();
        if (auth.error) { sf.error = auth.error; return; }
        // 5 SOQL/SOSL queries fired concurrently (fastest under SF's limits).
        const [accts, contacts, cases, opps, ebsta] = await Promise.all([
          fetchAccounts(auth, like),
          runSoql(auth, `SELECT Id, Name, Title, Email, Account.Name FROM Contact WHERE Account.Name LIKE '${like}' LIMIT 100`),
          runSoql(auth, `SELECT Id, CaseNumber, Subject, Status, IsClosed, ContactEmail, Owner.Name, CreatedDate FROM Case WHERE Account.Name LIKE '${like}' ORDER BY CreatedDate DESC LIMIT 2000`),
          runSoql(auth, `SELECT Id, Name, StageName, Amount, CloseDate, Type, IsClosed, Account.Name FROM Opportunity WHERE Account.Name LIKE '${like}' ORDER BY CloseDate DESC LIMIT 100`),
          runSoql(auth, `SELECT Id, Ebsta_Score__c, Contact__r.Name, Contact__r.Title, Contact__r.Email FROM Contact_Ebsta_Score__c WHERE Contact__r.Account.Name LIKE '${like}' ORDER BY Ebsta_Score__c DESC LIMIT 50`),
        ]);
        sf.accounts = accts.accounts;
        // Owned products per account (auto-detected: Assets → won opps → custom field).
        if (sf.accounts.length) {
          const { map: prodMap, source } = await getAccountProductsByName(auth, sf.accounts.map((a: any) => a.name));
          for (const a of sf.accounts) a.products = prodMap.get(String(a.name).toLowerCase()) || [];
          sf.productSource = source;
        }
        sf.detected = accts.detected;
        sf.contacts = contacts.records;
        sf.cases = cases.records;
        sf.opportunities = opps.records;
        sf.ebstaContacts = ebsta.records;
        sf.error = contacts.error || cases.error || opps.error || ebsta.error || null;
      })(),
      (async () => {
        if (!sources.supabase) return;
        const { rows, error } = await querySupabase(
          "support_cases",
          [{ column: "account_name", op: "ilike", value: accountName }],
          200,
        );
        db.support_cases = rows;
        db.error = error;
      })(),
    ]);

    // --- Derive domains for Gong matching ---
    const domains = new Set<string>();
    for (const c of sf.contacts) { const d = domainOf(c.Email); if (d) domains.add(d); }
    for (const c of db.support_cases) { const d = domainOf(c.contact_email); if (d) domains.add(d); }

    // --- Gong ---
    const gong: any = { transcripts: [], status: null, error: null };
    if (sources.gong) {
      const authHeader = gongAuthHeader();
      if (!authHeader) {
        gong.error = "Gong not configured";
      } else {
        const r = await gongSearch(accountName, Array.from(domains), daysBack, authHeader);
        gong.transcripts = r.transcripts.map((t) => ({ title: t.title, parties: t.parties, excerpt: t.text.slice(0, 600) }));
        gong.status = r.status;
        gong.error = r.error || null;
      }
    }

    // --- Cross-reference people by email / name across sources ---
    type Person = {
      name: string; email: string; domain: string | null; account: string | null;
      titles: Set<string>; inSalesforce: boolean; inGong: boolean; inCases: boolean;
      ebstaScore: number | null; signals: string[];
    };
    const people = new Map<string, Person>();
    const keyOf = (email?: string, name?: string) =>
      (email && email.toLowerCase()) || (name && `name:${name.toLowerCase()}`) || null;

    function upsert(email: string | undefined, name: string | undefined, account?: string): Person | null {
      const key = keyOf(email, name);
      if (!key) return null;
      let p = people.get(key);
      if (!p) {
        p = {
          name: name || email || "Unknown", email: (email || "").toLowerCase(),
          domain: domainOf(email), account: account || null, titles: new Set(), inSalesforce: false,
          inGong: false, inCases: false, ebstaScore: null, signals: [],
        };
        people.set(key, p);
      }
      if (name && (!p.name || p.name === p.email)) p.name = name;
      if (email && !p.email) p.email = email.toLowerCase();
      if (account && !p.account) p.account = account;
      return p;
    }

    for (const c of sf.contacts) {
      const p = upsert(c.Email, c.Name, c.Account?.Name);
      if (p) { p.inSalesforce = true; if (c.Title) p.titles.add(c.Title); }
    }
    for (const e of sf.ebstaContacts) {
      const p = upsert(e.Contact__r?.Email, e.Contact__r?.Name);
      if (p) { p.inSalesforce = true; p.ebstaScore = e.Ebsta_Score__c ?? p.ebstaScore; if (e.Contact__r?.Title) p.titles.add(e.Contact__r.Title); }
    }
    for (const c of db.support_cases) {
      const p = upsert(c.contact_email, undefined);
      if (p) { p.inCases = true; p.signals.push(`case: ${c.subject || c.case_number || "?"}`); }
    }
    for (const t of gong.transcripts) {
      for (const email of t.parties || []) {
        const p = upsert(email, undefined);
        if (p) { p.inGong = true; }
      }
    }

    // Next renewal per account from Opportunities.
    const renewalByAcct = renewalFromOpps(sf.opportunities);
    const lookupRenewal = (name: string | null) => {
      if (!name) return null;
      const lc = name.toLowerCase();
      if (renewalByAcct.has(lc)) return renewalByAcct.get(lc);
      for (const [k, v] of renewalByAcct) if (k.includes(lc) || lc.includes(k)) return v;
      return null;
    };

    // Attach ARR / renewal from the matched account (by name, best-effort).
    const acctByName = new Map<string, any>();
    for (const a of sf.accounts) {
      if (!a.name) continue;
      const r = renewalByAcct.get(String(a.name).toLowerCase());
      if (r && !a.renewalDate) a.renewalDate = r.renewalDate; // enrich accounts[] too
      acctByName.set(String(a.name).toLowerCase(), a);
    }
    const lookupAcct = (name: string | null) => {
      if (!name) return null;
      const lc = name.toLowerCase();
      if (acctByName.has(lc)) return acctByName.get(lc);
      for (const [k, v] of acctByName) if (k.includes(lc) || lc.includes(k)) return v;
      return null;
    };

    const crossReference = {
      domains: Array.from(domains),
      detected: { ...sf.detected, renewal: sf.detected?.renewal || "Opportunity.CloseDate" },
      people: Array.from(people.values())
        .map((p) => {
          const a = lookupAcct(p.account);
          const oppR = lookupRenewal(p.account);
          return {
            name: p.name, email: p.email, domain: p.domain, account: p.account,
            products: a?.products ?? [],
            arr: a?.arr ?? null,
            renewalDate: a?.renewalDate ?? oppR?.renewalDate ?? null,
            renewalOpp: oppR?.renewalOpp ?? null,
            contractEnd: a?.contractEnd ?? null,
            titles: Array.from(p.titles).join(", "), inSalesforce: p.inSalesforce,
            inGong: p.inGong, inCases: p.inCases, ebstaScore: p.ebstaScore,
            sourceCount: [p.inSalesforce, p.inGong, p.inCases].filter(Boolean).length,
            signals: p.signals.slice(0, 5).join(" | "),
          };
        })
        .sort((a, b) => b.sourceCount - a.sourceCount || (b.ebstaScore ?? -1) - (a.ebstaScore ?? -1)),
    };

    return json({ accountName, daysBack, salesforce: sf, gong, supabase: db, crossReference }, 200);
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error" }, 200);
  }
});
