import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEPARTMENTS, hasPlaceholder, type Department } from "@/data/directory";
import { supabase } from "@/lib/supabase";

export type DeptOverride = {
  owner?: string;
  contacts?: Record<string, string>;
  /** extra contact rows added by reviewers (slack channels, intake urls, SLAs) */
  extraContacts?: { label: string; value: string }[];
};

export type VerificationRecord = { date: string; by: string };

type StoreState = {
  overrides: Record<string, DeptOverride>;
  verified: Record<string, VerificationRecord>;
  reviewer: string;
};

const EMPTY: StoreState = { overrides: {}, verified: {}, reviewer: "" };
const KEY = "csm-directory-edits-v1";

type StoreValue = {
  state: StoreState;
  reviewer: string;
  setReviewer: (name: string) => void;
  departments: Department[];
  getDepartment: (id: string) => Department;
  saveDepartment: (id: string, override: DeptOverride, reviewer: string) => void;
  resetDepartment: (id: string) => void;
  verificationOf: (d: Department) => VerificationRecord | null;
  unverifiedItems: (d: Department) => string[];
};

const Ctx = createContext<StoreValue | null>(null);

function applyOverride(dept: Department, ov?: DeptOverride): Department {
  if (!ov) return dept;
  return {
    ...dept,
    owner: ov.owner !== undefined ? (ov.owner.trim() ? ov.owner : "") : dept.owner,
    contacts: [
      // base contacts: respect overrides; explicit empty string removes the contact
      ...dept.contacts
        .map((c) => {
          if (!ov.contacts || !(c.label in ov.contacts)) return c;
          const next = ov.contacts[c.label];
          return next && next.trim() ? { ...c, value: next } : null;
        })
        .filter(Boolean) as { label: string; value: string }[],
      // extra contacts appended by reviewers (only include fully populated rows)
      ...(ov.extraContacts ?? []).filter((c) => c.label.trim() && c.value.trim()),
    ],
  };
}

export function unverifiedItemsFor(dept: Department): string[] {
  const contactPlaceholders = dept.contacts
    .filter((c) => hasPlaceholder(c.value))
    .map((c) => `${c.label}: ${c.value}`);

  const ownerPlaceholder = hasPlaceholder(dept.owner) ? [`Entry Owner: ${dept.owner}`] : [];

  // Only consider freeform placeholders if they reference an existing contact label or the owner
  const normalizedLabels = dept.contacts.map((c) => c.label.toLowerCase());
  const placeholdersFiltered = dept.placeholders.filter((p) => {
    if (!hasPlaceholder(p)) return false;
    const text = p.replace(/\[.*?\]/, "").trim().toLowerCase();
    // match if placeholder mentions a known contact label or the word 'owner'
    if (normalizedLabels.some((lbl) => text.includes(lbl))) return true;
    if (dept.owner && String(dept.owner).toLowerCase() && text.includes("owner")) return true;
    return false;
  });

  return [...placeholdersFiltered, ...contactPlaceholders, ...ownerPlaceholder];
}

export function DirectoryStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoreState>(EMPTY);

// Inside DirectoryStoreProvider in src/lib/directory-store.tsx:
useEffect(() => {
  async function loadGlobalState() {
    try {
      const { data, error } = await supabase
        .from("directory_state")
        .select("state")
        .eq("id", "global_state")
        .maybeSingle(); // <-- CHANGED FROM .single() TO .maybeSingle()

      if (data?.state && !error) {
        setState({ ...EMPTY, ...(data.state as StoreState) });
        window.localStorage.setItem(KEY, JSON.stringify(data.state));
        return;
      }
    } catch (e) {
      console.warn("Could not load from Supabase, loading local state:", e);
    }

    // Fallback to local storage
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setState({ ...EMPTY, ...(JSON.parse(raw) as StoreState) });
    } catch {
      /* storage unavailable */
    }
  }

  loadGlobalState();
}, []);

  // Save to both LocalStorage and Supabase globally
  const persist = useCallback((next: StoreState) => {
    setState(next);

    // Save locally
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }

    // Save to Supabase for all CSMs
    supabase
      .from("directory_state")
      .upsert({ id: "global_state", state: next, updated_at: new Date().toISOString() })
      .then(({ error }) => {
        if (error) console.error("Error syncing with Supabase:", error);
      });
  }, []);

  const value = useMemo<StoreValue>(() => {
    const departments = DEPARTMENTS.map((d) => applyOverride(d, state.overrides[d.id]));
    const byId = new Map(departments.map((d) => [d.id, d]));

    return {
      state,
      reviewer: state.reviewer,
      setReviewer: (name) => persist({ ...state, reviewer: name }),
      departments,
      getDepartment: (id) => byId.get(id) ?? departments[0]!,
      saveDepartment: (id, override, reviewer) => {
        const merged: DeptOverride = {
          ...state.overrides[id],
          ...override,
          contacts: { ...state.overrides[id]?.contacts, ...override.contacts },
        };
        const base = DEPARTMENTS.find((d) => d.id === id)!;
        const resolved = applyOverride(base, merged);
        const stillUnverified = unverifiedItemsFor(resolved).length > 0;
        const verified = { ...state.verified };
        if (stillUnverified) {
          delete verified[id];
        } else {
          verified[id] = {
            date: new Date().toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
            by: reviewer.trim() || "Reviewer",
          };
        }
        persist({
          ...state,
          reviewer: reviewer.trim() || state.reviewer,
          overrides: { ...state.overrides, [id]: merged },
          verified,
        });
      },
      resetDepartment: (id) => {
        const overrides = { ...state.overrides };
        const verified = { ...state.verified };
        delete overrides[id];
        delete verified[id];
        persist({ ...state, overrides, verified });
      },
      verificationOf: (d) => state.verified[d.id] ?? null,
      unverifiedItems: unverifiedItemsFor,
    };
  }, [state, persist]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDirectoryStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDirectoryStore must be used inside DirectoryStoreProvider");
  return ctx;
}