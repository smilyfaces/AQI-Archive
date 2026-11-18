"use client";

import { useId, useRef, useState } from "react";
import { aqiCategories } from "@/lib/theme";

export const sortOptions = {
  "aqi-asc": "Best to worst AQI",
  "aqi-desc": "Worst to best AQI",
  name: "City name A–Z",
  state: "State A–Z",
  recent: "Recently updated",
};

export function readFilters(params: URLSearchParams) {
  const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
  return {
    q: params.get("q") ?? "",
    sort: params.get("sort") ?? "aqi-asc",
    pollutant: list("pollutant"),
    category: list("category"),
    state: list("state"),
    region: list("region"),
    saved: params.get("saved") === "1",
    readings: params.get("readings") === "1",
  };
}

type Filters = ReturnType<typeof readFilters>;
type Option = { value: string; label: string; color?: string };
type Facets = Record<"pollutant" | "category" | "state" | "region", Option[]>;
const facetNames = { pollutant: "Primary pollutant", category: "AQI category", state: "State", region: "Region" };

export function FilterBar({ filters, update, options }: {
  filters: Filters;
  update: (patch: Partial<Filters> | null) => void;
  options: Omit<Facets, "category">;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(filters);
  const id = useId();
  const facets = { ...options, category: aqiCategories.map(({ key, label, colorVar }) => ({ value: key, label, color: colorVar })) };
  const count = Object.keys(facets).reduce((sum, key) => sum + filters[key as keyof Facets].length, Number(filters.saved) + Number(filters.readings));

  return (
    <div className="city-filters">
      <label className="city-filter-search"><span className="sr-only">Filter by city or state</span><input type="search" placeholder="Find a city or state" value={filters.q} onChange={event => update({ q: event.target.value })} /></label>
      <label><span className="sr-only">Sort cities</span><select value={filters.sort} onChange={event => update({ sort: event.target.value })}>{Object.entries(sortOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="city-filter-desktop"><FilterFields value={filters} facets={facets} update={update} /></div>
      <button type="button" className="city-filter-mobile button secondary" onClick={() => { setDraft(filters); dialog.current?.showModal(); }}>Filters{count > 0 && ` (${count})`}</button>
      <dialog ref={dialog} className="filter-sheet" aria-labelledby={id}>
        <h2 id={id}>Filter cities</h2>
        <FilterFields value={draft} facets={facets} update={patch => setDraft(current => ({ ...current, ...patch }))} />
        <div className="filter-sheet-actions">
          <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" className="button secondary" onClick={() => setDraft({ ...readFilters(new URLSearchParams()), q: filters.q, sort: filters.sort })}>Clear</button>
          <button type="button" className="button primary" onClick={() => { update({ ...draft, q: filters.q, sort: filters.sort }); dialog.current?.close(); }}>Apply</button>
        </div>
      </dialog>
    </div>
  );
}

function FilterFields({ value, facets, update }: { value: Filters; facets: Facets; update: (patch: Partial<Filters>) => void }) {
  const [stateQuery, setStateQuery] = useState("");
  return (
    <>
      {(Object.keys(facetNames) as Array<keyof Facets>).filter(key => facets[key].length > 0).map(key => (
        <details className="city-facet" key={key}>
          <summary>{facetNames[key]}{value[key].length > 0 && ` (${value[key].length})`}</summary>
          <div className="city-facet-options">
            {key === "state" && <input type="search" aria-label="Search states" value={stateQuery} onChange={event => setStateQuery(event.target.value)} />}
            {facets[key].filter(option => key !== "state" || option.label.toLowerCase().includes(stateQuery.toLowerCase())).map(option => (
              <label key={option.value}>
                <input type="checkbox" checked={value[key].includes(option.value)} onChange={event => update({ [key]: event.target.checked ? [...value[key], option.value] : value[key].filter(item => item !== option.value) })} />
                {option.color && <i className="category-dot" style={{ background: option.color }} />}
                {option.label}
              </label>
            ))}
          </div>
        </details>
      ))}
      <label className="city-filter-toggle"><input type="checkbox" checked={value.saved} onChange={event => update({ saved: event.target.checked })} /> Saved only</label>
      <label className="city-filter-toggle"><input type="checkbox" checked={value.readings} onChange={event => update({ readings: event.target.checked })} /> Has AQI</label>
    </>
  );
}
