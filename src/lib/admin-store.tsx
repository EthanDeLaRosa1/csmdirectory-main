import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Role-based access control for the directory.
 * Default state is CSM read-only; a 4-digit PIN unlocks admin editing.
 * The unlock flag persists in localStorage (session convenience only —
 * this is an internal-tool guard rail, not a security boundary).
 */
const ADMIN_PIN = "2026";
const KEY = "csm-directory-admin-v1";

type AdminValue = {
  isAdmin: boolean;
  lock: () => void;
  unlock: (pin: string) => boolean;
  /** Runs `action` when admin, otherwise opens the PIN prompt and runs it after unlocking. */
  requireAdmin: (action: () => void) => void;
  promptOpen: boolean;
  setPromptOpen: (open: boolean) => void;
  resolvePrompt: () => void;
};

const Ctx = createContext<AdminValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "1") setIsAdmin(true);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const unlock = useCallback((pin: string) => {
    if (pin.trim() !== ADMIN_PIN) return false;
    setIsAdmin(true);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  }, []);

  const lock = useCallback(() => {
    setIsAdmin(false);
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<AdminValue>(
    () => ({
      isAdmin,
      lock,
      unlock,
      promptOpen,
      setPromptOpen,
      requireAdmin: (action) => {
        if (isAdmin) {
          action();
          return;
        }
        setPending(() => action);
        setPromptOpen(true);
      },
      resolvePrompt: () => {
        setPromptOpen(false);
        if (pending) {
          const run = pending;
          setPending(null);
          run();
        }
      },
    }),
    [isAdmin, lock, unlock, promptOpen, pending],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
