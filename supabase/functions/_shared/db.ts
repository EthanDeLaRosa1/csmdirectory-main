// Shared Supabase (Postgres) access: allowlisted, read-only table queries.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Only these tables may be queried by Tango AI / reporting.
export const ALLOWED_TABLES = [
  "support_cases",
  "csmu_guides",
  "link_bank",
  "feedback",
  "feedback_comments",
  "directory_state",
] as const;

export type Filter = {
  column: string;
  op: "eq" | "ilike" | "gte" | "lte" | "gt" | "lt" | "neq";
  value: string | number;
};

export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Supabase environment variables are missing");
  return createClient(url, key);
}

export async function querySupabase(
  table: string,
  filters: Filter[] = [],
  limit = 100,
): Promise<{ rows: any[]; error: string | null }> {
  if (!ALLOWED_TABLES.includes(table as any)) {
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
