// Background Gong ingest — walks the full window, stores transcripts in Supabase
// (public.gong_transcripts) so keyword search hits the stored copy (instant,
// unlimited). No edge-function time limit; rate-limited to Gong's 3 req/sec.
//
// Usage:  node gong-ingest.mjs [--days 1460] [--max 100000] [--force]
//   --days   lookback window in days (default 1460 = 4 years)
//   --max    stop after N calls (default: all)
//   --force  re-fetch transcripts even if already stored

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", "..", "paz.env") });

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const daysBack = Math.min(Number(getArg("days", 1460)), 3650);
const maxCalls = Number(getArg("max", 0)) || Infinity;
const force = args.includes("--force");

const accessKey = process.env.GONG_ACCESS_KEY;
const secretKey = process.env.GONG_SECRET_KEY;
const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!accessKey || !secretKey) { console.error("Missing GONG_ACCESS_KEY / GONG_SECRET_KEY in paz.env"); process.exit(1); }
if (!supaUrl || !supaKey) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in paz.env"); process.exit(1); }

const authHeader = "Basic " + Buffer.from(`${accessKey}:${secretKey}`).toString("base64");
const supabase = createClient(supaUrl, supaKey);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IGNORED = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "salesforce.com", "copado.com"]);
const domainsOf = (emails) => [...new Set(emails.map((e) => e.split("@")[1]).filter((d) => d && !IGNORED.has(d)))];

// Rate limiter: >=340ms between any two Gong API calls (stays under 3/sec).
let lastGong = 0;
async function gongFetch(url, opts) {
  const wait = 340 - (Date.now() - lastGong);
  if (wait > 0) await sleep(wait);
  for (let attempt = 0; attempt < 4; attempt++) {
    lastGong = Date.now();
    const res = await fetch(url, opts);
    if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    return res;
  }
  throw new Error("Gong 429 after retries");
}

async function pageCalls() {
  const fromDateTime = new Date(Date.now() - daysBack * 864e5).toISOString();
  const calls = [];
  let cursor = null;
  let page = 0;
  while (calls.length < maxCalls) {
    const params = new URLSearchParams({ fromDateTime });
    if (cursor) params.set("cursor", cursor);
    const res = await gongFetch(`https://api.gong.io/v2/calls?${params.toString()}`, {
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    if (!res.ok) { console.error(`calls list ${res.status}: ${await res.text()}`); break; }
    const data = await res.json();
    const batch = data.calls || [];
    for (const c of batch) {
      const parties = (c.parties || []).map((p) => String(p.emailAddress || "").toLowerCase().trim()).filter(Boolean);
      calls.push({ id: String(c.id), title: String(c.title || ""), started: c.started || null, parties });
    }
    page++;
    process.stdout.write(`\r  listing calls… page ${page}, ${calls.length} calls`);
    cursor = data.records?.cursor || data.cursor || null;
    if (!cursor || batch.length === 0) break;
  }
  process.stdout.write("\n");
  return calls.slice(0, maxCalls === Infinity ? calls.length : maxCalls);
}

async function alreadyStored(ids) {
  if (force) return new Set();
  const stored = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data } = await supabase.from("gong_transcripts").select("call_id").in("call_id", chunk);
    for (const r of data || []) stored.add(r.call_id);
  }
  return stored;
}

async function main() {
  console.log(`\nGong ingest → gong_transcripts  (window: ${daysBack}d${force ? ", force" : ""})`);
  const calls = await pageCalls();
  const metaById = new Map(calls.map((c) => [c.id, c]));
  const allIds = calls.map((c) => c.id);
  console.log(`  total calls in window: ${allIds.length}`);

  const stored = await alreadyStored(allIds);
  const todo = allIds.filter((id) => !stored.has(id));
  console.log(`  already stored: ${stored.size} · to ingest: ${todo.length}\n`);

  let ingested = 0;
  for (let i = 0; i < todo.length; i += 100) {
    const batchIds = todo.slice(i, i + 100);
    const res = await gongFetch("https://api.gong.io/v2/calls/transcript", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { callIds: batchIds } }),
    });
    if (!res.ok) { console.error(`\n  transcript batch ${res.status}: ${(await res.text()).slice(0, 200)}`); continue; }
    const data = await res.json();
    const rows = (data.callTranscripts || []).map((t) => {
      const m = metaById.get(String(t.callId));
      const parties = m?.parties || [];
      const text = Array.isArray(t.transcript)
        ? t.transcript.flatMap((seg) => (seg.sentences || []).map((s) => s.text || "")).join(" ")
        : "";
      return {
        call_id: String(t.callId),
        title: m?.title || "",
        parties,
        domains: domainsOf(parties),
        call_date: m?.started || null,
        transcript_text: text,
      };
    });
    // Upsert in small chunks — large transcripts + FTS index maintenance can
    // exceed the statement timeout if 100 rows go in one statement.
    for (let j = 0; j < rows.length; j += 20) {
      const chunk = rows.slice(j, j + 20);
      const { error } = await supabase.from("gong_transcripts").upsert(chunk, { onConflict: "call_id" });
      if (error) console.error(`\n  upsert error: ${error.message}`);
      else ingested += chunk.length;
    }
    process.stdout.write(`\r  ingesting… ${ingested}/${todo.length}`);
  }
  process.stdout.write("\n");
  console.log(`\n✅ Done. Ingested ${ingested} transcripts. Table now has stored Gong data.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
