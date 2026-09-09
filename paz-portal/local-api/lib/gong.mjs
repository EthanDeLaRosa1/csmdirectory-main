// Gong access (Node port). Bounded call search + transcript fetch.

const MAX_CALLS_TO_PROCESS = 40;
const TRANSCRIPT_BATCH_SIZE = 50;
const MAX_CALL_PAGES = 20;
const GONG_PAGE_DELAY_MS = 350;
const GONG_MAX_429_RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function gongAuthHeader() {
  const accessKey = process.env.GONG_ACCESS_KEY || "";
  const secretKey = process.env.GONG_SECRET_KEY || "";
  if (!accessKey || !secretKey) return null;
  return "Basic " + Buffer.from(`${accessKey}:${secretKey}`).toString("base64");
}

export async function gongRecentTranscripts(daysBack, authHeader, maxCalls = 150) {
  let status = null, error = "";
  try {
    const meta = new Map();
    let cursor = null, hasMore = true, pageCount = 0, retry429 = 0;
    const fromDateTime = new Date(Date.now() - daysBack * 864e5).toISOString();
    const maxPages = Math.ceil(maxCalls / 100) + 1;
    while (hasMore && meta.size < maxCalls && pageCount < maxPages) {
      const params = new URLSearchParams({ fromDateTime });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://api.gong.io/v2/calls?${params.toString()}`, {
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
      });
      if (res.status === 429) {
        if (retry429 < GONG_MAX_429_RETRIES) { retry429 += 1; await sleep(1000 * retry429); continue; }
        status = 429; error = "Gong rate limit (429)"; break;
      }
      retry429 = 0;
      if (!res.ok) { status = res.status; error = await res.text(); break; }
      pageCount += 1;
      const data = await res.json();
      const calls = data.calls || [];
      for (const c of calls) {
        if (meta.size >= maxCalls) break;
        const parties = (c.parties || []).map((p) => String(p.emailAddress || "").toLowerCase().trim()).filter(Boolean);
        meta.set(String(c.id), { title: String(c.title || ""), parties });
      }
      cursor = data.records?.cursor || data.cursor || null;
      hasMore = Boolean(cursor && calls.length > 0);
      if (calls.length === 0) hasMore = false;
      await sleep(GONG_PAGE_DELAY_MS);
    }
    const ids = Array.from(meta.keys());
    if (ids.length === 0) return { transcripts: [], status, error };
    const batches = [];
    for (let i = 0; i < ids.length; i += TRANSCRIPT_BATCH_SIZE) batches.push(ids.slice(i, i + TRANSCRIPT_BATCH_SIZE));
    const results = await Promise.all(batches.map(async (batch) => {
      const r = await fetch("https://api.gong.io/v2/calls/transcript", {
        method: "POST", headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ filter: { callIds: batch } }),
      });
      if (!r.ok) { status = r.status; error = await r.text(); return []; }
      const d = await r.json();
      return Array.isArray(d.callTranscripts) ? d.callTranscripts : [];
    }));
    const transcripts = [];
    for (const batch of results) for (const t of batch) {
      const m = meta.get(String(t.callId));
      const text = Array.isArray(t.transcript) ? t.transcript.flatMap((seg) => (seg.sentences || []).map((s) => s.text || "")).join(" ") : "";
      transcripts.push({ callId: String(t.callId), title: m?.title || "", parties: m?.parties || [], text });
    }
    return { transcripts, status, error };
  } catch (err) {
    return { transcripts: [], status: status ?? 500, error: err?.message || String(err) };
  }
}

export async function gongSearch(accountName, domains, daysBack, authHeader) {
  let status = null;
  let error = "";
  try {
    const normalized = accountName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const keywords = normalized.split(" ").filter((w) => w.length > 3);
    const matched = new Map();
    let cursor = null;
    let hasMore = true;
    let pageCount = 0;
    let retry429 = 0;
    const fromDateTime = new Date(Date.now() - daysBack * 864e5).toISOString();

    while (hasMore && matched.size < MAX_CALLS_TO_PROCESS && pageCount < MAX_CALL_PAGES) {
      const params = new URLSearchParams({ fromDateTime });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://api.gong.io/v2/calls?${params.toString()}`, {
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
      });
      if (res.status === 429) {
        if (retry429 < GONG_MAX_429_RETRIES) { retry429 += 1; await sleep(1000 * retry429); continue; }
        status = 429; error = "Gong rate limit (429) after retries"; break;
      }
      retry429 = 0;
      if (!res.ok) { status = res.status; error = await res.text(); break; }
      pageCount += 1;
      const data = await res.json();
      const calls = data.calls || [];
      for (const c of calls) {
        if (matched.size >= MAX_CALLS_TO_PROCESS) break;
        const title = String(c.title || "").toLowerCase();
        const parties = (c.parties || []).map((p) => String(p.emailAddress || "").toLowerCase().trim()).filter(Boolean);
        const domainMatch = parties.some((e) => domains.some((d) => e.endsWith(`@${d}`)));
        const nameMatch = normalized.length > 3 && title.includes(normalized);
        const kwCount = keywords.filter((k) => title.includes(k)).length;
        const kwMatch = keywords.length > 0 && kwCount >= Math.min(2, keywords.length);
        const emailKwMatch = parties.some((e) => keywords.some((k) => e.split("@")[0].includes(k)));
        if (domainMatch || nameMatch || kwMatch || emailKwMatch) {
          matched.set(String(c.id), { callId: String(c.id), title: String(c.title || ""), parties });
        }
      }
      cursor = data.records?.cursor || data.cursor || null;
      hasMore = Boolean(cursor && calls.length > 0);
      if (calls.length === 0) hasMore = false;
      await sleep(GONG_PAGE_DELAY_MS);
    }

    const entries = Array.from(matched.values()).slice(0, MAX_CALLS_TO_PROCESS);
    if (entries.length === 0) return { transcripts: [], status, error };

    const ids = entries.map((e) => e.callId);
    const batches = [];
    for (let i = 0; i < ids.length; i += TRANSCRIPT_BATCH_SIZE) batches.push(ids.slice(i, i + TRANSCRIPT_BATCH_SIZE));

    const results = await Promise.all(
      batches.map(async (batch) => {
        const r = await fetch("https://api.gong.io/v2/calls/transcript", {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { callIds: batch } }),
        });
        if (!r.ok) { status = r.status; error = await r.text(); return []; }
        const d = await r.json();
        return Array.isArray(d.callTranscripts) ? d.callTranscripts : [];
      }),
    );

    const transcripts = [];
    for (const batch of results) {
      for (const t of batch) {
        const meta = matched.get(String(t.callId));
        const text = Array.isArray(t.transcript)
          ? t.transcript.flatMap((seg) => (seg.sentences || []).map((s) => s.text || "")).join(" ")
          : "";
        transcripts.push({ callId: String(t.callId), title: meta?.title || "", parties: meta?.parties || [], text });
      }
    }
    return { transcripts, status, error };
  } catch (err) {
    return { transcripts: [], status: status ?? 500, error: err?.message || String(err) };
  }
}
