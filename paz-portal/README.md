# Paz Portal

Data-collection, cross-referencing & reporting portal over **Salesforce + Gong +
Supabase**, driven by **Tango AI** (Claude API, `claude-opus-4-8`).

Three modes:

1. **Account Mapping** — Tango AI runs an agentic tool-use loop: it queries
   Salesforce, Gong, and Supabase live, cross-references contacts/domains, and
   returns a stakeholder map. Shows the exploration path (which sources it hit).
2. **Cross-Source Report** — deterministic pull from the selected sources for an
   account + a joined *people* cross-reference (who appears in SF vs Gong vs
   cases), with per-source tabs and CSV export.
3. **Collect** — raw briefcase (SF cases + EBSTA + Gong) + Q&A over it.

## How it works

```
paz-portal (Vite/React SPA)
   │  invoke("tango-agent")        → Claude tool-use loop (agentic mapping)
   │  invoke("cross-source-query") → deterministic SF+Gong+Supabase join
   │  invoke("gong-it")            → SF cases + EBSTA + Gong briefcase
   │  invoke("paz-research")       → Claude Q&A over a collected briefcase
   ▼
Supabase Edge Functions (../supabase/functions)
   ├─ _shared/salesforce.ts  → refresh-token auth + read-only SOQL runner
   ├─ _shared/gong.ts        → bounded Gong call/transcript search
   └─ _shared/db.ts          → allowlisted read-only Supabase table queries
```

- Tango AI's three tools (`salesforce_soql`, `gong_search`, `supabase_query`)
  all run **server-side** in `tango-agent`; the Claude API key never reaches the
  browser. SOQL is SELECT-only; Supabase queries are table-allowlisted.
- Salesforce connection is **reused** from the tangoAI platform's existing
  Supabase secrets (`SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_REFRESH_TOKEN`).
- Config (Supabase URL + anon key) is loaded from the repo-root **`paz.env`** at
  build time — see `vite.config.ts`. No separate `.env` to maintain.

## Run

```bash
cd paz-portal
npm install
npm run dev      # http://localhost:5273
npm run build    # typecheck + production build
```

## Deploy the edge functions

`paz-research` is new and must be deployed; `gong-it` was updated (Gong speed fix).

```bash
# from repo root
supabase functions deploy gong-it
supabase functions deploy paz-research
supabase functions deploy tango-agent
supabase functions deploy cross-source-query
```

Required Supabase secrets:

| Secret | Used by |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | gong-it, tango-agent, cross-source-query |
| `GONG_ACCESS_KEY`, `GONG_SECRET_KEY` | gong-it, tango-agent, cross-source-query |
| `SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_REFRESH_TOKEN` | Salesforce — gong-it, tango-agent, cross-source-query |
| Tango AI key (Claude) — paz-research, tango-agent | resolved from the first set of: `ANTHROPIC_API_KEY`, `TANGO_AI_API_KEY`, `TANGO_AI_KEY`, `TANGO_API_KEY`, `TANGOAI_API_KEY`, `CLAUDE_API_KEY`, `ANTHROPIC_AUTH_TOKEN` (see `_shared/ai.ts`) |

Set with `supabase secrets set KEY=value` (values are in `paz.env`).

## Gong speed fix (gong-it)

Old code paged through the org's **entire** call history when an account had few
matches → timeouts. Now bounded:

- `MAX_CALL_PAGES = 20` — caps worst-case scan (~2000 calls).
- `GONG_PAGE_DELAY_MS = 350` — stays under Gong's ~3 req/s limit (old 150ms
  triggered 429s).
- 429 → exponential backoff + retry same cursor (old code bailed, losing results).
