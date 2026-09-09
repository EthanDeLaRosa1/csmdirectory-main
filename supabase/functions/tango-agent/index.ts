// Tango AI agent — account mapping & cross-source exploration.
// Claude (claude-opus-4-8) runs a tool-use loop with live access to Salesforce,
// Gong, and Supabase, cross-references the data, and returns an account map.
//
// Supports two response modes:
//   - stream: true  → text/event-stream (SSE) of the exploration as it happens
//   - default       → single JSON blob with the final report + tool log

import Anthropic from "npm:@anthropic-ai/sdk";
import { getSalesforceAccessToken, runSoql, describeObject } from "../_shared/salesforce.ts";
import { gongAuthHeader, gongSearch } from "../_shared/gong.ts";
import { querySupabase, ALLOWED_TABLES, type Filter } from "../_shared/db.ts";
import { getAnthropicKey, AI_KEY_NAMES } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-opus-4-8";
const MAX_ITERATIONS = 12;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…[truncated]" : s;
}

const SYSTEM_PROMPT = `You are Tango AI, an account-mapping and cross-source research agent for a Customer Success / Sales team.

You have live read access to three data sources via tools:
1. salesforce_soql — run read-only SOQL. Useful objects: Account, Contact, Opportunity, Case, Task, EmailMessage, and EBSTA scoring objects (Account_Ebsta_Score__c, Contact_Ebsta_Score__c, Opportunity_Ebsta_Score__c). Filter accounts with "WHERE Account.Name LIKE '%Name%'". If a field or object name errors, read the error and adjust.
2. gong_search — find and read Gong call transcripts for an account (by name + email domains).
3. supabase_query — read app tables (${ALLOWED_TABLES.join(", ")}). support_cases holds synced support cases.

Prioritise the LIVE sources — Salesforce and Gong — to gather first-hand data. Use supabase_query only as a supplement (e.g. synced support_cases) when it adds something the live sources don't.

Your job: given an account (or question), gather from the relevant sources, then CROSS-REFERENCE:
- Match contacts across Salesforce, Gong call participants, and support-case contacts.
- Reconcile email domains to identify the account's people.
- Correlate open cases, opportunity stages, EBSTA engagement scores, and call themes.

As you work, briefly narrate what you are about to check before each tool call (one short sentence) so the user can follow along.

Work efficiently: a few well-chosen queries per source, not dozens. When you have enough, STOP calling tools and write the final report.

Final report format (markdown):
## <Account> — Account Map
**Summary:** 2-3 sentences on account health and key finding.
### Stakeholders
Table: Name | Title | Role/Signal | Sources (SF/Gong/Cases) | Engagement
### Opportunities & Cases
Open opps (stage) and notable open/recent cases.
### Call & Engagement Themes
What Gong calls and emails reveal.
### Cross-Source Notes
Where sources agree/conflict, and gaps.
Never invent data. If a source returns nothing, say so.`;

const tools = [
  {
    name: "salesforce_soql",
    description: "Run a read-only Salesforce SOQL SELECT query. Returns up to ~50 records (fields you SELECT).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { soql: { type: "string", description: "A SOQL SELECT query. Add LIMIT (<=50)." } },
      required: ["soql"],
    },
  },
  {
    name: "salesforce_describe",
    description: "List the fields (name, label, type) of a Salesforce sObject. Use this to confirm field names before writing SOQL (metadata over memory).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { object: { type: "string", description: "sObject API name, e.g. Case, Contact, Opportunity" } },
      required: ["object"],
    },
  },
  {
    name: "gong_search",
    description: "Find Gong calls for an account and return transcript snippets. Provide the account name and, if known, email domains to match participants.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        accountName: { type: "string" },
        domains: { type: "array", items: { type: "string" }, description: "Email domains, e.g. ['acme.com']" },
        daysBack: { type: "number", description: "Lookback window in days (default 365, max 1460)" },
      },
      required: ["accountName"],
    },
  },
  {
    name: "supabase_query",
    description: `Query an app Postgres table. Allowed tables: ${ALLOWED_TABLES.join(", ")}. support_cases has account_name, subject, status, description, contact_email, case_owner, date_opened.`,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        table: { type: "string", enum: ALLOWED_TABLES as unknown as string[] },
        filters: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              column: { type: "string" },
              op: { type: "string", enum: ["eq", "ilike", "gte", "lte", "gt", "lt", "neq"] },
              value: { type: "string" },
            },
            required: ["column", "op", "value"],
          },
        },
        limit: { type: "number" },
      },
      required: ["table"],
    },
  },
];

function makeExecutor() {
  let sfAuth: Awaited<ReturnType<typeof getSalesforceAccessToken>> | null = null;

  return async function execute(name: string, input: any): Promise<{ text: string; summary: string }> {
    if (name === "salesforce_soql") {
      if (!sfAuth) sfAuth = await getSalesforceAccessToken();
      const { records, error } = await runSoql(sfAuth, String(input.soql || ""));
      if (error) return { text: `ERROR: ${error}`, summary: `SOQL error: ${truncate(error, 80)}` };
      return { text: truncate(JSON.stringify(records.slice(0, 50)), 6000), summary: `${records.length} record(s)` };
    }

    if (name === "salesforce_describe") {
      if (!sfAuth) sfAuth = await getSalesforceAccessToken();
      const { fields, error } = await describeObject(sfAuth, String(input.object || ""));
      if (error) return { text: `ERROR: ${error}`, summary: `describe error: ${truncate(error, 80)}` };
      return { text: truncate(JSON.stringify(fields), 6000), summary: `${input.object}: ${fields.length} field(s)` };
    }

    if (name === "gong_search") {
      const authHeader = gongAuthHeader();
      if (!authHeader) return { text: "ERROR: Gong not configured.", summary: "Gong not configured" };
      const domains = Array.isArray(input.domains) ? input.domains.map((d: any) => String(d)) : [];
      const daysBack = Math.min(Number(input.daysBack) || 365, 1460);
      const { transcripts, status, error } = await gongSearch(String(input.accountName || ""), domains, daysBack, authHeader);
      if (error && transcripts.length === 0) return { text: `ERROR (${status}): ${error}`, summary: `Gong error ${status}` };
      const slim = transcripts.map((t) => ({ title: t.title, parties: t.parties, excerpt: truncate(t.text, 800) }));
      return { text: truncate(JSON.stringify(slim), 8000), summary: `${transcripts.length} transcript(s)` };
    }

    if (name === "supabase_query") {
      const { rows, error } = await querySupabase(
        String(input.table || ""),
        (input.filters || []) as Filter[],
        Number(input.limit) || 100,
      );
      if (error) return { text: `ERROR: ${error}`, summary: `DB error: ${truncate(error, 80)}` };
      return { text: truncate(JSON.stringify(rows), 6000), summary: `${input.table} → ${rows.length} row(s)` };
    }

    return { text: `ERROR: unknown tool ${name}`, summary: `unknown tool ${name}` };
  };
}

type AgentEvent =
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "tool_call"; tool: string; input: any }
  | { type: "tool_result"; tool: string; summary: string }
  | { type: "report"; report: string }
  | { type: "done"; iterations: number; model: string }
  | { type: "error"; message: string };

// Runs the agent loop, emitting live events. Returns the final state.
async function runAgent(
  client: any,
  task: string,
  emit: (e: AgentEvent) => void,
): Promise<{ report: string; toolLog: { tool: string; input: any; summary: string }[]; iterations: number }> {
  const execute = makeExecutor();
  const messages: any[] = [{ role: "user", content: task }];
  const toolLog: { tool: string; input: any; summary: string }[] = [];
  let report = "";
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;
    emit({ type: "status", message: `Reasoning (step ${iterations})…` });

    // Stream the model turn so narration appears live.
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      tools,
      messages,
    });

    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        emit({ type: "delta", text: ev.delta.text });
      }
    }

    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") {
      report = "Tango AI declined this request.";
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const textNow = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    if (textNow) report = textNow;

    const toolUses = response.content.filter((b: any) => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const toolResults: any[] = [];
    for (const tu of toolUses as any[]) {
      emit({ type: "tool_call", tool: tu.name, input: tu.input });
      const { text, summary } = await execute(tu.name, tu.input);
      toolLog.push({ tool: tu.name, input: tu.input, summary });
      emit({ type: "tool_result", tool: tu.name, summary });
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: text });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { report, toolLog, iterations };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const accountName = body.accountName;
    const question = body.question;
    const wantStream = body.stream === true;
    const task = String(question || (accountName ? `Map the account "${accountName}".` : "")).trim();
    if (!task) return json({ error: "accountName or question is required" }, 400);

    const apiKey = getAnthropicKey();
    if (!apiKey) {
      return json({ error: `Tango AI key not found. Set one of: ${AI_KEY_NAMES.join(", ")}` }, 200);
    }

    const client = new Anthropic({ apiKey });

    if (!wantStream) {
      const { report, toolLog, iterations } = await runAgent(client, task, () => {});
      return json({ report, toolLog, iterations, model: MODEL }, 200);
    }

    // Streaming (SSE) path.
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const emit = (e: AgentEvent) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
          } catch {
            // controller already closed (client disconnected)
          }
        };
        try {
          const { report, iterations } = await runAgent(client, task, emit);
          emit({ type: "report", report });
          emit({ type: "done", iterations, model: MODEL });
        } catch (err: any) {
          const status = err?.status;
          const msg =
            status === 429 ? "Rate limit reached — try again shortly."
              : status === 401 ? "Auth failed — check ANTHROPIC_API_KEY."
                : err?.message || "Unknown error";
          emit({ type: "error", message: msg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return json({ error: err?.message || "Unknown error" }, 200);
  }
});
