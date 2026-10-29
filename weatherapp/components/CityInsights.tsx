"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Reading } from "@/lib/data";
import { correlation, groupedAverages, metricValue, NUMERIC_METRICS, oneWayAnova, rollingAverages, summarize, timeTrend, type MetricKey } from "@/lib/statistics";

const periodOptions = [{key:"24h",label:"24 hours",duration:24*60*60*1000},{key:"7d",label:"7 days",duration:7*24*60*60*1000},{key:"30d",label:"30 days",duration:30*24*60*60*1000},{key:"all",label:"All time",duration:Infinity}] as const;
const fmt = (value:number|null|undefined,digits=2) => value===null||value===undefined||!Number.isFinite(value) ? "N/A" : Number(value.toFixed(digits)).toLocaleString();
const metricLabel = (key:string) => NUMERIC_METRICS.find(item=>item.key===key)?.label ?? key;
const getLocalDate=(value:string,timezone:string)=>new Intl.DateTimeFormat("en-US",{timeZone:timezone,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value));
const formatChartDate = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  const timestamp = typeof value === "number" ? value : Number(value);
  return Number.isFinite(timestamp) ? format(new Date(timestamp), "MMM d") : "";
};

export function CityInsights({ readings, timezone, now, title = "Statistics and archive insights" }: { readings: Reading[]; timezone: string; now: number; title?: string }) {
  const [period,setPeriod]=useState<(typeof periodOptions)[number]["key"]>("all");
  const [metric,setMetric]=useState<MetricKey>("aqi");
  const [distributionMetric,setDistributionMetric]=useState<MetricKey>("aqi");
  const [xMetric,setXMetric]=useState<MetricKey>("temperature_c");
  const [yMetric,setYMetric]=useState<MetricKey>("aqi");
  const [groupMode,setGroupMode]=useState<"pollutant"|"precipitation"|"cloud">("pollutant");
  const [correlationMethod,setCorrelationMethod]=useState<"pearson"|"spearman">("pearson");
  const [tableView,setTableView]=useState<Record<string,boolean>>({});
  const selectedPeriod=periodOptions.find(item=>item.key===period)??periodOptions[3];
  const visible=useMemo(()=>readings.filter(row=>{const age=now-Date.parse(row.recorded_at);return age>=0&&age<=selectedPeriod.duration;}).sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at)),[readings,now,selectedPeriod]);
  const summary=useMemo(()=>NUMERIC_METRICS.map(item=>({ ...item,summary:summarize(visible.map(row=>metricValue(row,item.key))) })),[visible]);
  const selectedValues=visible.map(row=>metricValue(row,metric));
  const selectedSummary=summarize(selectedValues);
  const distributionSummary=summarize(visible.map(row=>metricValue(row,distributionMetric)));
  const histogram=useMemo(()=>{
    const values=visible.map(row=>metricValue(row,distributionMetric)).filter((value):value is number=>value!==null);
    if(!values.length)return [];
    const lo=Math.min(...values),hi=Math.max(...values),bins=Math.min(8,Math.max(1,Math.ceil(Math.sqrt(values.length))));
    if(lo===hi)return [{range:fmt(lo),count:values.length}];
    const width=(hi-lo)/bins;
    return Array.from({length:bins},(_,index)=>({range:`${fmt(lo+index*width,1)}–${fmt(index===bins-1?hi:lo+(index+1)*width,1)}`,count:values.filter(value=>value>=lo+index*width&&(index===bins-1?value<=hi:value<lo+(index+1)*width)).length}));
  },[visible,distributionMetric]);
  const pearson=correlation(visible.map(row=>metricValue(row,xMetric)),visible.map(row=>metricValue(row,yMetric)));
  const anovaGroups=useMemo(()=>{
    const groups=new Map<string,number[]>();
    for(const row of visible){const category=groupMode==="pollutant"?row.primary_pollutant:groupMode==="precipitation"?row.precipitation_type:row.cloud_coverage_label; if(category&&row.aqi!==null){const group=groups.get(category)??[];group.push(row.aqi);groups.set(category,group);}}
    return [...groups].map(([label,values])=>({label,values,stats:summarize(values)}));
  },[visible,groupMode]);
  const anova=oneWayAnova(anovaGroups.map(group=>group.values));
  const hourly=groupedAverages(visible,timezone,"hour").sort((a,b)=>Number(a.label)-Number(b.label));
  const weekly=groupedAverages(visible,timezone,"weekday");
  const trend=timeTrend(visible,"aqi");
  const rolling24=rollingAverages(visible,"aqi",24*60*60*1000);
  const rolling7d=rollingAverages(visible,"aqi",7*24*60*60*1000);
  const rollingRows = useMemo(() => {
    const rows = new Map<number, { timestamp: number; short?: number; long?: number }>();
    for (const row of rolling24) rows.set(row.timestamp, { timestamp: row.timestamp, short: row.mean });
    for (const row of rolling7d) rows.set(row.timestamp, { ...rows.get(row.timestamp), timestamp: row.timestamp, long: row.mean });
    return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp);
  }, [rolling24, rolling7d]);
  const matrix=NUMERIC_METRICS.map(x=>({key:x.key,label:x.label,cells:NUMERIC_METRICS.map(y=>{
    const result=correlation(visible.map(row=>metricValue(row,x.key)),visible.map(row=>metricValue(row,y.key)),correlationMethod);
    return {key:y.key,r:result.r,n:result.n,suppressed:result.suppressed};
  })}));
  const dataQuality=NUMERIC_METRICS.map(item=>({label:item.label,missing:visible.length?Math.round(visible.filter(row=>metricValue(row,item.key)===null).length/visible.length*100):null}));
  const dateStart=visible[0]?.recorded_at,dateEnd=visible.at(-1)?.recorded_at;
  const toggleTable=(key:string)=>setTableView(current=>({...current,[key]:!current[key]}));
  const chartRows=visible.filter(row=>metricValue(row,metric)!==null).map(row=>({timestamp:Date.parse(row.recorded_at),value:metricValue(row,metric),recorded_at:row.recorded_at}));
  const scatterRows=visible.flatMap(row=>{const x=metricValue(row,xMetric),y=metricValue(row,yMetric);return x===null||y===null?[]:[{x,y,recorded_at:row.recorded_at}];});
  const regression=pearson.r===null||pearson.slope===null||pearson.intercept===null?[]:[{x:Math.min(...scatterRows.map(row=>row.x)),y:pearson.slope*Math.min(...scatterRows.map(row=>row.x))+pearson.intercept},{x:Math.max(...scatterRows.map(row=>row.x)),y:pearson.slope*Math.max(...scatterRows.map(row=>row.x))+pearson.intercept}];

  return <div className="insights-content">
    <div className="insights-toolbar"><div><h2>{title}</h2><p>{visible.length} records in {selectedPeriod.label.toLowerCase()} · dates shown in {timezone}</p></div><div className="segmented-control" role="group" aria-label="Statistics time range">{periodOptions.map(option=><button key={option.key} className={period===option.key?"selected":""} aria-pressed={period===option.key} onClick={()=>setPeriod(option.key)}>{option.label}</button>)}</div></div>

    <section className="insight-section" aria-labelledby="summary-heading"><div className="insight-heading"><h3 id="summary-heading">Summary statistics</h3><p>Each row uses only values recorded for that metric; missing values are excluded.</p></div>
      <div className="table-scroll"><table className="stats-table"><thead><tr><th scope="col">Metric</th><th scope="col">n</th><th scope="col">Mean</th><th scope="col">Median</th><th scope="col">Min</th><th scope="col">Max</th><th scope="col">SD</th><th scope="col">Variance</th><th scope="col">IQR</th><th scope="col">5th pct.</th><th scope="col">95th pct.</th><th scope="col">Mode</th></tr></thead><tbody>{summary.map(item=><tr key={item.key}><th scope="row">{item.label}{item.unit&&<small> {item.unit}</small>}</th><td>{item.summary.n}</td><td>{fmt(item.summary.mean)}</td><td>{fmt(item.summary.median)}</td><td>{fmt(item.summary.min)}</td><td>{fmt(item.summary.max)}</td><td>{fmt(item.summary.sd)}</td><td>{fmt(item.summary.variance)}</td><td>{fmt(item.summary.iqr)}</td><td>{fmt(item.summary.p05)}</td><td>{fmt(item.summary.p95)}</td><td>{fmt(item.summary.mode)}</td></tr>)}</tbody></table></div>
      <p className="plain-caption">Standard deviation describes the typical distance from the average. Variance is the squared spread.</p>
    </section>

    <div className="insight-grid">
      <section className="chart-panel span-8" aria-labelledby="series-heading"><div className="chart-heading"><div><h3 id="series-heading">Readings over time</h3><p>Points use actual observation timestamps; no missing hours are filled in.</p></div><label className="compact-select"><span className="sr-only">Choose time-series metric</span><select value={metric} onChange={event=>setMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>
        {selectedSummary.n>=5?<><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:12,right:18,bottom:8,left:4}}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/><XAxis type="number" dataKey="timestamp" name="Time" domain={['dataMin','dataMax']} tickFormatter={value=>format(new Date(value),"MMM d")} stroke="var(--ink-muted)"/><YAxis type="number" dataKey="value" name={metricLabel(metric)} width={44} stroke="var(--ink-muted)"/><Tooltip labelFormatter={(_,items)=>items[0]?.payload?.recorded_at?getLocalDate(items[0].payload.recorded_at,timezone):""} formatter={(value)=>[`${fmt(Number(value))} ${NUMERIC_METRICS.find(item=>item.key===metric)?.unit??""}`,metricLabel(metric)]}/><Scatter data={chartRows} fill="var(--blue-600)" name={metricLabel(metric)} /></ScatterChart></ResponsiveContainer></div><p className="chart-alt">{selectedSummary.n} {metricLabel(metric)} readings from {dateStart?getLocalDate(dateStart,timezone):"N/A"} to {dateEnd?getLocalDate(dateEnd,timezone):"N/A"}; mean {fmt(selectedSummary.mean)}.</p><button className="table-toggle" onClick={()=>toggleTable("series")}>{tableView.series?"Hide data table":"View as table"}</button>{tableView.series&&<DataTable rows={chartRows.map(row=>({Time:getLocalDate(row.recorded_at,timezone),Value:fmt(row.value)}))}/>}</>:<Insufficient n={selectedSummary.n} need={5}/>}</section>

      <section className="chart-panel span-4" aria-labelledby="distribution-heading"><div className="chart-heading"><div><h3 id="distribution-heading">Distribution</h3><p>Count of observations by value range.</p></div><label className="compact-select"><span className="sr-only">Choose distribution metric</span><select value={distributionMetric} onChange={event=>setDistributionMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>
        {distributionSummary.n>=5?<><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={histogram} margin={{top:10,right:8,bottom:20,left:-18}}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="range" angle={-24} textAnchor="end" interval="preserveStartEnd" height={50} stroke="var(--ink-muted)"/><YAxis allowDecimals={false} stroke="var(--ink-muted)"/><Tooltip/><Bar dataKey="count" name="Readings" fill="var(--blue-600)" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div><p className="chart-alt">{distributionSummary.n} {metricLabel(distributionMetric)} values. Median {fmt(distributionSummary.median)}; range {fmt(distributionSummary.min)} to {fmt(distributionSummary.max)}.</p><div className="boxplot" role="img" aria-label={`${metricLabel(distributionMetric)} five number summary: min ${fmt(distributionSummary.min)}, lower quartile ${fmt(distributionSummary.q1)}, median ${fmt(distributionSummary.median)}, upper quartile ${fmt(distributionSummary.q3)}, max ${fmt(distributionSummary.max)}`}><span className="boxplot-whisker" style={{left:"0%",width:"100%"}}/><span className="boxplot-box" style={{left:`${distributionSummary.max===distributionSummary.min?50:(distributionSummary.q1!-distributionSummary.min!)/(distributionSummary.max!-distributionSummary.min!)*100}%`,width:`${distributionSummary.max===distributionSummary.min?0:(distributionSummary.q3!-distributionSummary.q1!)/(distributionSummary.max!-distributionSummary.min!)*100}%`}}/><i className="boxplot-median" style={{left:`${distributionSummary.max===distributionSummary.min?50:(distributionSummary.median!-distributionSummary.min!)/(distributionSummary.max!-distributionSummary.min!)*100}%`}}/></div><p className="boxplot-labels">Min {fmt(distributionSummary.min)} <span>Median {fmt(distributionSummary.median)}</span> Max {fmt(distributionSummary.max)}</p><button className="table-toggle" onClick={()=>toggleTable("distribution")}>{tableView.distribution?"Hide data table":"View as table"}</button>{tableView.distribution&&<DataTable rows={histogram.map(row=>({Range:row.range,Count:row.count}))}/>}</>:<Insufficient n={distributionSummary.n} need={5}/>}
      </section>

      <section className="chart-panel span-6" aria-labelledby="correlation-heading"><div className="chart-heading"><div><h3 id="correlation-heading">Metric relationships</h3><p>{correlationMethod[0].toUpperCase()+correlationMethod.slice(1)} correlation, pairwise complete; each cell shows r and n.</p></div><label className="compact-select"><span className="sr-only">Correlation method</span><select value={correlationMethod} onChange={event=>setCorrelationMethod(event.target.value as typeof correlationMethod)}><option value="pearson">Pearson</option><option value="spearman">Spearman</option></select></label></div>
        <div className="matrix-scroll"><table className="correlation-table"><caption className="sr-only">Correlation matrix for tracked numeric measurements</caption><thead><tr><th scope="col">Metric</th>{NUMERIC_METRICS.map(item=><th key={item.key} scope="col" title={item.label}>{item.label}</th>)}</tr></thead><tbody>{matrix.map(row=><tr key={row.key}><th scope="row">{row.label}</th>{row.cells.map(cell=><td key={cell.key} className={cell.suppressed?"suppressed-cell":""} title={`${row.label} and ${metricLabel(cell.key)}; n=${cell.n}`} style={cell.r===null?undefined:{background:`color-mix(in srgb, ${cell.r<0?"#2b6ca3":"#1f8a70"} ${Math.abs(cell.r)*32}%, var(--surface))`}}>{cell.suppressed?`n=${cell.n}`:fmt(cell.r,2)}</td>)}</tr>)}</tbody></table></div>
        <p className="chart-alt">Cells with fewer than 10 paired observations suppress the correlation. Sample size appears in each cell.</p>
      </section>

      <section className="chart-panel span-6" aria-labelledby="scatter-heading"><div className="chart-heading"><div><h3 id="scatter-heading">Scatter and regression</h3><p>Choose two metrics to inspect their relationship.</p></div></div>
        <div className="pair-selects"><label><span>X axis</span><select value={xMetric} onChange={event=>setXMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label><span>Y axis</span><select value={yMetric} onChange={event=>setYMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>
        {pearson.suppressed?<Insufficient n={pearson.n} need={10}/>:pearson.r===null?<div className="empty-panel small-empty">No variation is available for this metric pair (n = {pearson.n}).</div>:<><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:10,right:18,bottom:8,left:4}}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/><XAxis type="number" dataKey="x" name={metricLabel(xMetric)} stroke="var(--ink-muted)"/><YAxis type="number" dataKey="y" name={metricLabel(yMetric)} stroke="var(--ink-muted)"/><Tooltip formatter={value=>fmt(Number(value))}/><Scatter data={scatterRows} fill="var(--blue-600)" name="Observations"/><Scatter data={regression} line={{stroke:"var(--success)",strokeWidth:2}} shape={()=>null} name="Regression"/></ScatterChart></ResponsiveContainer></div><p className="chart-alt">r = {fmt(pearson.r,3)} · R² = {fmt(pearson.rSquared,3)} · p = {fmt(pearson.pValue,4)} · n = {pearson.n} · slope = {fmt(pearson.slope,3)}</p></>}
      </section>

      <section className="chart-panel span-6" aria-labelledby="patterns-heading"><div className="chart-heading"><div><h3 id="patterns-heading">Time patterns</h3><p>Average AQI by local hour and day of week.</p></div></div>
        {hourly.length&&weekly.length?<><div className="pattern-grid"><PatternList title="Hour of day" rows={hourly.map(row=>({...row,label:`${row.label}:00`}))}/><PatternList title="Day of week" rows={weekly}/></div><p className="chart-alt">Only observed entries contribute. Unobserved hours and weekdays are omitted.</p>{trend.suppressed?<Insufficient n={trend.n} need={10}/>:<p className="trend-summary">AQI trend: {fmt(trend.slopePerDay,2)} points per day · 95% CI {fmt(trend.lower95,2)} to {fmt(trend.upper95,2)} · p = {fmt(trend.pValue,4)} · n = {trend.n}</p>}</>:<Insufficient n={0} need={5}/>}
      </section>

      <section className="chart-panel span-6" aria-labelledby="rolling-heading"><div className="chart-heading"><div><h3 id="rolling-heading">Rolling AQI averages</h3><p>Windowed over real timestamps; no uniform spacing is assumed.</p></div></div>
        {selectedSummary.n>=5?<><div className="rolling-legend"><span><i className="legend-dot"/>24 hour window</span><span><i className="legend-dot seven-day"/>7 day window</span></div><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={rollingRows} margin={{top:8,right:12,bottom:8,left:4}}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/><XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin','dataMax']} tickFormatter={formatChartDate} stroke="var(--ink-muted)"/><YAxis width={42} stroke="var(--ink-muted)"/><Tooltip labelFormatter={value=>formatChartDate(value)===""?"":getLocalDate(new Date(Number(value)).toISOString(),timezone)}/><Line dataKey="short" name="24 hour" stroke="var(--blue-600)" dot={false} connectNulls={false}/><Line dataKey="long" name="7 day" stroke="var(--success)" dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div><p className="chart-alt">Rolling values are calculated from readings that actually fall within each time window.</p></>:<Insufficient n={selectedSummary.n} need={5}/>}
      </section>

      <section className="chart-panel span-12" aria-labelledby="groups-heading"><div className="chart-heading"><div><h3 id="groups-heading">AQI group comparisons</h3><p>Group summaries with a one-way ANOVA when sample size permits.</p></div><label className="compact-select"><span className="sr-only">Group AQI by</span><select value={groupMode} onChange={event=>setGroupMode(event.target.value as typeof groupMode)}><option value="pollutant">Primary pollutant</option><option value="precipitation">Precipitation type</option><option value="cloud">Cloud coverage</option></select></label></div>
        {anova.suppressed?<Insufficient n={anova.n} need={10}/>:<><div className="group-list">{anovaGroups.map(group=><div className="group-row" key={group.label}><strong>{group.label}</strong><span>n = {group.stats.n}</span><span>Mean AQI {fmt(group.stats.mean,1)}</span><span>Median {fmt(group.stats.median,1)}</span></div>)}</div><p className="chart-alt">ANOVA F = {fmt(anova.fStatistic,3)} · p = {fmt(anova.pValue,4)} · n = {anova.n}. This test describes group differences and does not establish cause.</p></>}
        <div className="categorical-grid"><CategoryDistribution title="AQI category" values={visible.map(row=>row.aqi_category)}/><CategoryDistribution title="Primary pollutant" values={visible.map(row=>row.primary_pollutant)}/><CategoryDistribution title="Precipitation type" values={visible.map(row=>row.precipitation_type)}/><CategoryDistribution title="Cloud coverage" values={visible.map(row=>row.cloud_coverage_label)}/></div>
      </section>

      <section className="chart-panel span-12" aria-labelledby="quality-heading"><div className="chart-heading"><div><h3 id="quality-heading">Data quality</h3><p>Coverage for the selected time range.</p></div></div><div className="quality-stats"><div><span>Records</span><strong>{visible.length}</strong></div><div><span>Date range</span><strong>{dateStart?`${getLocalDate(dateStart,timezone)} – ${getLocalDate(dateEnd!,timezone)}`:"N/A"}</strong></div><div><span>Manual entries</span><strong>{visible.filter(row=>row.source==="manual").length}</strong></div><div><span>Automated entries</span><strong>{visible.filter(row=>row.source==="automated").length}</strong></div></div><div className="missing-grid">{dataQuality.map(item=><div key={item.label}><span>{item.label}</span><strong>{item.missing===null?"N/A":`${item.missing}% N/A`}</strong><span className="missing-track"><i style={{width:`${item.missing??0}%`}}/></span></div>)}</div></section>
    </div>
  </div>;
}

function Insufficient({n,need}:{n:number;need:number}) { return <div className="insufficient">Not enough data yet (n = {n}, need {need})</div>; }
function DataTable({rows}:{rows:Array<Record<string,string|number>>}) { const cols=Object.keys(rows[0]??{}); return <div className="data-table-scroll"><table className="data-table"><thead><tr>{cols.map(col=><th key={col} scope="col">{col}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{cols.map(col=><td key={col}>{row[col]}</td>)}</tr>)}</tbody></table></div>; }
function PatternList({title,rows}:{title:string;rows:Array<{label:string;mean:number|null;n:number}>}) { return <div className="pattern-list"><strong>{title}</strong>{rows.length?rows.map(row=><div key={row.label}><span>{row.label}</span><b>{fmt(row.mean,1)}</b><small>n {row.n}</small></div>):<small>Not enough data yet</small>}</div>; }
function CategoryDistribution({title,values}:{title:string;values:Array<string|null|undefined>}) {
  const counts=new Map<string,number>();
  for(const value of values) if(value) counts.set(value,(counts.get(value)??0)+1);
  const total=[...counts.values()].reduce((sum,value)=>sum+value,0);
  return <div className="category-distribution"><strong>{title}</strong>{total? [...counts].sort((a,b)=>b[1]-a[1]).map(([label,count])=><div key={label}><span>{label}</span><b>{Math.round(count/total*100)}%</b><small>n {count}</small></div>):<span className="muted-line">Not available</span>}</div>;
}
