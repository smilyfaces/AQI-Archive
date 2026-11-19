"use client";

import { formatNumber, formatPValue } from "@/lib/format-number";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/ChartTooltip";
import { CityCard } from "@/components/CityCard";
import { SavedArchiveDownload } from "@/components/SavedArchiveDownload";
import { chartSeriesColors } from "@/lib/theme";
import { CityInsights } from "@/components/CityInsights";
import { useSavedCities } from "@/components/SavedCitiesProvider";
import type { City } from "@/lib/data";
import type { SavedComparison, SavedHistorySummary } from "@/lib/saved-analysis";
import { useAnalysisResult } from "@/components/useAnalysisResult";
import { NUMERIC_METRICS, type MetricKey } from "@/lib/metrics";

type Range="24h"|"7d"|"30d"|"all";
const ranges:Array<{key:Range;label:string;days:number}>=[{key:"24h",label:"24 hours",days:1},{key:"7d",label:"7 days",days:7},{key:"30d",label:"30 days",days:30},{key:"all",label:"All available",days:3650}];

export function SavedDashboard({cities,error,localFallback}:{cities:City[];error:string|null;localFallback:boolean}){
  const {saved}=useSavedCities();
  const [selected,setSelected]=useState<string[]>([]);
  const [range,setRange]=useState<Range>("30d");
  const [metric,setMetric]=useState<MetricKey>("aqi");
  const [windowMode,setWindowMode]=useState<"overlap"|"all">("overlap");
  const [expanded,setExpanded]=useState<string[]>([]);
  const items=useMemo(()=>saved.map(slug=>cities.find(city=>city.slug===slug)).filter((city):city is City=>!!city),[saved,cities]);
  const compared=useMemo(()=>items.filter(city=>selected.includes(city.slug)),[items,selected]);
  const comparisonSlugs = useMemo(() => compared.map(city => city.slug), [compared]);
  const dayCount=ranges.find(item=>item.key===range)?.days??30;
  const params = new URLSearchParams({ mode: "compare", days: String(dayCount), metric, window: windowMode });
  comparisonSlugs.forEach(slug => params.append("slug", slug));
  const comparison = useAnalysisResult<SavedComparison>(comparisonSlugs.length ? `/api/saved?${params}` : null);
  const { chartRows = [], ranked: rankedSlugs = [], summaries = {}, pair: pairResults } = comparison.data ?? {};
  const comparisons = comparison.data ? compared.map(city => ({ city, stats: summaries[city.slug] })) : [];
  const ranked = rankedSlugs.flatMap(slug => comparisons.filter(item => item.city.slug === slug));
  const loading = comparisonSlugs.length > 0 && !comparison.data && !comparison.error;

  const toggleSelected=(slug:string,checked:boolean)=>setSelected(current=>checked?(comparisonSlugs.length<10&&!current.includes(slug)?[...current,slug]:current):current.filter(item=>item!==slug));

  return <main id="main-content" className="page-main"><div className="page-container saved-page"><header className="saved-heading"><div><p className="page-kicker">Your places</p><h1>Saved cities</h1><p>Saved on this device · {items.length} {items.length===1?"city":"cities"}</p></div>{saved.length > 0 && <SavedArchiveDownload slugs={saved}/>}</header>
    {localFallback&&<div className="notice-panel"><span>Showing available manual readings until the Supabase schema is applied.</span></div>}{error&&<div className="error-panel" role="alert"><strong>Saved city data could not load.</strong><span>{error}</span></div>}
    {items.length?<><section className="saved-grid" aria-label="Saved city cards">
      {items.map((city, index) => {
        const isSelected = selected.includes(city.slug);
        const isExpanded = expanded.includes(city.slug);
        return <div className="saved-card-wrap" key={city.slug}>
          <CityCard city={city} priority={index < 2} onUnsave={() => {
            toggleSelected(city.slug, false);
            setExpanded(current => current.filter(slug => slug !== city.slug));
          }} actions={<>
            <label className="compare-check">
              <input type="checkbox" checked={isSelected} disabled={!isSelected && comparisonSlugs.length >= 10}
                onChange={event => toggleSelected(city.slug, event.target.checked)} />
              Compare<span className="sr-only"> {city.name}</span>
            </label>
            <button type="button" className="saved-detail-toggle" aria-expanded={isExpanded}
              onClick={() => setExpanded(current => current.includes(city.slug) ? current.filter(slug => slug !== city.slug) : [...current, city.slug])}>
              {isExpanded ? "Hide history" : "Show history"}<span className="sr-only"> for {city.name}</span>
            </button>
          </>}/>
          {isExpanded && <SavedCityHistory slug={city.slug} range={range} days={dayCount}/>}
        </div>;
      })}
    </section>
      <section className="compare-section"><div className="section-heading"><div><h2>Compare saved cities</h2><p>Select up to ten. Values use the chosen time range and show the number of available readings.</p></div></div>
        <div className="compare-controls"><label>Time range<select value={range} onChange={event=>setRange(event.target.value as Range)}>{ranges.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>Comparison window<select value={windowMode} onChange={event=>setWindowMode(event.target.value as typeof windowMode)}><option value="overlap">Overlapping dates</option><option value="all">All available dates</option></select></label><label>Metric<select value={metric} onChange={event=>setMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.filter(item=>["aqi","pm25","pm10","ozone","temperature_c","relative_humidity","cloud_coverage_pct","precipitation_last_hour_mm"].includes(item.key)).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>
        {comparison.error && <div className="error-panel" role="alert">{comparison.error} <button type="button" onClick={comparison.retry}>Retry</button></div>}{loading&&<div className="empty-panel" aria-live="polite">Loading selected city histories…</div>}{!loading&&!compared.length&&<div className="empty-panel">Select two or more saved cities to compare.</div>}{comparison.data&&<><div className="compare-table-wrap"><table className="compare-table"><thead><tr><th scope="col">{NUMERIC_METRICS.find(item=>item.key===metric)?.label}</th>{comparisons.map(({city})=><th scope="col" key={city.slug}>{city.name}, {city.state}</th>)}</tr></thead><tbody><tr><th scope="row">n</th>{comparisons.map(({city,stats})=><td key={city.slug}>{stats.n}</td>)}</tr><tr><th scope="row">Mean</th>{comparisons.map(({city,stats})=><td key={city.slug} className={ranked[0]?.city.slug===city.slug?"compare-best":ranked.at(-1)?.city.slug===city.slug?"compare-worst":""}>{formatNumber(stats.mean)}</td>)}</tr><tr><th scope="row">Median</th>{comparisons.map(({city,stats})=><td key={city.slug}>{formatNumber(stats.median)}</td>)}</tr><tr><th scope="row">SD</th>{comparisons.map(({city,stats})=><td key={city.slug}>{formatNumber(stats.sd)}</td>)}</tr></tbody></table></div>
          {pairResults&&<section className="chart-panel saved-pair-test"><h3>Difference tests: {compared[0]?.name} vs {compared[1]?.name}</h3><p>Exploratory results for {NUMERIC_METRICS.find(item=>item.key===metric)?.label} on the {windowMode==="overlap"?"overlapping":"selected"} date window; observations may be temporally dependent.</p>{pairResults.mw.status==="ok"?<p>Unpaired Mann–Whitney: mean difference {formatNumber(pairResults.mw.value.difference)} (95% bootstrap CI {formatNumber(pairResults.mw.value.ci95[0])} to {formatNumber(pairResults.mw.value.ci95[1])}), effect size {formatNumber(pairResults.mw.value.effectSize)}, p-value {formatPValue(pairResults.mw.value.pValue)}; n = {comparisons[0]?.stats.n} and {comparisons[1]?.stats.n}.</p>:<p>Unpaired tests require at least 8 valid readings per city; current n = {comparisons[0]?.stats.n} and {comparisons[1]?.stats.n}.</p>}{pairResults.paired.status==="ok"&&pairResults.wilcoxon.status==="ok"?<p>Matched timestamps: {pairResults.pairedN} pairs; paired mean difference {formatNumber(pairResults.paired.value.difference)} (95% CI {formatNumber(pairResults.paired.value.ci95[0])} to {formatNumber(pairResults.paired.value.ci95[1])}), paired t p-value {formatPValue(pairResults.paired.value.pValue)}, Wilcoxon p-value {formatPValue(pairResults.wilcoxon.value.pValue)}.</p>:<p>Matched-timestamp tests require 10 paired observations; current n = {pairResults.pairedN}.</p>}</section>}
          {chartRows.length>1&&<div className="saved-analysis-grid"><section className="chart-panel"><h3>{NUMERIC_METRICS.find(item=>item.key===metric)?.label} over time</h3><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="timestamp" type="number" scale="time" domain={["dataMin","dataMax"]} tickFormatter={value=>new Date(value).toLocaleDateString()}/><YAxis tickFormatter={formatNumber}/><ChartTooltip labelFormatter={value=>new Date(Number(value)).toLocaleString()}/>{compared.map((city,index)=><Line key={city.slug} dataKey={city.slug} name={`${city.name}, ${city.state}`} stroke={chartSeriesColors[index%chartSeriesColors.length]} strokeWidth={2} dot={false} connectNulls={false}/>)}</LineChart></ResponsiveContainer></div><p className="chart-alt">Observations retain their recorded timestamps. Different cities may have readings at different times.</p></section><section className="chart-panel"><h3>Mean by city</h3><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={ranked.map(item=>({name:item.city.name,mean:item.stats.mean,n:item.stats.n}))}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="name"/><YAxis tickFormatter={formatNumber}/><ChartTooltip/><Bar dataKey="mean" fill="var(--chart-1)" radius={0}/></BarChart></ResponsiveContainer></div><ol className="ranking-list">{ranked.map((item,index)=><li key={item.city.slug}><span>{index+1}. {item.city.name}, {item.city.state}</span><strong>{formatNumber(item.stats.mean)} mean · n {item.stats.n}</strong></li>)}</ol></section></div>}</>}
      </section>
    </>:<div className="empty-panel saved-empty"><strong>No saved cities yet</strong><span>Use the star on any city card to keep it here and compare conditions.</span><Link className="button primary" href="/">Browse cities</Link></div>}
  </div></main>;
}

function SavedCityHistory({ slug, range, days }: { slug: string; range: Range; days: number }) {
  const params = new URLSearchParams({ slug, days: String(days), mode: "summary" });
  const { data, previousData, error, retry } = useAnalysisResult<SavedHistorySummary>(`/api/saved?${params}`);
  const [analysisOpened, setAnalysisOpened] = useState(false);
  const history = data ?? previousData;
  return <div className="saved-history">
    <h3>{ranges.find(item => item.key === range)?.label} summary</h3>
    {error && <p role="alert">{error} <button type="button" onClick={retry}>Retry</button></p>}
    {!data && !error && <p role="status">Loading statistics?</p>}
    {history && <div hidden={!data}>
      <p>{history.count} records in this range</p>
      <div className="saved-mini-stats">{history.summaries.map(({ key, label, stats }) => <div key={key}>
        <span>{label}</span><strong>Mean {formatNumber(stats.mean)}</strong>
        <small>n = {stats.n} ? median {formatNumber(stats.median)}</small>
      </div>)}</div>
      <details onToggle={event => { if (event.currentTarget.open) setAnalysisOpened(true); }}>
        <summary>Full city analysis</summary>
        {analysisOpened && <CityInsights source={history.source} timezone={history.timezone}/>}
      </details>
    </div>}
  </div>;
}
