// Scheduled Gong ingest (delta) — pulls recent calls + transcripts and upserts
// into gong_transcripts so Stored search stays current. Meant to run daily via
// pg_cron over a small window (bounded to fit the edge-function time limit).

import { getServiceClient } from "../_shared/db.ts";
import { gongAuthHeader } from "../_shared/gong.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });
}

const TRANSCRIPT_BATCH = 100;
const PAGE_DELAY = 350;
const BUDGET_MS = 120000;
const IGNORED = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "salesforce.com", "copado.com"]);
const domainsOf = (emails: string[]) =>
  [...new Set(emails.map((e) => e.split("@")[1]).filter((d) => d && !IGNORED.has(d)))];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const deadline = Date.now() + BUDGET_MS;
  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days) || 3, 1), 30);
    const maxCalls = Math.min(Number(body.maxCalls) || 600, 2000);

    const authHeader = gongAuthHeader();
    if (!authHeader) return json({ error: "Gong not configured" }, 200);
    const sb = getServiceClient();
    const fromDateTime = new Date(Date.now() - days * 864e5).toISOString();

    // Page recent calls (small window), capturing started + parties.
    const meta = new Map<string, { title: string; started: string | null; parties: string[] }>();
    let cursor: string | null = null;
    let retry = 0;
    while (meta.size < maxCalls && Date.now() < deadline) {
      const params = new URLSearchParams({ fromDateTime });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://api.gong.io/v2/calls?${params.toString()}`, {
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
      });
      if (res.status === 429) { if (retry++ < 3) { await sleep(1500 * retry); continue; } break; }
      retry = 0;
      if (!res.ok) return json({ error: `Gong calls ${res.status}: ${await res.text()}` }, 200);
      const data = await res.json();
      const calls = data.calls || [];
      for (const c of calls) {
        if (meta.size >= maxCalls) break;
        const parties = (c.parties || []).map((p: any) => String(p.emailAddress || "").toLowerCase().trim()).filter(Boolean);
        meta.set(String(c.id), { title: String(c.title || ""), started: c.started || null, parties });
      }
      cursor = data.records?.cursor || data.cursor || null;
      if (!cursor || calls.length === 0) break;
      await sleep(PAGE_DELAY);
    }

    // Skip calls already stored (saves transcript fetches).
    const ids = Array.from(meta.keys());
    const stored = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await sb.from("gong_transcripts").select("call_id").in("call_id", ids.slice(i, i + 500));
      for (const r of data || []) stored.add(r.call_id);
    }
    const todo = ids.filter((id) => !stored.has(id));

    let ingested = 0;
    for (let i = 0; i < todo.length && Date.now() < deadline; i += TRANSCRIPT_BATCH) {
      const batch = todo.slice(i, i + TRANSCRIPT_BATCH);
      const r = await fetch("https://api.gong.io/v2/calls/transcript", {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ filter: { callIds: batch } }),
      });
      if (!r.ok) { await sleep(PAGE_DELAY); continue; }
      const d = await r.json();
      const rows = (d.callTranscripts || []).map((t: any) => {
        const m = meta.get(String(t.callId));
        const parties = m?.parties || [];
        const text = Array.isArray(t.transcript)
          ? t.transcript.flatMap((seg: any) => (seg.sentences || []).map((s: any) => s.text || "")).join(" ")
          : "";
        return { call_id: String(t.callId), title: m?.title || "", parties, domains: domainsOf(parties), call_date: m?.started || null, transcript_text: text };
      });
      for (let j = 0; j < rows.length; j += 20) {
        const { error } = await sb.from("gong_transcripts").upsert(rows.slice(j, j + 20), { onConflict: "call_id" });
        if (!error) ingested += Math.min(20, rows.length - j);
      }
      await sleep(PAGE_DELAY);
    }

    await sb.from("gong_ingest_log").insert({ window_days: days, scanned: ids.length, already: stored.size, ingested, ok: true });
    return json({ ok: true, window_days: days, scanned: ids.length, already: stored.size, ingested }, 200);
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error" }, 200);
  }
});
