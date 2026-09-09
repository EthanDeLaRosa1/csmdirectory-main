// Shared Salesforce access: refresh-token auth + read-only SOQL runner.
// Uses the tangoAI platform's SF connection held in Supabase secrets.
//
// Follows the Agentia_Agent connection contract (context/platform-interaction/
// salesforce-rest-soql.md): reference the connection (never raw creds), reads
// proceed directly / writes are blocked, explicit fields + LIMIT, describe for
// metadata-over-memory, and paginate via nextRecordsUrl.

const API_VERSION = "v60.0";

export type SfAuth =
  | { accessToken: string; instanceUrl: string; error?: undefined }
  | { error: string; accessToken?: undefined; instanceUrl?: undefined };

export async function getSalesforceAccessToken(): Promise<SfAuth> {
  const sfInstanceUrl = Deno.env.get("SF_INSTANCE_URL") || Deno.env.get("SALESFORCE_INSTANCE_URL");
  const sfClientId = Deno.env.get("SF_CLIENT_ID");
  const sfRefreshToken = Deno.env.get("SF_REFRESH_TOKEN");

  if (!sfInstanceUrl || !sfRefreshToken) {
    return { error: "Missing SF_INSTANCE_URL or SF_REFRESH_TOKEN in Supabase secrets" };
  }

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: sfClientId || "",
      refresh_token: sfRefreshToken,
    });

    const tokenRes = await fetch(`${sfInstanceUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return { error: `Token refresh failed (${tokenRes.status}): ${errText}` };
    }

    const tokenData = await tokenRes.json();
    return {
      accessToken: tokenData.access_token,
      instanceUrl: tokenData.instance_url || sfInstanceUrl,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

const stripAttrs = (r: any) => {
  const { attributes, ...rest } = r;
  return rest;
};

// Runs a READ-ONLY SOQL query, following nextRecordsUrl pagination up to a cap.
export async function runSoql(
  auth: SfAuth,
  soql: string,
  maxRecords = 2000,
): Promise<{ records: any[]; totalSize?: number; error?: string }> {
  if (auth.error) return { records: [], error: auth.error };

  const trimmed = (soql || "").trim();
  const lower = trimmed.toLowerCase();
  // Read-only guard: must be a SELECT, no statement chaining or DML verbs.
  if (!lower.startsWith("select ")) {
    return { records: [], error: "Only SELECT queries are allowed." };
  }
  if (/;|\b(insert|update|delete|upsert|merge|undelete)\b/i.test(trimmed)) {
    return { records: [], error: "Query contains a forbidden keyword or ';'." };
  }

  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    let url = `${auth.instanceUrl}/services/data/${API_VERSION}/query/?q=${encodeURIComponent(trimmed)}`;
    const records: any[] = [];
    let totalSize: number | undefined;

    // Follow nextRecordsUrl until absent or the record cap is reached.
    while (url && records.length < maxRecords) {
      const res = await fetch(url, { headers });
      const body = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(body) ? body.map((e: any) => e.message).join("; ") : JSON.stringify(body);
        return { records, error: `Salesforce ${res.status}: ${msg}` };
      }
      totalSize = body.totalSize;
      for (const r of body.records || []) records.push(stripAttrs(r));
      url = body.nextRecordsUrl ? `${auth.instanceUrl}${body.nextRecordsUrl}` : "";
    }

    return { records: records.slice(0, maxRecords), totalSize };
  } catch (err) {
    return { records: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// Full-text search across objects (SOSL) — for account-less keyword search.
// Pass RETURNING clauses, e.g.
//   returning: ["Case(Id,CaseNumber,Subject,Description,Account.Name,CreatedDate)"]
export async function runSosl(
  auth: SfAuth,
  term: string,
  returning: string[],
): Promise<{ records: any[]; error?: string }> {
  if (auth.error) return { records: [], error: auth.error };
  const clean = (term || "").replace(/[{}\\]/g, "").trim();
  if (!clean) return { records: [], error: "Empty search term." };
  const sosl = `FIND {${clean}} IN ALL FIELDS RETURNING ${returning.join(", ")}`;
  try {
    const res = await fetch(
      `${auth.instanceUrl}/services/data/${API_VERSION}/search/?q=${encodeURIComponent(sosl)}`,
      { headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" } },
    );
    const body = await res.json();
    if (!res.ok) {
      const msg = Array.isArray(body) ? body.map((e: any) => e.message).join("; ") : JSON.stringify(body);
      return { records: [], error: `Salesforce SOSL ${res.status}: ${msg}` };
    }
    // searchRecords carry attributes.type so callers know the object.
    const records = (body.searchRecords || []).map((r: any) => {
      const type = r.attributes?.type;
      const { attributes, ...rest } = r;
      return { _type: type, ...rest };
    });
    return { records };
  } catch (err) {
    return { records: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// Derive the next renewal per account from its Opportunities.
export function renewalFromOpps(
  opps: any[],
): Map<string, { renewalDate: string; renewalOpp: string; stage: string }> {
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
    const cands = pool.map((o) => ({ ...o, t: new Date(o.CloseDate).getTime() })).filter((o) => !isNaN(o.t));
    if (cands.length === 0) continue;
    const future = cands.filter((o) => o.t >= now).sort((a, b) => a.t - b.t);
    const pick = future[0] || cands.sort((a, b) => b.t - a.t)[0];
    if (pick) out.set(acct, { renewalDate: pick.CloseDate, renewalOpp: pick.Name, stage: pick.StageName });
  }
  return out;
}

// ---- Product ownership -----------------------------------------------------
// Canonical Copado product lines. First matching pattern wins; unmatched raw
// names are cleaned (drop a leading "Copado ") and kept so nothing is lost.
const PRODUCT_CATALOG: { canon: string; re: RegExp }[] = [
  { canon: "CICD", re: /ci\/?cd|continuous (integration|delivery)|devops (platform|deploy)|\bdeploy(er|ment)?\b/i },
  { canon: "CRT", re: /robotic test|\bcrt\b/i },
  { canon: "Agentia", re: /agentia|ai agent/i },
  { canon: "Testing", re: /\btest(ing)?\b/i },
  { canon: "Data Deploy", re: /data ?deploy|copado data|\bdata\b/i },
  { canon: "Compliance", re: /compliance|\bcch\b|copado compliance hub/i },
  { canon: "VSM", re: /value stream|\bvsm\b/i },
  { canon: "Essentials", re: /essentials/i },
];

// Normalise one raw product name to a canonical product line (or a cleaned raw).
export function normalizeProduct(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  for (const p of PRODUCT_CATALOG) if (p.re.test(s)) return p.canon;
  return s.replace(/^copado\s+/i, "").trim();
}

// Auto-detect which products each account OWNS. Probes in order and uses the
// first source that returns data: Assets → won Opportunity products → a custom
// product field on Account. Returns a map keyed by lowercased account name.
export async function getAccountProductsByName(
  auth: SfAuth,
  names: string[],
): Promise<{ map: Map<string, string[]>; source: string | null }> {
  const map = new Map<string, string[]>();
  if (auth.error || names.length === 0) return { map, source: null };

  const clean = [...new Set(names.filter(Boolean))].slice(0, 200);
  const inList = clean.map((n) => `'${n.replace(/'/g, "\\'")}'`).join(", ");

  const add = (name: any, rawProduct: any) => {
    const canon = normalizeProduct(String(rawProduct ?? ""));
    if (!name || !canon) return;
    const k = String(name).toLowerCase();
    const arr = map.get(k) || [];
    if (!arr.includes(canon)) { arr.push(canon); map.set(k, arr); }
  };

  // 1) Assets — the standard "products a customer owns".
  let source: string | null = null;
  const asset = await runSoql(auth, `SELECT Account.Name, Product2.Name, Name FROM Asset WHERE Account.Name IN (${inList}) LIMIT 2000`);
  if (!asset.error) {
    for (const a of asset.records) add(a.Account?.Name, a.Product2?.Name || a.Name);
    if (map.size) source = "Asset";
  }

  // 2) Won Opportunity line items — products that were sold.
  if (!source) {
    const oli = await runSoql(
      auth,
      `SELECT Opportunity.Account.Name, Product2.Name, Name FROM OpportunityLineItem WHERE Opportunity.Account.Name IN (${inList}) AND Opportunity.IsWon = true LIMIT 2000`,
    );
    if (!oli.error) {
      for (const o of oli.records) add(o.Opportunity?.Account?.Name, o.Product2?.Name || o.Name);
      if (map.size) source = "OpportunityLineItem";
    }
  }

  // 3) A custom product field on Account (multi-select / text).
  if (!source) {
    const { fields } = await describeObject(auth, "Account");
    const pf = fields.find((f) => /product/i.test(f.name) && /(multipicklist|picklist|string|textarea)/i.test(f.type || ""));
    if (pf) {
      const res = await runSoql(auth, `SELECT Name, ${pf.name} FROM Account WHERE Name IN (${inList}) LIMIT 200`);
      if (!res.error) {
        for (const a of res.records) for (const p of String(a[pf.name] ?? "").split(/[;,]/)) add(a.Name, p);
        if (map.size) source = `Account.${pf.name}`;
      }
    }
  }

  for (const [k, v] of map) map.set(k, v.sort());
  return { map, source };
}

type AccountEnrichment = { arr: number | null; renewalDate: string | null; renewalOpp: string | null; products: string[] };

// Enrich a set of account NAMES with ARR (auto-detected), next renewal (from
// Opportunities), and owned products. Returns a map keyed by lowercased name.
export async function enrichAccounts(
  auth: SfAuth,
  names: string[],
): Promise<{ map: Map<string, AccountEnrichment>; arrField: string | null; productSource: string | null }> {
  const map = new Map<string, AccountEnrichment>();
  if (auth.error || names.length === 0) return { map, arrField: null, productSource: null };

  const clean = [...new Set(names.filter(Boolean))].slice(0, 100);
  const inList = clean.map((n) => `'${n.replace(/'/g, "\\'")}'`).join(", ");

  const { fields } = await describeObject(auth, "Account");
  const isNum = (f: any) => ["currency", "double", "int", "percent"].includes((f.type || "").toLowerCase());
  const arrF = fields.find((f) => /arr|recurring/i.test(f.name) && isNum(f)) || fields.find((f) => /^annualrevenue$/i.test(f.name));

  const [accts, opps, products] = await Promise.all([
    runSoql(auth, `SELECT Name${arrF ? `, ${arrF.name}` : ""} FROM Account WHERE Name IN (${inList}) LIMIT 200`),
    runSoql(auth, `SELECT Name, StageName, CloseDate, Type, IsClosed, Account.Name FROM Opportunity WHERE Account.Name IN (${inList}) ORDER BY CloseDate DESC LIMIT 500`),
    getAccountProductsByName(auth, clean),
  ]);

  for (const a of accts.records) {
    const k = String(a.Name).toLowerCase();
    map.set(k, { arr: arrF ? (a[arrF.name] ?? null) : null, renewalDate: null, renewalOpp: null, products: products.map.get(k) || [] });
  }
  const renew = renewalFromOpps(opps.records);
  for (const [acct, r] of renew) {
    const e = map.get(acct) || { arr: null, renewalDate: null, renewalOpp: null, products: products.map.get(acct) || [] };
    e.renewalDate = r.renewalDate;
    e.renewalOpp = r.renewalOpp;
    map.set(acct, e);
  }
  // Accounts that only surfaced via the product probe still get an entry.
  for (const [acct, prods] of products.map) {
    if (!map.has(acct)) map.set(acct, { arr: null, renewalDate: null, renewalOpp: null, products: prods });
  }
  return { map, arrField: arrF?.name || null, productSource: products.source };
}

// Metadata-over-memory: describe an sObject's fields before relying on them.
export async function describeObject(
  auth: SfAuth,
  objectName: string,
): Promise<{ fields: { name: string; label: string; type: string }[]; error?: string }> {
  if (auth.error) return { fields: [], error: auth.error };
  if (!/^[a-zA-Z0-9_]+$/.test(objectName)) return { fields: [], error: "Invalid object name." };
  try {
    const res = await fetch(
      `${auth.instanceUrl}/services/data/${API_VERSION}/sobjects/${objectName}/describe`,
      { headers: { Authorization: `Bearer ${auth.accessToken}` } },
    );
    if (!res.ok) return { fields: [], error: `Describe ${res.status}` };
    const body = await res.json();
    const fields = (body.fields || []).map((f: any) => ({ name: f.name, label: f.label, type: f.type }));
    return { fields };
  } catch (err) {
    return { fields: [], error: err instanceof Error ? err.message : String(err) };
  }
}
