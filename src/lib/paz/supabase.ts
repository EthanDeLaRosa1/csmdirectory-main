import { createClient } from "@supabase/supabase-js";

// Values injected at build time from repo-root paz.env (see vite.config.ts).
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Surfaced loudly so a missing paz.env is obvious during dev.
  console.error("[paz-portal] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Check paz.env at repo root.");
}

export const supabase = createClient(url, anonKey);
