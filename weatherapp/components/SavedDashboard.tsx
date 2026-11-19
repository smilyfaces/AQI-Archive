"use client";

import { formatNumber, formatPValue } from "@/lib/format-number";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/ChartTooltip";
import { CityCard } from "@/components/CityCard";
import { SavedArchiveDownload } from "@/components/SavedArchiveDownload";
import { chartSeriesColors } from "@/lib/theme";
import { CityInsights } from "@/components/CityInsights";
import { useSavedCities } from "@/components/SavedCitiesProvider";
import type { City, Reading } from "@/lib/data";
import { mannWhitney, metricValue, NUMERIC_METRICS, pairedTTest, summarize, type MetricKey, wilcoxonSignedRank } from "@/lib/statistics";

type Range="24h"|"7d"|"30d"|"all";
const ranges:Array<{key:Range;label:string;days:number}>=[{key:"24h",label:"24 hours",days:1},{key:"7d",label:"7 days",days:7},{key:"30d",label:"30 days",days:30},{key:"all",label:"All available",days:3650}];

export function SavedDashboard({cities,error,localFallback}:{cities:City[];error:string|null;localFallback:boolean}){
  const {saved}=useSavedCities();
  const [selected,setSelected]=useState<string[]>([]);
  const [range,setRange]=useState<Range>("30d");
  const [metric,setMetric]=useState<MetricKey>("aqi");
  const [windowMode,setWindowMode]=useState<"overlap"|"all">("overlap");
  const [payload,setPayload]=useState<Record<string,Reading[]>>({});
  const [loadedKey,setLoadedKey]=useState("");
  const [loadError,setLoadError]=useState<string|null>(null);
  const [expanded,setExpanded]=useState<string[]>([]);
  const items=useMemo(()=>saved.map(slug=>cities.find(city=>city.slug===slug)).filter((city):city is City=>!!city),[saved,cities]);
  const compared=useMemo(()=>items.filter(city=>selected.includes(city.slug)),[items,selected]);
  const comparisonSlugs = useMemo(() => compared.map(city => city.slug), [compared]);
  const dayCount=ranges.find(item=>item.key===range)?.days??30;
  const selectionKey=`${comparisonSlugs.join(",")}|${range}`;
  const loading=comparisonSlugs.length>0&&loadedKey!==selectionKey;

  useEffect(()=>{
    if(!comparisonSlugs.length)return;
    const controller=new AbortController();
    const params=new URLSearchParams({days:String(dayCount)});comparisonSlugs.forEach(slug=>params.append("slug",slug));
    fetch(`/api/saved?${params}`,{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("Could not load selected city history.");return response.json();})
      .then(data=>{const entries=data.cities.map((item:{slug:string;readings:Reading[]})=>[item.slug,item.readings] as const);setPayload(Object.fromEntries(entries));setLoadedKey(selectionKey);setLoadError(null);})
      .catch(reason=>{if(!controller.signal.aborted)setLoadError(reason instanceof Error?reason.message:"Could not load comparisons.");})
      ;
    return ()=>controller.abort();
  },[comparisonSlugs,dayCount,selectionKey]);

  const comparisonRows=useMemo(()=>{
    if(windowMode==="all"||compared.length<2)return Object.fromEntries(compared.map(city=>[city.slug,payload[city.slug]??[]]));
    const bounds = compared.flatMap(city => {
      let first = Infinity;
      let last = -Infinity;
      for (const row of payload[city.slug] ?? []) {
        const timestamp = Date.parse(row.recorded_at);
        if (!Number.isFinite(timestamp)) continue;
        first = Math.min(first, timestamp);
        last = Math.max(last, timestamp);
      }
      return first <= last ? [[first, last] as const] : [];
    });
    if(bounds.length<2)return Object.fromEntries(compared.map(city=>[city.slug,[]]));
    const start=Math.max(...bounds.map(([first])=>first)),end=Math.min(...bounds.map(([,last])=>last));
    if(start>end)return Object.fromEntries(compared.map(city=>[city.slug,[]]));
    return Object.fromEntries(compared.map(city=>[city.slug,(payload[city.slug]??[]).filter(row=>{const time=Date.parse(row.recorded_at);return time>=start&&time<=end;})]));
  },[windowMode,compared,payload]);
  const chartRows=useMemo(()=>{const byTime=new Map<number,Record<string,number>>();for(const city of compared)for(const row of comparisonRows[city.slug]??[]){const value=metricValue(row,metric);if(value===null)continue;const timestamp=Date.parse(row.recorded_at);byTime.set(timestamp,{...byTime.get(timestamp),[city.slug]:value});}return [...byTime].sort((a,b)=>a[0]-b[0]).map(([timestamp,values])=>({timestamp,...values}));},[compared,comparisonRows,metric]);
  const comparisons=compared.map(city=>({city,stats:summarize((comparisonRows[city.slug]??[]).map(row=>metricValue(row,metric)))}));
  const ranked=[...comparisons].filter(item=>item.stats.mean!==null).sort((a,b)=>metric==="aqi"?a.stats.mean!-b.stats.mean!:b.stats.mean!-a.stats.mean!);
  const pairResults=useMemo(()=>{
    if(compared.length<2)return null;
    const [first,second]=compared,scope={kind:"cities" as const,cityIds:[first.slug,second.slug]},aRows=comparisonRows[first.slug]??[],bRows=comparisonRows[second.slug]??[];
    const a=aRows.map(row=>metricValue(row,metric)).filter((value):value is number=>value!==null),b=bRows.map(row=>metricValue(row,metric)).filter((value):value is number=>value!==null);
    const bByTime=new Map(bRows.map(row=>[Date.parse(row.recorded_at),metricValue(row,metric)])),pairedA:number[]=[],pairedB:number[]=[];
    for(const row of aRows){const x=metricValue(row,metric),y=bByTime.get(Date.parse(row.recorded_at));if(x!==null&&y!==null&&y!==undefined){pairedA.push(x);pairedB.push(y);}}
    return {first,second,mw:mannWhitney(a,b,scope),paired:pairedTTest(pairedA,pairedB,scope),wilcoxon:wilcoxonSignedRank(pairedA,pairedB,scope),pairedN:pairedA.length};
  },[compared,comparisonRows,metric]);
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
          {isExpanded && <SavedCityHistory slug={city.slug} city={city} timezone={city.timezone ?? "America/New_York"} range={range} days={dayCount}/>}
        </div>;
      })}
    </section>
      <section className="compare-section"><div className="section-heading"><div><h2>Compare saved cities</h2><p>Select up to ten. Values use the chosen time range and show the number of available readings.</p></div></div>
        <div className="compare-controls"><label>Time range<select value={range} onChange={event=>setRange(event.target.value as Range)}>{ranges.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>Comparison window<select value={windowMode} onChange={event=>setWindowMode(event.target.value as typeof windowMode)}><option value="overlap">Overlapping dates</option><option value="all">All available dates</option></select></label><label>Metric<select value={metric} onChange={event=>setMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.filter(item=>["aqi","pm25","pm10","ozone","temperature_c","relative_humidity","cloud_coverage_pct","precipitation_last_hour_mm"].includes(item.key)).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>
        {loadError&&<div className="error-panel" role="alert">{loadError}</div>}{loading&&<div className="empty-panel" aria-live="polite">Loading selected city histories…</div>}{!loading&&!compared.length&&<div className="empty-panel">Select two or more saved cities to compare.</div>}{!loading&&compared.length>0&&<><div className="compare-table-wrap"><table className="compare-table"><thead><tr><th scope="col">{NUMERIC_METRICS.find(item=>item.key===metric)?.label}</th>{comparisons.map(({city})=><th scope="col" key={city.slug}>{city.name}, {city.state}</th>)}</tr></thead><tbody><tr><th scope="row">n</th>{comparisons.map(({city,stats})=><td key={city.slug}>{stats.n}</td>)}</tr><tr><th scope="row">Mean</th>{comparisons.map(({city,stats})=><td key={city.slug} className={ranked[0]?.city.slug===city.slug?"compare-best":ranked.at(-1)?.city.slug===city.slug?"compare-worst":""}>{formatNumber(stats.mean)}</td>)}</tr><tr><th scope="row">Median</th>{comparisons.map(({city,stats})=><td key={city.slug}>{formatNumber(stats.median)}</td>)}</tr><tr><th scope="row">SD</th>{comparisons.map(({city,stats})=><td key={city.slug}>{formatNumber(stats.sd)}</td>)}</tr></tbody></table></div>
          {pairResults&&<section className="chart-panel saved-pair-test"><h3>Difference tests: {pairResults.first.name} vs {pairResults.second.name}</h3><p>Exploratory results for {NUMERIC_METRICS.find(item=>item.key===metric)?.label} on the {windowMode==="overlap"?"overlapping":"selected"} date window; observations may be temporally dependent.</p>{pairResults.mw.status==="ok"?<p>Unpaired Mann–Whitney: mean difference {formatNumber(pairResults.mw.value.difference)} (95% bootstrap CI {formatNumber(pairResults.mw.value.ci95[0])} to {formatNumber(pairResults.mw.value.ci95[1])}), effect size {formatNumber(pairResults.mw.value.effectSize)}, p-value {formatPValue(pairResults.mw.value.pValue)}; n = {comparisons[0]?.stats.n} and {comparisons[1]?.stats.n}.</p>:<p>Unpaired tests require at least 8 valid readings per city; current n = {comparisons[0]?.stats.n} and {comparisons[1]?.stats.n}.</p>}{pairResults.paired.status==="ok"&&pairResults.wilcoxon.status==="ok"?<p>Matched timestamps: {pairResults.pairedN} pairs; paired mean difference {formatNumber(pairResults.paired.value.difference)} (95% CI {formatNumber(pairResults.paired.value.ci95[0])} to {formatNumber(pairResults.paired.value.ci95[1])}), paired t p-value {formatPValue(pairResults.paired.value.pValue)}, Wilcoxon p-value {formatPValue(pairResults.wilcoxon.value.pValue)}.</p>:<p>Matched-timestamp tests require 10 paired observations; current n = {pairResults.pairedN}.</p>}</section>}
          {chartRows.length>1&&<div className="saved-analysis-grid"><section className="chart-panel"><h3>{NUMERIC_METRICS.find(item=>item.key===metric)?.label} over time</h3><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="timestamp" type="number" scale="time" domain={["dataMin","dataMax"]} tickFormatter={value=>new Date(value).toLocaleDateString()}/><YAxis tickFormatter={formatNumber}/><ChartTooltip labelFormatter={value=>new Date(Number(value)).toLocaleString()}/>{compared.map((city,index)=><Line key={city.slug} dataKey={city.slug} name={`${city.name}, ${city.state}`} stroke={chartSeriesColors[index%chartSeriesColors.length]} strokeWidth={2} dot={false} connectNulls={false}/>)}</LineChart></ResponsiveContainer></div><p className="chart-alt">Observations retain their recorded timestamps. Different cities may have readings at different times.</p></section><section className="chart-panel"><h3>Mean by city</h3><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={ranked.map(item=>({name:item.city.name,mean:item.stats.mean,n:item.stats.n}))}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="name"/><YAxis tickFormatter={formatNumber}/><ChartTooltip/><Bar dataKey="mean" fill="var(--chart-1)" radius={0}/></BarChart></ResponsiveContainer></div><ol className="ranking-list">{ranked.map((item,index)=><li key={item.city.slug}><span>{index+1}. {item.city.name}, {item.city.state}</span><strong>{formatNumber(item.stats.mean)} mean · n {item.stats.n}</strong></li>)}</ol></section></div>}</>}
      </section>
    </>:<div className="empty-panel saved-empty"><strong>No saved cities yet</strong><span>Use the star on any city card to keep it here and compare conditions.</span><Link className="button primary" href="/">Browse cities</Link></div>}
  </div></main>;
}

function SavedCityHistory({slug,city,timezone,range,days}:{slug:string;city:City;timezone:string;range:Range;days:number}){
  const [readings,setReadings]=useState<Reading[]|null>(null);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{const controller=new AbortController();const query=new URLSearchParams({days:String(days),slug});fetch(`/api/saved?${query}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error("History could not load.");return response.json();}).then(data=>setReadings(data.cities[0]?.readings??[])).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"History could not load.");});return()=>controller.abort();},[slug,days]);
  return <div className="saved-history"><h3>{ranges.find(item=>item.key===range)?.label} summary</h3>{error&&<p role="alert">{error}</p>}{readings===null&&!error&&<p>Loading statistics…</p>}{readings&&<><p>{readings.length} records in this range</p><div className="saved-mini-stats">{["aqi","pm25","temperature_c","relative_humidity"].map(key=>{const stats=summarize(readings.map(row=>metricValue(row,key as MetricKey)));return <div key={key}><span>{NUMERIC_METRICS.find(item=>item.key===key)?.label}</span><strong>Mean {formatNumber(stats.mean)}</strong><small>n = {stats.n} · median {formatNumber(stats.median)}</small></div>})}</div><details><summary>Full city analysis</summary><CityInsights readings={readings.map(row=>({...row,city_id:row.city_id??city.id??city.slug}))} timezone={timezone} now={readings.reduce((latest,row)=>Math.max(latest,Date.parse(row.recorded_at)),0)} scope={{kind:"city",cityId:city.id??city.slug}} cities={city.lat!==undefined&&city.lon!==undefined?[{id:city.id??city.slug,slug:city.slug,name:city.name,state:city.state,timezone,lat:city.lat,lon:city.lon,region:city.region,climateType:city.climate_type,sizeBand:city.size_band,population:city.population}]:[]}/></details></>}</div>;
}
