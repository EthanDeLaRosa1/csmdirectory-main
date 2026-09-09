import { useCallback, useEffect, useState } from "react";
import { DEPARTMENTS, GLOSSARY_SHEET_URL } from "@/data/directory";

export type LinkEntry = {
  id: string;
  name: string;
  deptId: string;
  url: string;
  notes: string;
  by: string;
  date: string;
  pinned?: boolean;
};

export type FeedbackEntry = {
  id: string;
  name: string;
  topic: string;
  urgency: "Low" | "Medium" | "High";
  notes: string;
  date: string;
};

export const GLOSSARY_CATEGORIES = [
  "Acronym",
  "Copado Product",
  "Competitor",
  "Process",
  "Salesforce / Ecosystem",
] as const;

export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export type GlossaryEntry = {
  id: string;
  term: string;
  definition: string;
  category: GlossaryCategory;
  by: string;
  date: string;
};

const LINKS_KEY = "csm-directory-links-v1";
const FEEDBACK_KEY = "csm-directory-feedback-v1";
const GLOSSARY_KEY = "csm-directory-glossary-v1";

export const today = () =>
  new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Links already referenced inside the department dataset (intake portals, forms, aliases). */
export function seedLinks(): LinkEntry[] {
  const out: LinkEntry[] = [
    {
      id: "pinned-glossary-sheet",
      name: "Acronyms, Terminology & Competitors (Master Sheet)",
      deptId: "customer-support",
      url: GLOSSARY_SHEET_URL,
      notes:
        "Pinned master Google Sheet of company acronyms, internal terminology, and competitive landscape.",
      by: "Directory source",
      date: "Aug 11, 2026",
      pinned: true,
    },
  ];
  for (const d of DEPARTMENTS) {
    for (const l of d.quickLinks) {
      out.push({
        id: `seed-ql-${d.id}-${l.name}`,
        name: l.name,
        deptId: d.id,
        url: l.url,
        notes: l.description,
        by: "Directory source",
        date: d.updated,
      });
    }
  }
  return out;
}

export function seedGlossary(): GlossaryEntry[] {
  const base: [string, string, GlossaryCategory][] = [
    ["CDR", "Customer Development Representative — the internal owner of the success relationship.", "Acronym"],
    ["SOW", "Statement of Work — the signed contract required before Professional Services begins work.", "Process"],
    ["TAM", "Technical Account Manager — contract-tier-dependent deep technical advisory.", "Acronym"],
    ["APO", "Account Primary Owner — the Salesforce field identifying the assigned AE.", "Acronym"],
    ["RCA", "Root Cause Analysis — post-incident report; P1 RCAs post to the Copado Status page.", "Acronym"],
    ["DPA", "Data Processing Agreement — GDPR/data privacy contract handled by Legal via the AE.", "Acronym"],
    ["CRT", "Copado Robotic Testing — automated testing product with its own support widget/alias.", "Copado Product"],
    ["CCE", "Customer & Community Engineering — owns the master Known Issues report.", "Acronym"],
    ["OTC", "Order to Cash — the Finance function handling invoicing and collections.", "Acronym"],
    ["Agentia™", "Copado's AI agent product line; advanced feature requests route to Anu Jethi.", "Copado Product"],
    ["Gearset", "Salesforce DevOps competitor focused on comparison-based deployments.", "Competitor"],
    ["Flosum", "Native Salesforce DevOps competitor emphasizing 100% on-platform architecture.", "Competitor"],
    ["AutoRABIT", "Salesforce DevOps and data backup competitor.", "Competitor"],
    ["Metadata", "Salesforce configuration components moved between orgs during deployments.", "Salesforce / Ecosystem"],
    ["GovCloud", "Isolated government-compliant environment requested through Infrastructure.", "Process"],
  ];
  return base.map(([term, definition, category], i) => ({
    id: `seed-term-${i}`,
    term,
    definition,
    category,
    by: "Directory source",
    date: "Aug 11, 2026",
  }));
}

function useLocalList<T>(key: string, seed: T[]) {
  const [items, setItems] = useState<T[]>(seed);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setItems(JSON.parse(raw) as T[]);
    } catch {
      /* ignore */
    }
  }, [key]);

  const save = useCallback(
    (next: T[]) => {
      setItems(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return [items, save] as const;
}

export function useLinkBank() {
  const [links, save] = useLocalList<LinkEntry>(LINKS_KEY, seedLinks());
  return {
    links,
    addLink: (l: Omit<LinkEntry, "id">) =>
      save([{ ...l, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, ...links]),
    removeLink: (id: string) => save(links.filter((l) => l.id !== id)),
  };
}

export function useFeedback() {
  const [feedback, save] = useLocalList<FeedbackEntry>(FEEDBACK_KEY, []);
  return {
    feedback,
    addFeedback: (f: Omit<FeedbackEntry, "id">) =>
      save([{ ...f, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, ...feedback]),
    removeFeedback: (id: string) => save(feedback.filter((f) => f.id !== id)),
  };
}

export function useGlossary() {
  const [terms, save] = useLocalList<GlossaryEntry>(GLOSSARY_KEY, seedGlossary());
  return {
    terms,
    addTerm: (t: Omit<GlossaryEntry, "id">) =>
      save([{ ...t, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, ...terms]),
    removeTerm: (id: string) => save(terms.filter((t) => t.id !== id)),
  };
}
