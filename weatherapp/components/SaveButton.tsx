"use client";

import { Check, Star } from "lucide-react";
import { useSavedCities } from "@/components/SavedCitiesProvider";

export function SaveButton({ slug, cityName, compact = false }: { slug: string; cityName: string; compact?: boolean }) {
  const { saved, toggle } = useSavedCities();
  const active = saved.includes(slug);
  return <button type="button" className={`save-button${active ? " is-saved" : ""}`} aria-pressed={active} aria-label={active ? `Remove ${cityName} from saved cities` : `Save ${cityName}`} title={active ? "Remove from saved" : "Save city"}
    onClick={event => { event.preventDefault(); event.stopPropagation(); toggle(slug); }}>
    {active ? <Check size={18} aria-hidden="true" /> : <Star size={18} aria-hidden="true" />}
    {!compact && <span className="sr-only">{active ? "Saved" : "Save city"}</span>}
  </button>;
}
