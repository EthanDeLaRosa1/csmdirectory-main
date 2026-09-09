// Supabase (Postgres) access (Node port). Allowlisted read-only table queries.
import { createClient } from "@supabase/supabase-js";

export const ALLOWED_TABLES = [
  "support_cases", "csmu_guides", "link_bank", "feedback", "feedback_comments", "directory_state",
];

export function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase URL / service role key missing in paz.env");
  return createClient(url, key);
}

export async function querySupabase(table, filters = [], limit = 100) {
  if (!ALLOWED_TABLES.includes(table)) {
    return { rows: [], error: `Table '${table}' is not allowed. Allowed: ${ALLOWED_TABLES.join(", ")}` };
  }
  const supabase = getServiceClient();
  let q = supabase.from(table).select("*").limit(Math.min(Math.max(1, limit), 500));
  for (const f of filters) {
    const val = f.op === "ilike" ? `%${f.value}%` : f.value;
    switch (f.op) {
      case "eq": q = q.eq(f.column, val); break;
      case "neq": q = q.neq(f.column, val); break;
      case "ilike": q = q.ilike(f.column, String(val)); break;
      case "gte": q = q.gte(f.column, val); break;
      case "lte": q = q.lte(f.column, val); break;
      case "gt": q = q.gt(f.column, val); break;
      case "lt": q = q.lt(f.column, val); break;
    }
  }
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return { rows: data || [], error: null };
}

export function getAnthropicKey() {
  const names = [
    "ANTHROPIC_API_KEY", "TANGO_AI_API_KEY", "TANGO_AI_KEY", "TANGO_API_KEY",
    "TANGOAI_API_KEY", "CLAUDE_API_KEY", "ANTHROPIC_AUTH_TOKEN",
  ];
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return null;
}
export const AI_KEY_NAMES = [
  "ANTHROPIC_API_KEY", "TANGO_AI_API_KEY", "TANGO_API_KEY", "CLAUDE_API_KEY", "ANTHROPIC_AUTH_TOKEN",
];
