"use client";

import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, ChevronDown, SlidersHorizontal } from "lucide-react";
import { CityCard } from "@/components/CityCard";
import { useSavedCities } from "@/components/SavedCitiesProvider";
import type { City } from "@/lib/data";

function CityGrid({ items }: { items: City[] }) { return <div className="city-grid">{items.map(city => <CityCard key={city.slug} city={city} />)}</div>; }

export function HomeDashboard({ cities, error, localFallback }: { cities: City[]; error: string | null; localFallback: boolean }) {
  const [worstCount, setWorstCount] = useState(4);
  const [bestCount, setBestCount] = useState(4);
  const [sort, setSort] = useState("worst");
  const [state, setState] = useState("all");
  const { saved } = useSavedCities();
  const ranked = useMemo(() => cities.filter(city => city.latest?.aqi !== null && city.latest?.aqi !== undefined), [cities]);
  const worst = useMemo(() => [...ranked].sort((a,b) => (b.latest?.aqi ?? -1) - (a.latest?.aqi ?? -1)), [ranked]);
  const best = useMemo(() => [...ranked].sort((a,b) => (a.latest?.aqi ?? Infinity) - (b.latest?.aqi ?? Infinity)), [ranked]);
  const states = useMemo(() => [...new Set(cities.map(city => city.state))].sort(), [cities]);
  const allCities = useMemo(() => {
    const list = cities.filter(city => state === "all" || city.state === state);
    return list.sort((a,b) => {
      if (sort === "az") return a.name.localeCompare(b.name);
      if (sort === "saved") return Number(saved.includes(b.slug))-Number(saved.includes(a.slug)) || a.name.localeCompare(b.name);
      const diff = (a.latest?.aqi ?? (sort === "best" ? Infinity : -Infinity)) - (b.latest?.aqi ?? (sort === "best" ? Infinity : -Infinity));
      return sort === "best" ? diff : -diff;
    });
  }, [cities, sort, state, saved]);
  const lastUpdate = cities.map(city => city.latest?.recorded_at).filter((v): v is string => !!v).sort().at(-1);

  return <main id="main-content" className="page-main">
    <div className="page-container">
      <section className="welcome-row">
        <div><p className="page-kicker">United States · Live conditions</p><h1>Air quality across US cities</h1><p className="page-lede">A clear view of the air and weather around the places you care about.</p></div>
        <div className="update-panel"><span className="status-dot" aria-hidden="true" /><div><strong>{lastUpdate ? "Latest reading" : "Hourly city tracking"}</strong><span>{lastUpdate ? new Date(lastUpdate).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}) : "Readings appear here as sources report them."}</span></div></div>
      </section>
      {localFallback && <div className="notice-panel"><span>Showing the supplied manual recordings. Connect Supabase to load hourly city readings.</span></div>}
      {error && <div className="error-panel" role="alert"><div><strong>City readings could not load.</strong><span>{error}</span></div><button className="button secondary" onClick={() => window.location.reload()}>Try again</button></div>}

      <section className="rank-section" aria-labelledby="worst-heading">
        <div className="section-heading"><div className="section-icon warning-icon"><ArrowDownWideNarrow size={20} aria-hidden="true" /></div><div><h2 id="worst-heading">Worst air quality</h2><p>Places with the highest recorded AQI.</p></div></div>
        {worst.length ? <><CityGrid items={worst.slice(0,worstCount)} />{worstCount < worst.length && <button className="button secondary load-button" onClick={() => setWorstCount(value => value+4)}>Load more cities <ChevronDown size={16} /></button>}</> : <div className="empty-panel"><strong>No ranked readings yet</strong><span>Current AQI readings will appear here when a monitor reports data.</span></div>}
      </section>

      <section className="rank-section" aria-labelledby="best-heading">
        <div className="section-heading"><div className="section-icon clean-icon"><ArrowUpWideNarrow size={20} aria-hidden="true" /></div><div><h2 id="best-heading">Best air quality</h2><p>Places with the lowest recorded AQI.</p></div></div>
        {best.length ? <><CityGrid items={best.slice(0,bestCount)} />{bestCount < best.length && <button className="button secondary load-button" onClick={() => setBestCount(value => value+4)}>Load more cities <ChevronDown size={16} /></button>}</> : <div className="empty-panel"><strong>No ranked readings yet</strong><span>Current AQI readings will appear here when a monitor reports data.</span></div>}
      </section>

      <section className="all-cities-section" aria-labelledby="all-cities-heading">
        <div className="all-cities-top"><div className="section-heading"><div className="section-icon"><SlidersHorizontal size={19} aria-hidden="true" /></div><div><h2 id="all-cities-heading">All cities</h2><p>{allCities.length} tracked locations, with gaps shown as N/A.</p></div></div>
          <div className="filters-row"><label className="select-wrap"><span className="sr-only">Sort cities</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="worst">Worst AQI</option><option value="best">Best AQI</option><option value="az">A–Z</option><option value="saved">Saved first</option></select><ChevronDown size={15} /></label><label className="select-wrap"><span className="sr-only">Filter by state</span><select value={state} onChange={event => setState(event.target.value)}><option value="all">All states</option>{states.map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15} /></label></div>
        </div>
        {allCities.length ? <CityGrid items={allCities} /> : <div className="empty-panel"><strong>No cities match this filter.</strong><span>Choose another state to see tracked locations.</span><button className="button secondary" onClick={() => setState("all")}>Show all states</button></div>}
      </section>
      <p className="data-footnote">Air quality readings are preliminary. Nearby monitors may not represent conditions at a specific address.</p>
    </div>
  </main>;
}
