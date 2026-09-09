// Shared Gong access: bounded call search + transcript fetch.
// Mirrors the speed-guarded logic in gong-it (page cap, throttle, 429 backoff).

const MAX_CALLS_TO_PROCESS = 40;
// Gong allows up to 100 callIds per transcript request — use the max to halve
// request volume. Hard API limit is 3 req/sec, so keep concurrency low + paced.
const TRANSCRIPT_BATCH_SIZE = 100;
const MAX_CALL_PAGES = 20;
const GONG_PAGE_DELAY_MS = 350;
const GONG_MAX_429_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function gongAuthHeader(): string | null {
  const accessKey = Deno.env.get("GONG_ACCESS_KEY") || "";
  const secretKey = Deno.env.get("GONG_SECRET_KEY") || "";
  if (!accessKey || !secretKey) return null;
  return "Basic " + btoa(`${accessKey}:${secretKey}`);
}

export type GongTranscript = {
  callId: string;
  title: string;
  parties: string[];
  text: string;
};

// Scan the full window's calls (no account filter), fetching transcripts until
// maxCalls or a wall-time budget is reached — so a big org returns as much of
// the window as fits instead of timing out. Reports coverage via scanned/capped.
export async function gongRecentTranscripts(
  daysBack: number,
  authHeader: string,
  maxCalls = 2000,
  budgetMs = 110000,
): Promise<{ transcripts: GongTranscript[]; status: number | null; error: string; scanned: number; capped: boolean }> {
  let status: number | null = null;
  let error = "";
  const deadline = Date.now() + budgetMs;
  try {
    const meta = new Map<string, { title: string; parties: string[] }>();
    let cursor: string | null = null;
    let hasMore = true;
    let retry429 = 0;
    const fromDateTime = new Date(Date.now() - daysBack * 864e5).toISOString();

    while (hasMore && meta.size < maxCalls && Date.now() < deadline) {
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
      const data = await res.json();
      const calls = data.calls || [];
      for (const c of calls) {
        if (meta.size >= maxCalls) break;
        const parties = (c.parties || [])
          .map((p: any) => String(p.emailAddress || "").toLowerCase().trim())
          .filter(Boolean);
        meta.set(String(c.id), { title: String(c.title || ""), parties });
      }
      cursor = data.records?.cursor || data.cursor || null;
      hasMore = Boolean(cursor && calls.length > 0);
      if (calls.length === 0) hasMore = false;
      await sleep(GONG_PAGE_DELAY_MS);
    }
    const listCapped = hasMore; // more calls existed than we listed

    const ids = Array.from(meta.keys());
    if (ids.length === 0) return { transcripts: [], status, error, scanned: 0, capped: listCapped };

    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += TRANSCRIPT_BATCH_SIZE) batches.push(ids.slice(i, i + TRANSCRIPT_BATCH_SIZE));

    // Fetch transcripts in bounded-concurrency waves, stopping at the deadline.
    // Concurrency 3 respects Gong's 3 req/sec limit (avoids 429 → lost batches).
    const CONCURRENCY = 3;
    const transcripts: GongTranscript[] = [];
    let scanned = 0;
    let timeCapped = false;
    for (let wi = 0; wi < batches.length; wi += CONCURRENCY) {
      if (Date.now() > deadline) { timeCapped = true; break; }
      const wave = batches.slice(wi, wi + CONCURRENCY);
      const results = await Promise.all(
        wave.map(async (batch) => {
          const r = await fetch("https://api.gong.io/v2/calls/transcript", {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { callIds: batch } }),
          });
          if (!r.ok) { status = r.status; error = await r.text(); return { list: [] as any[], n: batch.length }; }
          const d = await r.json();
          return { list: Array.isArray(d.callTranscripts) ? d.callTranscripts : [], n: batch.length };
        }),
      );
      for (const { list, n } of results) {
        scanned += n;
        for (const t of list) {
          const m = meta.get(String(t.callId));
          const text = Array.isArray(t.transcript)
            ? t.transcript.flatMap((seg: any) => (seg.sentences || []).map((s: any) => s.text || "")).join(" ")
            : "";
          transcripts.push({ callId: String(t.callId), title: m?.title || "", parties: m?.parties || [], text });
        }
      }
      await sleep(GONG_PAGE_DELAY_MS);
    }

    return { transcripts, status, error, scanned: scanned || meta.size, capped: listCapped || timeCapped };
  } catch (err) {
    return { transcripts: [], status: status ?? 500, error: err instanceof Error ? err.message : String(err), scanned: 0, capped: true };
  }
}

export async function gongSearch(
  accountName: string,
  domains: string[],
  daysBack: number,
  authHeader: string,
): Promise<{ transcripts: GongTranscript[]; status: number | null; error: string }> {
  let status: number | null = null;
  let error = "";

  try {
    const normalized = accountName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const keywords = normalized.split(" ").filter((w) => w.length > 3);

    const matched = new Map<string, { callId: string; title: string; parties: string[] }>();
    let cursor: string | null = null;
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
        if (retry429 < GONG_MAX_429_RETRIES) {
          retry429 += 1;
          await sleep(1000 * retry429);
          continue;
        }
        status = 429;
        error = "Gong rate limit (429) after retries";
        break;
      }
      retry429 = 0;

      if (!res.ok) {
        status = res.status;
        error = await res.text();
        break;
      }

      pageCount += 1;
      const data = await res.json();
      const calls = data.calls || [];

      for (const c of calls) {
        if (matched.size >= MAX_CALLS_TO_PROCESS) break;
        const title = String(c.title || "").toLowerCase();
        const parties = (c.parties || [])
          .map((p: any) => String(p.emailAddress || "").toLowerCase().trim())
          .filter(Boolean);

        const domainMatch = parties.some((e: string) => domains.some((d) => e.endsWith(`@${d}`)));
        const nameMatch = normalized.length > 3 && title.includes(normalized);
        const kwCount = keywords.filter((k) => title.includes(k)).length;
        const kwMatch = keywords.length > 0 && kwCount >= Math.min(2, keywords.length);
        const emailKwMatch = parties.some((e: string) =>
          keywords.some((k) => e.split("@")[0].includes(k)),
        );

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
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += TRANSCRIPT_BATCH_SIZE) {
      batches.push(ids.slice(i, i + TRANSCRIPT_BATCH_SIZE));
    }

    const results = await Promise.all(
      batches.map(async (batch) => {
        const r = await fetch("https://api.gong.io/v2/calls/transcript", {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { callIds: batch } }),
        });
        if (!r.ok) {
          status = r.status;
          error = await r.text();
          return [];
        }
        const d = await r.json();
        return Array.isArray(d.callTranscripts) ? d.callTranscripts : [];
      }),
    );

    const transcripts: GongTranscript[] = [];
    for (const batch of results) {
      for (const t of batch) {
        const meta = matched.get(String(t.callId));
        const text = Array.isArray(t.transcript)
          ? t.transcript.flatMap((seg: any) => (seg.sentences || []).map((s: any) => s.text || "")).join(" ")
          : "";
        transcripts.push({
          callId: String(t.callId),
          title: meta?.title || "",
          parties: meta?.parties || [],
          text,
        });
      }
    }

    return { transcripts, status, error };
  } catch (err) {
    return {
      transcripts: [],
      status: status ?? 500,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
