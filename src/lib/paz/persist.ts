import { useEffect, useRef, useState } from "react";

// localStorage-backed state — survives tab navigation (component unmount) and
// full page refresh. Large values are dropped silently if the quota is hit.
export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const storageKey = `paz:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const s = localStorage.getItem(storageKey);
      return s !== null ? (JSON.parse(s) as T) : initial;
    } catch {
      return initial;
    }
  });

  const first = useRef(true);
  useEffect(() => {
    // Skip the very first run so we don't rewrite what we just read.
    if (first.current) { first.current = false; return; }
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // quota exceeded / non-serializable — leave prior value in storage
    }
  }, [storageKey, value]);

  return [value, setValue];
}

// Read a persisted value without subscribing (for cross-tab dataset access).
export function readPersisted<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(`paz:${key}`);
    return s !== null ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

// Remove all persisted keys for a page prefix (used by Clear buttons).
export function clearPersisted(prefix: string) {
  const full = `paz:${prefix}`;
  for (const k of Object.keys(localStorage)) {
    if (k === full || k.startsWith(`${full}:`) || k.startsWith(`${full}.`)) {
      localStorage.removeItem(k);
    }
  }
}
