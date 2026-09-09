// Paz Portal — Tango AI research function.
// Uses the Claude API (Anthropic SDK) directly to research a collected account
// "briefcase" (Salesforce cases + EBSTA + Gong transcripts).

import Anthropic from "npm:@anthropic-ai/sdk";
import { getAnthropicKey, AI_KEY_NAMES } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-opus-4-8";

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// Compress the briefcase into a compact, token-bounded context string.
function buildContext(ctx: any): string {
  const parts: string[] = [];
  parts.push(`Account: ${ctx?.accountName ?? "unknown"} (lookback ${ctx?.daysBack ?? "?"} days)`);

  const cases = Array.isArray(ctx?.cases) ? ctx.cases : [];
  parts.push(`\n## Support cases (${cases.length})`);
  for (const c of cases.slice(0, 25)) {
    parts.push(
      `- [${c.case_number ?? "?"}] ${c.status ?? "?"} — ${truncate(c.subject ?? "", 120)} :: ${truncate(c.description ?? "", 300)}`
    );
  }

  const eb = ctx?.ebstaData;
  if (eb) {
    parts.push(`\n## EBSTA — account score ${eb.score ?? "n/a"}, last activity ${eb.lastActivity ?? "n/a"}`);
    for (const c of (eb.contacts || []).slice(0, 10)) {
      parts.push(`- contact: ${c.name} (${c.title}) score ${c.score}`);
    }
    for (const o of (eb.opportunities || []).slice(0, 10)) {
      parts.push(`- opp: ${o.name} [${o.stage}] score ${o.score}`);
    }
    for (const e of (eb.emails || []).slice(0, 8)) {
      parts.push(`- email: ${truncate(e.subject, 80)} — ${truncate(e.body, 200)}`);
    }
  }

  const transcripts = Array.isArray(ctx?.transcripts) ? ctx.transcripts : [];
  parts.push(`\n## Gong calls (${transcripts.length})`);
  for (const t of transcripts.slice(0, 12)) {
    const text = Array.isArray(t.transcript)
      ? t.transcript
          .flatMap((seg: any) => (seg.sentences || []).map((s: any) => s.text || ""))
          .join(" ")
      : "";
    parts.push(`- ${truncate(t.title || "call", 100)} [${(t.parties || []).join(", ")}]: ${truncate(text, 500)}`);
  }

  return parts.join("\n");
}

const SYSTEM_PROMPT = [
  "You are Tango AI, a research assistant for a Customer Success portal.",
  "You are given a data 'briefcase' for one account: Salesforce support cases, EBSTA engagement scores, and Gong call transcripts.",
  "Answer the user's question using ONLY the briefcase. Never invent contacts, numbers, or facts not present.",
  "If the briefcase lacks the answer, say so plainly.",
].join("\n");

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string", description: "2-5 sentence narrative answer." },
    highlights: {
      type: "array",
      items: { type: "string" },
      description: "2-5 short bullet strings of the most important supporting facts.",
    },
  },
  required: ["answer", "highlights"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { question, context } = await req.json();

    if (!question || typeof question !== "string") {
      return json({ error: "question is required" }, 400);
    }
    if (!context || typeof context !== "object") {
      return json({ error: "context (collected briefcase) is required" }, 400);
    }

    const apiKey = getAnthropicKey();
    if (!apiKey) {
      return json(
        { answer: `Tango AI is not configured. Set one of: ${AI_KEY_NAMES.join(", ")}.`, highlights: [] },
        200
      );
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: RESEARCH_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `BRIEFCASE:\n${buildContext(context)}\n\nQUESTION: ${question}`,
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return json({ error: "Tango AI declined this request." }, 200);
    }

    const textBlock = message.content.find((b: any) => b.type === "text") as any;
    const raw = textBlock?.text ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { answer: raw, highlights: [] };
    }

    return json(
      {
        answer: parsed.answer ?? "No answer produced.",
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      },
      200
    );
  } catch (err: any) {
    const status = err?.status;
    const msg =
      status === 429
        ? "Rate limit reached — try again in a moment."
        : status === 401
          ? "Tango AI auth failed — check ANTHROPIC_API_KEY."
          : err?.message || "Unknown error";
    return json({ error: msg }, 200);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
