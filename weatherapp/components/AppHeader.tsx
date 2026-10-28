"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, ChevronDown, CloudSun, Home, Search, X } from "lucide-react";
import { cityCatalog } from "@/lib/catalog";
import { useSavedCities } from "@/components/SavedCitiesProvider";

export function AppHeader() {
  const { saved } = useSavedCities();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mobileSearch, setMobileSearch] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const results = useMemo(() => query.trim().length < 1 ? [] : cityCatalog.filter(city => `${city.name} ${city.state}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 7), [query]);

  useEffect(() => { const id = window.setTimeout(() => setOpen(query.trim().length > 0), 100); return () => window.clearTimeout(id); }, [query]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  const visit = (slug: string) => { router.push(`/city/${slug}`); setOpen(false); setQuery(""); setMobileSearch(false); };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setActive(current => (current + 1) % results.length); }
    if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setActive(current => (current - 1 + results.length) % results.length); }
    if (event.key === "Enter" && results.length) { event.preventDefault(); visit(results[active]?.slug ?? results[0].slug); }
    if (event.key === "Escape") { setOpen(false); setQuery(""); setMobileSearch(false); }
  };

  return <header className="site-header">
    <div className="header-inner">
      <Link className="brand" href="/" aria-label="Airwise home"><span className="brand-mark"><CloudSun size={23} aria-hidden="true" /></span><span>Airwise</span></Link>
      <div className={`search-wrap${mobileSearch ? " mobile-search-open" : ""}`} ref={box}>
        <Search size={18} aria-hidden="true" className="search-icon" />
        <input role="combobox" aria-label="Search cities" aria-autocomplete="list" aria-expanded={open} aria-controls="city-search-results" aria-activedescendant={open && results[active] ? `city-search-${results[active].slug}` : undefined}
          value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onFocus={() => query && setOpen(true)} onKeyDown={onKeyDown} placeholder="Search city or state" />
        {query && <button className="search-clear" onClick={() => { setQuery(""); setOpen(false); }} aria-label="Clear search"><X size={16} /></button>}
        {open && <div className="search-results" id="city-search-results" role="listbox" aria-label="Matching cities">
          {results.length ? results.map((city,index) => <button key={city.slug} id={`city-search-${city.slug}`} role="option" aria-selected={active===index} className={active===index ? "active" : ""} onMouseEnter={() => setActive(index)} onClick={() => visit(city.slug)}>
            <span className="result-mark"><Search size={15} /></span><span>{city.name}<small>{city.state}</small></span>
          </button>) : <p className="search-empty">No cities match</p>}
          <p className="search-count" aria-live="polite">{results.length} {results.length === 1 ? "city" : "cities"} found</p>
        </div>}
      </div>
      <button className="mobile-search-toggle icon-button" aria-label={mobileSearch ? "Close search" : "Open city search"} onClick={() => setMobileSearch(value => !value)}><Search size={19} /></button>
      <nav aria-label="Main navigation" className="main-nav">
        <Link className={`nav-link${pathname === "/" ? " active" : ""}`} href="/"><Home size={17} aria-hidden="true" /><span>Home</span></Link>
        <Link className={`nav-link saved-nav${pathname === "/saved" ? " active" : ""}`} href="/saved"><Bookmark size={17} aria-hidden="true" /><span>Saved</span><span className="saved-count" aria-label={`${saved.length} saved cities`}>{saved.length}</span></Link>
      </nav>
      <span className="header-cloud" aria-hidden="true"><ChevronDown size={15} /></span>
    </div>
  </header>;
}
