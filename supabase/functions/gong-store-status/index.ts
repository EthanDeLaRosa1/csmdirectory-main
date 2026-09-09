// Gong store status — count + date coverage of the ingested gong_transcripts.

import { getServiceClient } from "../_shared/db.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = getServiceClient();
    const { count, error: cErr } = await sb
      .from("gong_transcripts")
      .select("*", { count: "exact", head: true });
    if (cErr) return json({ error: cErr.message, count: 0 }, 200);

    const [{ data: newest }, { data: oldest }, { data: lastIngest }, { data: lastRun }] = await Promise.all([
      sb.from("gong_transcripts").select("call_date").not("call_date", "is", null).order("call_date", { ascending: false }).limit(1),
      sb.from("gong_transcripts").select("call_date").not("call_date", "is", null).order("call_date", { ascending: true }).limit(1),
      sb.from("gong_transcripts").select("ingested_at").order("ingested_at", { ascending: false }).limit(1),
      sb.from("gong_ingest_log").select("ran_at, ingested, scanned, window_days, ok").order("ran_at", { ascending: false }).limit(1),
    ]);

    return json({
      count: count || 0,
      latestCall: newest?.[0]?.call_date || null,
      earliestCall: oldest?.[0]?.call_date || null,
      lastIngest: lastIngest?.[0]?.ingested_at || null,
      lastRun: lastRun?.[0] || null,
    }, 200);
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error", count: 0 }, 200);
  }
});
