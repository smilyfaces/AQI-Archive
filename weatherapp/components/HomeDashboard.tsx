"use client";

import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ReadingStatus } from "@/components/ReadingStatus";
import { CityCard } from "@/components/CityCard";
import { FilterBar, readFilters } from "@/components/FilterBar";
import { useSavedCities } from "@/components/SavedCitiesProvider";
import type { City } from "@/lib/data";
import { aqiCategories, aqiCategory } from "@/lib/theme";

const stateNames: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const stateName = (code: string) => stateNames[code] ?? code;
const names = new Intl.Collator("en-US");
const subscribeToTimeZone = () => () => {};
const getLocalTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const getServerTimeZone = () => "UTC";

export function HomeDashboard({ cities, error, localFallback }: { cities: City[]; error: string | null; localFallback: boolean }) {
  const params = useSearchParams();
  const filters = readFilters(new URLSearchParams(params.toString()));
  const { saved } = useSavedCities();
  const update = (patch: Partial<typeof filters> | null) => {
    const next = new URLSearchParams(window.location.search);
    const values = patch ?? readFilters(new URLSearchParams());
    for (const [key, value] of Object.entries(values)) {
      const serialized = Array.isArray(value) ? value.join(",") : value === true ? "1" : value;
      if (!serialized || (key === "sort" && serialized === "aqi-asc")) next.delete(key);
      else next.set(key, String(serialized));
    }
    window.history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}${window.location.hash}`);
  };

  const pollutantCounts = new Map<string, number>();
  for (const { latest } of cities) {
    const value = latest?.primary_pollutant;
    if (value) pollutantCounts.set(value, (pollutantCounts.get(value) ?? 0) + 1);
  }
  const pollutant = [...pollutantCounts].sort(([a], [b]) => names.compare(a, b)).map(([value, count]) => ({ value, label: `${value} (${count})` }));
  const state = [...new Set(cities.map(city => city.state))].sort().map(value => ({ value, label: stateName(value) }));
  const region = [...new Set(cities.flatMap(city => city.region ? [city.region] : []))].sort().map(value => ({ value, label: value }));
  const query = filters.q.trim().toLowerCase();
  const items = cities.filter(city => {
    const aqi = city.latest?.aqi ?? null;
    return (!query || `${city.name} ${city.state} ${stateName(city.state)}`.toLowerCase().includes(query))
      && (!filters.state.length || filters.state.includes(city.state))
      && (!filters.region.length || filters.region.includes(city.region ?? ""))
      && (!filters.pollutant.length || filters.pollutant.includes(city.latest?.primary_pollutant ?? ""))
      && (!filters.category.length || filters.category.includes(aqiCategory(aqi).key))
      && (!filters.saved || saved.includes(city.slug))
      && (!filters.readings || city.latest !== null);
  }).sort((a, b) => {
    const missing = Number(a.latest === null) - Number(b.latest === null);
    if (missing) return missing;
    const byName = names.compare(a.name, b.name) || names.compare(a.state, b.state);
    if (filters.sort === "name") return byName;
    if (filters.sort === "state") return names.compare(stateName(a.state), stateName(b.state)) || byName;
    if (filters.sort === "recent") return ((Date.parse(b.latest?.recorded_at ?? "") || 0) - (Date.parse(a.latest?.recorded_at ?? "") || 0)) || byName;
    const missingAqi = Number(a.latest?.aqi == null) - Number(b.latest?.aqi == null);
    if (missingAqi) return missingAqi;
    const difference = (a.latest?.aqi ?? 0) - (b.latest?.aqi ?? 0);
    return (filters.sort === "aqi-desc" ? -difference : difference) || byName;
  });
  const latestCity = cities.reduce<City | undefined>((latest, city) => (
    city.latest && (!latest?.latest || city.latest.recorded_at > latest.latest.recorded_at) ? city : latest
  ), undefined);
  const last = latestCity?.latest?.recorded_at;
  const timeZone = useSyncExternalStore(subscribeToTimeZone, getLocalTimeZone, getServerTimeZone);
  const latestReading = last && new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone,
  }).format(new Date(last));
  const facets = [
    { key: "pollutant", options: pollutant },
    { key: "category", options: aqiCategories.map(({ key, label }) => ({ value: key, label })) },
    { key: "state", options: state },
    { key: "region", options: region },
  ] as const;
  const active = facets.flatMap(({ key, options }) => filters[key].map(value => ({
    key: `${key}:${value}`, label: options.find(option => option.value === value)?.label ?? value,
    remove: () => update({ [key]: filters[key].filter(item => item !== value) }),
  })));
  if (filters.q) active.push({ key: "query", label: filters.q, remove: () => update({ q: "" }) });
  if (filters.saved) active.push({ key: "saved", label: "Saved only", remove: () => update({ saved: false }) });
  if (filters.readings) active.push({ key: "readings", label: "Has reading", remove: () => update({ readings: false }) });

  return (
    <div className="page-container home-directory">
      <header className="directory-heading">
        <h1>Air quality across {cities.length} US cities</h1>
        <p>{last ? <><ReadingStatus recordedAt={last} stale={latestCity?.stale} />Latest reading <time dateTime={last}>{latestReading}</time></> : "No readings yet"}</p>
      </header>
      {error && <p className="error-panel" role="alert">{error}</p>}
      {localFallback && <p className="notice-panel">Showing the supplied manual readings until live data is available.</p>}
      <FilterBar filters={filters} update={update} options={{ pollutant, state, region }} />
      <div className="directory-results">
        <span aria-live="polite">{items.length} of {cities.length} cities</span>
        {active.map(item => <button className="filter-control filter-chip" key={item.key} type="button" onClick={item.remove} aria-label={`Remove filter ${item.label}`}>{item.label} ×</button>)}
        {(active.length > 0 || filters.sort !== "aqi-asc") && <button className="filter-control" type="button" onClick={() => update(null)}>Clear all</button>}
      </div>
      {items.length > 0 ? <div className="city-list">{items.map((city, index) => <CityCard key={city.slug} city={city} priority={index < 2} />)}</div>
        : <div className="empty-panel"><strong>No cities match these filters</strong><button className="filter-control" onClick={() => update(null)}>Clear filters</button></div>}
      <p className="data-footnote">Air quality readings are preliminary. Nearby monitors may not represent conditions at a specific address.</p>
    </div>
  );
}
