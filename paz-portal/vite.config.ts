import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load shared keys from the repo-root paz.env (single source of truth for secrets).
function loadPazEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(__dirname, "..", "paz.env"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

const paz = loadPazEnv();

export default defineConfig({
  plugins: [react()],
  server: { port: 5273 },
  // Expose only the browser-safe values (URL + anon key). Never the service role key.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(paz.VITE_SUPABASE_URL || ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(paz.VITE_SUPABASE_ANON_KEY || ""),
    // Local Node API base. Defaults on; set VITE_LOCAL_API="" in paz.env to use
    // deployed Supabase functions instead.
    "import.meta.env.VITE_LOCAL_API": JSON.stringify(
      paz.VITE_LOCAL_API !== undefined ? paz.VITE_LOCAL_API : "http://localhost:8787",
    ),
  },
});
