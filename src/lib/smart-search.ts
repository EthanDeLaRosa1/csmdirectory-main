import { DEPARTMENTS, type Department } from "@/data/directory";

export type SectionId =
  | "sec-triggers"
  | "sec-scope"
  | "sec-intake"
  | "sec-contacts"
  | "sec-sla"
  | "sec-escalation";

export type SmartHit = {
  dept: Department;
  section: SectionId;
  kind: string;
  text: string;
  score: number;
};

const STOP = new Set([
  "the","a","an","for","to","of","and","or","is","are","do","does","i","we","my","our",
  "customer","customers","need","needs","needed","who","what","where","how","with","on",
  "in","it","this","that","should","can","help","please","about","from","get","go","when",
  "there","their","have","has","was","asking","asks","ask","us","me","you","your","report",
]);

/** phrase -> extra keywords that should light up the right department */
const SYNONYMS: Record<string, string[]> = {
  "soc 2": ["security", "compliance", "questionnaire", "trust portal"],
  soc2: ["security", "questionnaire"],
  pentest: ["security", "vulnerability"],
  penetration: ["security", "vulnerability"],
  gdpr: ["dpa", "legal", "data processing"],
  dpa: ["legal", "data processing agreement"],
  nda: ["legal"],
  invoice: ["finance", "billing"],
  refund: ["finance", "billing"],
  "purchase order": ["finance", "billing"],
  renewal: ["sales", "ae", "contract"],
  upsell: ["sales", "ae"],
  pricing: ["sales", "ae"],
  quote: ["sales", "ae"],
  sow: ["professional services", "statement of work"],
  scoping: ["professional services", "sow"],
  migration: ["professional services"],
  roadmap: ["product management", "feature request"],
  feature: ["product management", "feature request"],
  "known issue": ["product management"],
  logs: ["infrastructure", "log retention", "14 days"],
  log: ["infrastructure", "log retention"],
  govcloud: ["infrastructure"],
  backend: ["infrastructure"],
  outage: ["support", "p1"],
  down: ["support", "p1", "critical"],
  bug: ["support", "troubleshooting"],
  sla: ["support", "priority"],
  architecture: ["tam", "technical account"],
  enablement: ["tam"],
};

function tokenize(q: string) {
  const lower = q.toLowerCase();
  const extra = Object.entries(SYNONYMS)
    .filter(([k]) => lower.includes(k))
    .flatMap(([, v]) => v);
  const words = [...lower.split(/[^a-z0-9+#@./]+/), ...extra.flatMap((e) => e.split(" "))]
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP.has(w));
  return Array.from(new Set(words));
}

function scoreLine(text: string, tokens: string[], phrase: string) {
  const lower = text.toLowerCase();
  let score = 0;
  if (phrase.length > 2 && lower.includes(phrase)) score += 6;
  for (const t of tokens) if (lower.includes(t)) score += t.length > 4 ? 2 : 1;
  return score;
}

export function smartSearch(query: string, departments: Department[] = DEPARTMENTS): SmartHit[] {
  const phrase = query.trim().toLowerCase();
  if (!phrase) return [];
  const tokens = tokenize(phrase);
  if (!tokens.length) return [];

  const hits: SmartHit[] = [];
  for (const dept of departments) {
    const lines: { section: SectionId; kind: string; text: string; boost?: number }[] = [
      { section: "sec-triggers", kind: "Trigger", text: dept.name, boost: 2 },
      ...dept.triggers.map((t) => ({ section: "sec-triggers" as const, kind: "Trigger", text: t })),
      ...dept.outOfScope.map((o) => ({
        section: "sec-scope" as const,
        kind: "Out of scope",
        text: `${o.need} → ${o.goTo}`,
      })),
      ...dept.contacts.map((c) => ({
        section: "sec-contacts" as const,
        kind: "Contact",
        text: `${c.label}: ${c.value}`,
      })),
      ...(dept.intake.steps ?? []).map((s) => ({
        section: "sec-intake" as const,
        kind: "Intake",
        text: s,
      })),
      ...(dept.intake.bullets ?? []).map((s) => ({
        section: "sec-intake" as const,
        kind: "Intake",
        text: s,
      })),
      ...dept.escalation.map((e) => ({
        section: "sec-escalation" as const,
        kind: e.level,
        text: `${e.who} — ${e.when}`,
      })),
      ...(dept.criticalRule
        ? [
            {
              section: "sec-triggers" as const,
              kind: "Critical rule",
              text: dept.criticalRule.title,
            },
          ]
        : []),
    ];

    for (const l of lines) {
      const score = scoreLine(l.text, tokens, phrase) * (l.boost ?? 1);
      if (score > 0) hits.push({ dept, section: l.section, kind: l.kind, text: l.text, score });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 12);
}
