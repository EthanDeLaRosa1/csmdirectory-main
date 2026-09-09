// Portfolio / book-of-business — one row per account across the fields a CSM
// cares about: ARR, next renewal, open/total cases, contacts, industry, owner,
// and (optionally) how many times a keyword is mentioned.

import { getSalesforceAccessToken, runSoql, runSosl, describeObject, renewalFromOpps, getAccountProductsByName } from "../_shared/salesforce.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });
}
const esc = (s: string) => s.replace(/'/g, "\\'");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const nameFilter = String(body.nameFilter || "").trim();
    const minArr = Number(body.minArr) || 0;
    const renewalBefore = String(body.renewalBefore || "").trim();
    const keyword = String(body.keyword || "").trim();
    const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);

    const auth = await getSalesforceAccessToken();
    if (auth.error) return json({ error: `Salesforce: ${auth.error}`, rows: [] }, 200);

    // Detect ARR + renewal/contract fields on Account.
    const { fields } = await describeObject(auth, "Account");
    const isNum = (f: any) => ["currency", "double", "int", "percent"].includes((f.type || "").toLowerCase());
    const isDate = (f: any) => ["date", "datetime"].includes((f.type || "").toLowerCase());
    const arrF = fields.find((f) => /arr|recurring/i.test(f.name) && isNum(f)) || fields.find((f) => /^annualrevenue$/i.test(f.name));
    const contractF = fields.find((f) => /(contract.?end|end.?of.?contract)/i.test(f.name) && isDate(f));
    const hasIndustry = fields.some((f) => f.name === "Industry");

    // Account query with optional name + ARR filters, ordered by ARR desc.
    const conds: string[] = [];
    if (nameFilter) conds.push(`Name LIKE '%${esc(nameFilter)}%'`);
    if (minArr && arrF) conds.push(`${arrF.name} >= ${minArr}`);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const order = arrF ? `ORDER BY ${arrF.name} DESC NULLS LAST` : "ORDER BY Name";
    const sel = ["Id", "Name", "Owner.Name"];
    if (hasIndustry) sel.push("Industry");
    if (arrF) sel.push(arrF.name);
    if (contractF) sel.push(contractF.name);

    const acctRes = await runSoql(auth, `SELECT ${[...new Set(sel)].join(", ")} FROM Account ${where} ${order} LIMIT ${limit}`);
    if (acctRes.error) return json({ error: acctRes.error, rows: [] }, 200);
    const accounts = acctRes.records;
    if (accounts.length === 0) return json({ rows: [], arrField: arrF?.name || null, keyword, count: 0 }, 200);

    const ids = accounts.map((a: any) => a.Id).filter(Boolean);
    const inIds = ids.map((i: string) => `'${i}'`).join(", ");

    // Parallel aggregate lookups.
    const [opps, caseTotal, caseOpen, contactsAgg, kwHits, productsRes] = await Promise.all([
      runSoql(auth, `SELECT Name, StageName, CloseDate, Type, IsClosed, Account.Name FROM Opportunity WHERE AccountId IN (${inIds}) ORDER BY CloseDate DESC LIMIT 2000`),
      runSoql(auth, `SELECT AccountId, COUNT(Id) c FROM Case WHERE AccountId IN (${inIds}) GROUP BY AccountId`),
      runSoql(auth, `SELECT AccountId, COUNT(Id) c FROM Case WHERE AccountId IN (${inIds}) AND IsClosed = false GROUP BY AccountId`),
      runSoql(auth, `SELECT AccountId, COUNT(Id) c FROM Contact WHERE AccountId IN (${inIds}) GROUP BY AccountId`),
      keyword ? runSosl(auth, keyword, ["Case(Id, Account.Name)"]) : Promise.resolve({ records: [] as any[] }),
      getAccountProductsByName(auth, accounts.map((a: any) => a.Name)),
    ]);
    const productsByName = productsRes.map;

    const renewal = renewalFromOpps(opps.records);
    const countBy = (recs: any[]) => {
      const m = new Map<string, number>();
      for (const r of recs) if (r.AccountId) m.set(r.AccountId, Number(r.c) || 0);
      return m;
    };
    const totalById = countBy(caseTotal.records);
    const openById = countBy(caseOpen.records);
    const contactsById = countBy(contactsAgg.records);

    // Keyword mentions per account (Salesforce cases via SOSL).
    const kwByName = new Map<string, number>();
    for (const r of (kwHits.records || [])) {
      const n = (r.Account?.Name || "").toLowerCase();
      if (n) kwByName.set(n, (kwByName.get(n) || 0) + 1);
    }
    const lookupByName = (map: Map<string, any>, name: string) => {
      const lc = name.toLowerCase();
      if (map.has(lc)) return map.get(lc);
      for (const [k, v] of map) if (k.includes(lc) || lc.includes(k)) return v;
      return null;
    };

    let rows = accounts.map((a: any) => {
      const r = lookupByName(renewal, a.Name);
      const row: any = {
        account: a.Name,
        arr: arrF ? (a[arrF.name] ?? null) : null,
        industry: hasIndustry ? (a.Industry || "") : "",
        owner: a.Owner?.Name || "",
        renewalDate: r?.renewalDate ?? null,
        renewalOpp: r?.renewalOpp ?? null,
        contractEnd: contractF ? (a[contractF.name] ?? null) : null,
        openCases: openById.get(a.Id) || 0,
        totalCases: totalById.get(a.Id) || 0,
        contacts: contactsById.get(a.Id) || 0,
        products: productsByName.get(String(a.Name).toLowerCase()) || [],
      };
      if (keyword) row.keywordMentions = lookupByName(kwByName, a.Name) || 0;
      return row;
    });

    if (renewalBefore) {
      rows = rows.filter((r: any) => r.renewalDate && r.renewalDate <= renewalBefore);
    }

    return json({ rows, arrField: arrF?.name || null, contractField: contractF?.name || null, productSource: productsRes.source, keyword, count: rows.length }, 200);
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error", rows: [] }, 200);
  }
});
