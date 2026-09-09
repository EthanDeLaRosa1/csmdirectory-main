// Salesforce access (Node port). Refresh-token auth + read-only SOQL + describe.
// Mirrors the Agentia connection contract: reference the connection (never raw
// creds), reads proceed / writes blocked, explicit fields + LIMIT, describe for
// metadata, paginate via nextRecordsUrl. API v60.0.

const API_VERSION = "v60.0";

export async function getSalesforceAccessToken() {
  const sfInstanceUrl = process.env.SF_INSTANCE_URL || process.env.SALESFORCE_INSTANCE_URL;
  const sfClientId = process.env.SF_CLIENT_ID;
  const sfRefreshToken = process.env.SF_REFRESH_TOKEN;

  if (!sfInstanceUrl || !sfRefreshToken) {
    return { error: "Missing SF_INSTANCE_URL or SF_REFRESH_TOKEN in paz.env" };
  }

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: sfClientId || "",
      refresh_token: sfRefreshToken,
    });
    const res = await fetch(`${sfInstanceUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) return { error: `Token refresh failed (${res.status}): ${await res.text()}` };
    const data = await res.json();
    return { accessToken: data.access_token, instanceUrl: data.instance_url || sfInstanceUrl };
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

const stripAttrs = (r) => {
  const { attributes, ...rest } = r;
  return rest;
};

export async function runSoql(auth, soql, maxRecords = 2000) {
  if (auth.error) return { records: [], error: auth.error };
  const trimmed = (soql || "").trim();
  if (!trimmed.toLowerCase().startsWith("select ")) return { records: [], error: "Only SELECT queries are allowed." };
  if (/;|\b(insert|update|delete|upsert|merge|undelete)\b/i.test(trimmed)) {
    return { records: [], error: "Query contains a forbidden keyword or ';'." };
  }

  const headers = { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" };
  try {
    let url = `${auth.instanceUrl}/services/data/${API_VERSION}/query/?q=${encodeURIComponent(trimmed)}`;
    const records = [];
    let totalSize;
    while (url && records.length < maxRecords) {
      const res = await fetch(url, { headers });
      const body = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(body) ? body.map((e) => e.message).join("; ") : JSON.stringify(body);
        return { records, error: `Salesforce ${res.status}: ${msg}` };
      }
      totalSize = body.totalSize;
      for (const r of body.records || []) records.push(stripAttrs(r));
      url = body.nextRecordsUrl ? `${auth.instanceUrl}${body.nextRecordsUrl}` : "";
    }
    return { records: records.slice(0, maxRecords), totalSize };
  } catch (err) {
    return { records: [], error: err?.message || String(err) };
  }
}

export async function runSosl(auth, term, returning) {
  if (auth.error) return { records: [], error: auth.error };
  const clean = (term || "").replace(/[{}\\]/g, "").trim();
  if (!clean) return { records: [], error: "Empty search term." };
  const sosl = `FIND {${clean}} IN ALL FIELDS RETURNING ${returning.join(", ")}`;
  try {
    const res = await fetch(`${auth.instanceUrl}/services/data/${API_VERSION}/search/?q=${encodeURIComponent(sosl)}`, {
      headers: { Authorization: `Bearer ${auth.accessToken}`, "Content-Type": "application/json" },
    });
    const body = await res.json();
    if (!res.ok) {
      const msg = Array.isArray(body) ? body.map((e) => e.message).join("; ") : JSON.stringify(body);
      return { records: [], error: `Salesforce SOSL ${res.status}: ${msg}` };
    }
    const records = (body.searchRecords || []).map((r) => {
      const type = r.attributes?.type;
      const { attributes, ...rest } = r;
      return { _type: type, ...rest };
    });
    return { records };
  } catch (err) {
    return { records: [], error: err?.message || String(err) };
  }
}

export async function describeObject(auth, objectName) {
  if (auth.error) return { fields: [], error: auth.error };
  if (!/^[a-zA-Z0-9_]+$/.test(objectName)) return { fields: [], error: "Invalid object name." };
  try {
    const res = await fetch(`${auth.instanceUrl}/services/data/${API_VERSION}/sobjects/${objectName}/describe`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!res.ok) return { fields: [], error: `Describe ${res.status}` };
    const body = await res.json();
    return { fields: (body.fields || []).map((f) => ({ name: f.name, label: f.label, type: f.type })) };
  } catch (err) {
    return { fields: [], error: err?.message || String(err) };
  }
}
