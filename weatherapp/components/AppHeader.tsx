"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, ChevronDown, CloudSun, Home, LockKeyhole, RefreshCw, Search, X } from "lucide-react";
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
  const [forceOpen, setForceOpen] = useState(false);
  const [forcePassword, setForcePassword] = useState("");
  const [forceBusy, setForceBusy] = useState(false);
  const [forceWaitStage, setForceWaitStage] = useState(0);
  const [forceMessage, setForceMessage] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const results = useMemo(() => query.trim().length < 1 ? [] : cityCatalog.filter(city => `${city.name} ${city.state}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 7), [query]);

  useEffect(() => {
    if (!forceBusy) return;
    const timer = window.setInterval(() => setForceWaitStage(stage => stage + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [forceBusy]);

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

  const cityMatch = pathname.match(/^\/city\/([^/]+)$/);
  const targetSlug = cityMatch?.[1];
  const forceScope = pathname === "/" ? "all" : pathname === "/saved" ? "saved" : targetSlug ? "city" : null;
  const forceTitle = forceScope === "all" ? "all active cities" : forceScope === "saved" ? `${saved.length} saved ${saved.length === 1 ? "city" : "cities"}` : forceScope === "city" ? cityCatalog.find(city => city.slug === targetSlug)?.name ?? "this city" : "";
  const closeForceDialog = () => { if (forceBusy) return; setForceOpen(false); setForcePassword(""); };

  const submitForceRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (forceScope === "saved" && saved.length === 0) { setForceMessage("Save at least one city before recording from this page."); return; }
    setForceBusy(true);
    setForceWaitStage(0);
    setForceMessage("");
    try {
      const slugs = forceScope === "city" && targetSlug ? [targetSlug] : forceScope === "saved" ? saved : undefined;
      const response = await fetch("/api/force-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: forcePassword, ...(slugs ? { slugs } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Recording failed.");
      setForcePassword("");
      setForceMessage(`Recording finished: ${result.ok ?? 0} complete, ${result.partial ?? 0} partial, ${result.failed ?? 0} failed.`);
    } catch (error) {
      setForceMessage(error instanceof Error ? error.message : "Recording failed. Try again.");
    } finally {
      setForceBusy(false);
    }
  };

  return <>
  <header className="site-header">
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
      {forceScope && <button className="force-record-trigger" onClick={() => { setForceOpen(true); setForcePassword(""); setForceMessage(""); }} aria-label={`Force recording for ${forceTitle}`} aria-haspopup="dialog"><RefreshCw size={16} aria-hidden="true" /><span>Record now</span></button>}
      <span className="header-cloud" aria-hidden="true"><ChevronDown size={15} /></span>
    </div>
  </header>
  {forceOpen && forceScope && <div className="force-record-backdrop" onKeyDown={event => { if (event.key === "Escape") closeForceDialog(); }} onMouseDown={event => { if (event.target === event.currentTarget) closeForceDialog(); }}>
    <section className="force-record-dialog" role="dialog" aria-modal="true" aria-labelledby="force-record-title">
      <button className="force-record-close" type="button" aria-label="Close" onClick={closeForceDialog} disabled={forceBusy}><X size={19} /></button>
      <div className="force-record-icon"><LockKeyhole size={21} aria-hidden="true" /></div>
      <p className="page-kicker">Protected action</p>
      <h2 id="force-record-title">Force a new recording</h2>
      <p className="force-record-description">Fetch the latest completed hourly reading for {forceTitle}.</p>
      <form onSubmit={submitForceRecord}>
        <label htmlFor="force-record-password">Password</label>
        <input id="force-record-password" type="password" autoComplete="current-password" autoFocus required value={forcePassword} onChange={event => setForcePassword(event.target.value)} disabled={forceBusy} />
        <div className="force-record-actions"><button className="button secondary" type="button" onClick={closeForceDialog} disabled={forceBusy}>Cancel</button><button className="button primary" type="submit" disabled={forceBusy || (forceScope === "saved" && saved.length === 0)}><RefreshCw size={16} className={forceBusy ? "force-record-spinning" : ""} />{forceBusy ? "Recording…" : "Start recording"}</button></div>
      </form>
      {forceBusy && <p className="force-record-message force-record-progress" role="status" aria-live="polite">{forceWaitStage === 0 ? `Request sent to Supabase for ${forceTitle}. Fetching weather and air-quality data and saving the latest completed-hour reading…` : forceWaitStage < 4 ? `Still running: Supabase is collecting and saving readings for ${forceTitle}. This can take a little while…` : `Still running: the recording is processing ${forceTitle}. A full-site run can take a few minutes; keep this page open.`}</p>}
      {forceMessage && <p className="force-record-message" role="status">{forceMessage}</p>}
    </section>
  </div>}
  </>;
}
