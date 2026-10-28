"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

type SavedContext = { saved: string[]; toggle: (slug: string) => void; remove: (slug: string) => void };
const Context = createContext<SavedContext | null>(null);
const KEY = "savedCities";
const EMPTY: string[] = [];
let previousRaw: string | null = null;
let previousSnapshot: string[] = EMPTY;

function getSnapshot() {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { return previousSnapshot; }
  if (raw === previousRaw) return previousSnapshot;
  previousRaw = raw;
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    previousSnapshot = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : EMPTY;
  } catch { previousSnapshot = EMPTY; }
  return previousSnapshot;
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("saved-cities-change", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("saved-cities-change", listener); };
}

export function SavedCitiesProvider({ children }: { children: React.ReactNode }) {
  const saved = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const update = useCallback((next: string[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Private browsing may disable storage. */ }
    window.dispatchEvent(new Event("saved-cities-change"));
  }, []);
  const toggle = useCallback((slug: string) => update(saved.includes(slug) ? saved.filter(item => item !== slug) : [...saved, slug]), [saved, update]);
  const remove = useCallback((slug: string) => update(saved.filter(item => item !== slug)), [saved, update]);
  const value = useMemo(() => ({ saved, toggle, remove }), [saved, toggle, remove]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSavedCities() {
  const context = useContext(Context);
  if (!context) throw new Error("useSavedCities must be used inside SavedCitiesProvider");
  return context;
}
