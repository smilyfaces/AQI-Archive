"use client";

import { formatNumber as fmt, formatPValue } from "@/lib/format-number";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analysisPeriods as periodOptions, type AnalysisPeriod } from "@/lib/analysis-periods";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/ChartTooltip";
import { ChartWorkspace, rollingWindowOptions, type ChartConfig, type RollingWindow } from "@/components/ChartPanel";
import { AnalysisNavigation } from "@/components/AnalysisNavigation";
import { NUMERIC_METRICS, type MetricKey } from "@/lib/metrics";
import type { InsightsChart, InsightsReport } from "@/lib/insights-analysis";
import { chartTablePageSize, defaultReportSettings, type ChartSettings, type InsightsSource, type ReportSettings } from "@/lib/insights-settings";
import { useAnalysisResult } from "@/components/useAnalysisResult";

const metricLabel = (key:string) => NUMERIC_METRICS.find(item=>item.key===key)?.label ?? key;
const getLocalDate=(value:string,timezone:string)=>new Intl.DateTimeFormat("en-US",{timeZone:timezone,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value));
const sampleSizes = [100, 500, 1000, 5000] as const;
const gridOptions=[{key:"temp_bin",label:"Temperature"},{key:"wind_bin",label:"Wind"},{key:"rh_bin",label:"Humidity"},{key:"cloud_bin",label:"Cloud cover"},{key:"pressure_bin",label:"Pressure"}] as const;
const formatChartDate = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  const timestamp = typeof value === "number" ? value : Number(value);
  return Number.isFinite(timestamp) ? format(new Date(timestamp), "MMM d") : "";
};

export function CityInsights({ source, timezone, initialReport, title = "Statistics and archive insights" }: {
  source: InsightsSource;
  timezone: string;
  initialReport?: InsightsReport;
  title?: string;
}) {
  const { archivePeriod } = source;
  const showSampleControl = archivePeriod !== undefined;
  const sectionPrefix = useId();
  const [localPeriod, setLocalPeriod] = useState<AnalysisPeriod>("all");
  const period = archivePeriod ?? localPeriod;
  const router = useRouter();
  const [loadingPeriod, startPeriodChange] = useTransition();

  function changePeriod(next: AnalysisPeriod) {
    if (!archivePeriod) {
      setLocalPeriod(next);
      return;
    }
    if (next === period) return;
    const url = new URL(window.location.href);
    url.searchParams.set("period", next);
    startPeriodChange(() => router.replace(url.pathname + url.search + url.hash, { scroll: false }));
  }
  const [sampleSize,setSampleSize]=useState<"all"|`${number}`>("all");
  const [sampleSeed,setSampleSeed]=useState(0);
  const [includeManual,setIncludeManual]=useState(false);
  const [gridX,setGridX]=useState<"temp_bin"|"wind_bin"|"rh_bin"|"cloud_bin"|"pressure_bin">("temp_bin");
  const [gridY,setGridY]=useState<"temp_bin"|"wind_bin"|"rh_bin"|"cloud_bin"|"pressure_bin">("wind_bin");
  const [metric,setMetric]=useState<MetricKey>("aqi");
  const [distributionMetric,setDistributionMetric]=useState<MetricKey>("aqi");
  const [xMetric,setXMetric]=useState<MetricKey>("temperature_c");
  const [yMetric,setYMetric]=useState<MetricKey>("aqi");
  const [rollingMetric,setRollingMetric]=useState<MetricKey>("aqi");
  const [rollingWindow,setRollingWindow]=useState<RollingWindow>("both");
  const [groupMode,setGroupMode]=useState<"pollutant"|"precipitation"|"cloud"|"temperature"|"humidity">("pollutant");
  const [correlationMethod,setCorrelationMethod]=useState<"pearson"|"spearman">("pearson");
  const [tableView,setTableView]=useState<Record<string,boolean>>({});
  const selectedPeriod=periodOptions.find(item=>item.key===period)??periodOptions[3];
  const selection = new URLSearchParams({
    asOf: String(source.asOf), period, includeManual: String(includeManual),
    sampleSize, sampleSeed: String(sampleSize === "all" ? 0 : sampleSeed),
  });
  if (source.slug) selection.set("slug", source.slug);
  if (source.days !== undefined) selection.set("days", String(source.days));
  if (archivePeriod) selection.set("archivePeriod", archivePeriod);
  const settings: ReportSettings = { metric, gridX, gridY, groupMode, correlationMethod };
  const useInitial = initialReport && period === (archivePeriod ?? "all") && !includeManual && sampleSize === "all"
    && Object.entries(settings).every(([key, value]) => defaultReportSettings[key as keyof ReportSettings] === value);
  const reportRequest = useAnalysisResult<InsightsReport>(useInitial ? null : analysisUrl(selection, { type: "report", ...settings }));
  const report = useInitial ? initialReport : reportRequest.data;
  const displayedReport = report ?? reportRequest.previousData ?? initialReport;
  const toggleTable = (key: string) => setTableView(current => ({ ...current, [key]: !current[key] }));
  const { count, periodCount, scope, dateStart, dateEnd, summary, matrix, model, grid, scenarios, anova,
    anovaGroups, hourly, weekly, trend, dataQuality, categories, manualCount, automatedCount } = displayedReport ?? {} as InsightsReport;

  function renderSeries(metric: MetricKey, data: Extract<InsightsChart, { type: "series" }>, original = false, sharedTime = false) {
    const selectedSummary = summary.find(item => item.key === metric)!.summary;
    const { rows: chartRows, total } = data;
    return <>{selectedSummary.n>=5?<><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:12,right:18,bottom:8,left:4}}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis type="number" dataKey="timestamp" name="Time" domain={sharedTime&&dateStart&&dateEnd?[Date.parse(dateStart),Date.parse(dateEnd)]:['dataMin','dataMax']} tickFormatter={value=>format(new Date(value),"MMM d")} stroke="var(--ink-muted)"/><YAxis tickFormatter={fmt} type="number" dataKey="value" name={metricLabel(metric)} width={44} stroke="var(--ink-muted)"/><ChartTooltip labelFormatter={(_,items)=>items[0]?.payload?.recorded_at?getLocalDate(items[0].payload.recorded_at,timezone):""} formatter={(value)=>[`${fmt(Number(value))} ${NUMERIC_METRICS.find(item=>item.key===metric)?.unit??""}`,metricLabel(metric)]}/><Scatter data={chartRows} fill="var(--chart-1)" name={metricLabel(metric)} /></ScatterChart></ResponsiveContainer></div><p className="chart-alt">{selectedSummary.n} {metricLabel(metric)} readings from {dateStart?getLocalDate(dateStart,timezone):"N/A"} to {dateEnd?getLocalDate(dateEnd,timezone):"N/A"}; mean {fmt(selectedSummary.mean)}.</p>{original&&<><button className="table-toggle" onClick={()=>toggleTable("series")}>{tableView.series?"Hide data table":"View as table"}</button>{tableView.series&&<ExactChartTable key={analysisUrl(selection, chartSettings("series", metric))} selection={selection} settings={chartSettings("series", metric)} total={total} formatRows={chart => chart.type === "series" ? chart.rows.map(row => ({ Time: getLocalDate(row.recorded_at, timezone), Value: fmt(row.value) })) : []}/>}</>}</>:<Insufficient n={selectedSummary.n} need={5}/>}</>;
  }

  function renderDistribution(distributionMetric: MetricKey, data: Extract<InsightsChart, { type: "distribution" }>, original = false) {
    const { summary: distributionSummary, rows: histogram } = data;
    return <>{distributionSummary.n>=5?<><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={histogram} margin={{top:10,right:8,bottom:20,left:-18}}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="range" angle={-24} textAnchor="end" interval="preserveStartEnd" height={50} stroke="var(--ink-muted)"/><YAxis allowDecimals={false} stroke="var(--ink-muted)"/><ChartTooltip/><Bar dataKey="count" name="Readings" fill="var(--chart-1)" radius={0}/></BarChart></ResponsiveContainer></div><p className="chart-alt">{distributionSummary.n} {metricLabel(distributionMetric)} values. Median {fmt(distributionSummary.median)}; range {fmt(distributionSummary.min)} to {fmt(distributionSummary.max)}.</p><div className="boxplot" role="img" aria-label={`${metricLabel(distributionMetric)} five number summary: min ${fmt(distributionSummary.min)}, lower quartile ${fmt(distributionSummary.q1)}, median ${fmt(distributionSummary.median)}, upper quartile ${fmt(distributionSummary.q3)}, max ${fmt(distributionSummary.max)}`}><span className="boxplot-whisker" style={{left:"0%",width:"100%"}}/><span className="boxplot-box" style={{left:`${distributionSummary.max===distributionSummary.min?50:(distributionSummary.q1!-distributionSummary.min!)/(distributionSummary.max!-distributionSummary.min!)*100}%`,width:`${distributionSummary.max===distributionSummary.min?0:(distributionSummary.q3!-distributionSummary.q1!)/(distributionSummary.max!-distributionSummary.min!)*100}%`}}/><i className="boxplot-median" style={{left:`${distributionSummary.max===distributionSummary.min?50:(distributionSummary.median!-distributionSummary.min!)/(distributionSummary.max!-distributionSummary.min!)*100}%`}}/></div><p className="boxplot-labels">Min {fmt(distributionSummary.min)} <span>Median {fmt(distributionSummary.median)}</span> Max {fmt(distributionSummary.max)}</p>{original&&<><button className="table-toggle" onClick={()=>toggleTable("distribution")}>{tableView.distribution?"Hide data table":"View as table"}</button>{tableView.distribution&&<DataTable rows={histogram.map(row=>({Range:row.range,Count:row.count}))}/>}</>}</>:<Insufficient n={distributionSummary.n} need={5}/>}</>;
  }

  function renderScatter(xMetric: MetricKey, yMetric: MetricKey, data: Extract<InsightsChart, { type: "scatter" }>) {
    const { pearson, rows: scatterRows, regression, total } = data;
    return <>{pearson.suppressed?<Insufficient n={pearson.n} need={10}/>:pearson.r===null?<div className="empty-panel small-empty">No variation is available for this metric pair (n = {pearson.n}).</div>:<><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:10,right:18,bottom:8,left:4}}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis tickFormatter={fmt} type="number" dataKey="x" name={metricLabel(xMetric)} stroke="var(--ink-muted)"/><YAxis tickFormatter={fmt} type="number" dataKey="y" name={metricLabel(yMetric)} stroke="var(--ink-muted)"/><ChartTooltip formatter={value=>fmt(Number(value))}/><Scatter data={scatterRows} fill="var(--chart-1)" name="Observations"/><Scatter data={regression} line={{stroke:"var(--chart-2)",strokeWidth:2}} shape={()=>null} name="Regression"/></ScatterChart></ResponsiveContainer></div><p className="chart-alt">r = {fmt(pearson.r)} · R² = {fmt(pearson.rSquared)} · p-value {formatPValue(pearson.pValue)} · n = {pearson.n} · slope = {fmt(pearson.slope)}</p><ExactChartToggle selection={selection} settings={chartSettings("scatter", yMetric, xMetric)} total={total} formatRows={chart => chart.type === "scatter" ? chart.rows.map(row => ({
      Time: getLocalDate(row.recorded_at, timezone),
      ["X ? " + metricLabel(xMetric)]: fmt(row.x),
      ["Y ? " + metricLabel(yMetric)]: fmt(row.y),
    })) : []}/></>}</>;
  }

  function renderPatterns() {

    return <>{hourly.length&&weekly.length?<><div className="pattern-grid"><PatternList title="Hour of day" rows={hourly.map(row=>({...row,label:`${row.label}:00`}))}/><PatternList title="Day of week" rows={weekly}/></div><p className="chart-alt">Only observed entries contribute. Unobserved hours and weekdays are omitted.</p>{trend.suppressed?<Insufficient n={trend.n} need={10}/>:<p className="trend-summary">AQI trend: {fmt(trend.slopePerDay)} points per day · 95% CI {fmt(trend.lower95)} to {fmt(trend.upper95)} · p-value {formatPValue(trend.pValue)} · n = {trend.n}</p>}</>:<Insufficient n={0} need={5}/>}</>;
  }


  function renderChart(config: ChartConfig, original = false) {
    const { type, metric, xMetric, secondMetric, rollingWindow } = config;
    if (type === "patterns") return renderPatterns();
    const settings = chartSettings(type, metric, xMetric, rollingWindow);
    const chart = <AnalysisChart selection={selection} settings={settings}>{data => {
      switch (data.type) {
        case "series": return renderSeries(metric, data, original, !!secondMetric && secondMetric !== metric);
        case "distribution": return renderDistribution(metric, data, original);
        case "scatter": return renderScatter(xMetric, metric, data);
        case "rolling": return <RollingChart data={data} selection={selection} settings={settings}
          count={summary.find(item => item.key === metric)!.summary.n} timezone={timezone}/>;
      }
    }}</AnalysisChart>;
    if (type !== "series" || !secondMetric || secondMetric === metric) return chart;
    return <div className="chart-small-multiples"><div>{chart}</div><div>
      <AnalysisChart selection={selection} settings={chartSettings("series", secondMetric)}>
        {data => data.type === "series" && renderSeries(secondMetric, data, false, true)}
      </AnalysisChart>
    </div></div>;
  }

  return <div className="insights-content">
    <div className="insights-toolbar"><div><h2>{title}</h2><p>{report && <>{showSampleControl&&sampleSize!=="all"?`Random sample of ${count} from ${periodCount} records`:`${count} records`} in {selectedPeriod.label.toLowerCase()} · {includeManual?"automated and manual readings":"automated readings only"} · dates shown in {timezone}</>}</p>{report && <p className="analysis-scope">{scope === "city" ? "City" : scope === "global" ? "All cities" : "Saved cities"} · n = {count.toLocaleString()}</p>}</div><div className="insights-toolbar-controls"><label className="analysis-mobile-period sample-size-control"><span>Time range</span><select value={period} disabled={loadingPeriod} onChange={event=>changePeriod(event.target.value as AnalysisPeriod)}>{periodOptions.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</select></label><div className="segmented-control" role="group" aria-label="Statistics time range">{periodOptions.map(option=><button key={option.key} className={period===option.key?"selected":""} aria-pressed={period===option.key} disabled={loadingPeriod} onClick={()=>changePeriod(option.key)}>{option.label}</button>)}</div><label className="sample-size-control"><span>Dataset</span><select value={includeManual?"all":"automated"} onChange={event=>setIncludeManual(event.target.value==="all")}><option value="automated">Automated</option><option value="all">Include manual</option></select></label>{showSampleControl&&<label className="sample-size-control"><span>Sample size</span><select value={sampleSize} onChange={event=>{const value=event.target.value as typeof sampleSize;setSampleSize(value);setSampleSeed(Math.floor(Math.random()*4294967296));}}><option value="all">All readings</option>{sampleSizes.map(size=><option key={size} value={String(size)}>{size.toLocaleString()} readings</option>)}</select></label>}</div></div>

    {loadingPeriod && <p className="plain-caption" role="status">Loading readings for the selected range...</p>}
    {!report && <AnalysisStatus error={reportRequest.error} retry={reportRequest.retry}/>}
    <div hidden={!report}>
    {displayedReport && <div className="analysis-layout"><AnalysisNavigation prefix={sectionPrefix} hasModels={!!model} /><div className="analysis-body">
    <div className="analysis-section" data-analysis-section="overview" id={sectionPrefix+"-overview"}>
    <section className="insight-section" aria-labelledby={sectionPrefix+"-summary-heading"}><div className="insight-heading"><h3 id={sectionPrefix+"-summary-heading"}>Summary statistics</h3><p>Each row uses only values recorded for that metric; missing values are excluded.</p></div>
      <div className="analysis-kpis">{summary.filter(item=>["aqi","temperature_c","relative_humidity"].includes(item.key)).map(item=><div key={item.key}><span>{item.label} {item.unit}</span><strong>{fmt(item.summary.mean)}</strong><small>Mean · n = {item.summary.n}</small></div>)}</div>
      <div className="table-scroll"><table className="stats-table"><thead><tr><th scope="col">Metric</th><th scope="col">n</th><th scope="col">Mean</th><th scope="col">Median</th><th scope="col">Min</th><th scope="col">Max</th><th scope="col">SD</th><th scope="col">Variance</th><th scope="col">IQR</th><th scope="col">5th pct.</th><th scope="col">95th pct.</th><th scope="col">Mode</th></tr></thead><tbody>{summary.map(item=><tr key={item.key}><th scope="row">{item.label}{item.unit&&<small> {item.unit}</small>}</th><td>{item.summary.n}</td><td>{fmt(item.summary.mean)}</td><td>{fmt(item.summary.median)}</td><td>{fmt(item.summary.min)}</td><td>{fmt(item.summary.max)}</td><td>{fmt(item.summary.sd)}</td><td>{fmt(item.summary.variance)}</td><td>{fmt(item.summary.iqr)}</td><td>{fmt(item.summary.p05)}</td><td>{fmt(item.summary.p95)}</td><td>{fmt(item.summary.mode)}</td></tr>)}</tbody></table></div>
      <p className="plain-caption">Standard deviation describes the typical distance from the average. Variance is the squared spread.</p>
    </section>

    </div>
    <div className="analysis-section" data-analysis-section="charts" id={sectionPrefix+"-charts"}><div className="insight-grid">
      <ChartWorkspace render={config => renderChart(config)} dataset={includeManual ? "Automated and manual readings" : "Automated readings only"} defaults={{
        series: {
          config: { type: "series", metric, xMetric },
          controls: <label className="workspace-metric">Time-series metric<select value={metric} onChange={event=>setMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>,
          chart: <><p className="plain-caption">Points use actual observation timestamps; no missing hours are filled in.</p>{renderChart({ type: "series", metric, xMetric }, true)}</>,
        },
        distribution: {
          config: { type: "distribution", metric: distributionMetric, xMetric },
          controls: <label className="workspace-metric">Distribution metric<select value={distributionMetric} onChange={event=>setDistributionMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>,
          chart: <><p className="plain-caption">Count of observations by value range.</p>{renderChart({ type: "distribution", metric: distributionMetric, xMetric }, true)}</>,
        },
        scatter: {
          config: { type: "scatter", metric: yMetric, xMetric },
          controls: <div className="pair-selects"><label><span>X axis</span><select value={xMetric} onChange={event=>setXMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label><span>Y axis</span><select value={yMetric} onChange={event=>setYMetric(event.target.value as MetricKey)}>{NUMERIC_METRICS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>,
          chart: renderChart({ type: "scatter", metric: yMetric, xMetric }),
        },
        rolling: {
          config: { type: "rolling", metric: rollingMetric, xMetric, rollingWindow },
          controls: <div className="pair-selects">
            <label><span>Rolling variable</span><select value={rollingMetric} onChange={event => setRollingMetric(event.target.value as MetricKey)}>
              {NUMERIC_METRICS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select></label>
            <label><span>Averaging window</span><select value={rollingWindow} onChange={event => setRollingWindow(event.target.value as RollingWindow)}>
            {Object.entries(rollingWindowOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label></div>,
          chart: renderChart({ type: "rolling", metric: rollingMetric, xMetric, rollingWindow }),
        },
      }} />
    </div></div>
    <div className="analysis-section" data-analysis-section="relationships" id={sectionPrefix+"-relationships"}><div className="insight-grid">
      <section className="chart-panel span-12" aria-labelledby={sectionPrefix+"-correlation-heading"}><div className="chart-heading"><div><h3 id={sectionPrefix+"-correlation-heading"}>Metric relationships</h3><p>{correlationMethod[0].toUpperCase()+correlationMethod.slice(1)} correlation, pairwise complete; each cell shows r and n.</p></div><label className="compact-select"><span className="sr-only">Correlation method</span><select value={correlationMethod} onChange={event=>setCorrelationMethod(event.target.value as typeof correlationMethod)}><option value="pearson">Pearson</option><option value="spearman">Spearman</option></select></label></div>
        <div className="matrix-scroll"><table className="correlation-table"><caption className="sr-only">Correlation matrix for tracked numeric measurements</caption><thead><tr><th scope="col">Metric</th>{NUMERIC_METRICS.map(item=><th key={item.key} scope="col" title={item.label}>{item.label}</th>)}</tr></thead><tbody>{matrix.map(row=><tr key={row.key}><th scope="row">{row.label}</th>{row.cells.map(cell=><td key={cell.key} className={cell.suppressed?"suppressed-cell":""} title={`${row.label} and ${metricLabel(cell.key)}; n=${cell.n}`} style={cell.r===null?undefined:{background:`color-mix(in srgb, ${cell.r<0?"var(--chart-2)":"var(--chart-1)"} ${Math.abs(cell.r)*32}%, var(--surface))`}}>{cell.suppressed?`n=${cell.n}`:fmt(cell.r)}</td>)}</tr>)}</tbody></table></div>
        <p className="chart-alt">Cells with fewer than 10 paired observations suppress the correlation. Sample size appears in each cell.</p>
      </section>


    </div></div>
    <div className="analysis-section" data-analysis-section="patterns" id={sectionPrefix+"-patterns"}><div className="insight-grid">
      <section className="chart-panel span-12" aria-labelledby={sectionPrefix+"-patterns-heading"}><div className="chart-heading"><div><h3 id={sectionPrefix+"-patterns-heading"}>Time patterns</h3><p>Average AQI by local hour and day of week.</p></div></div>
        {renderPatterns()}
      </section>


    </div></div>
    <div className="analysis-section" data-analysis-section="comparisons" id={sectionPrefix+"-comparisons"}><div className="insight-grid">
      <section className="chart-panel span-12" aria-labelledby={sectionPrefix+"-groups-heading"}><div className="chart-heading"><div><h3 id={sectionPrefix+"-groups-heading"}>AQI group comparisons</h3><p>Compare AQI summaries across pollutant, precipitation, cloud, temperature, and humidity groups.</p></div><label className="compact-select"><span className="sr-only">Group AQI by</span><select value={groupMode} onChange={event=>setGroupMode(event.target.value as typeof groupMode)}><option value="pollutant">Primary pollutant</option><option value="precipitation">Precipitation type</option><option value="cloud">Cloud coverage</option><option value="temperature">Temperature range</option><option value="humidity">Relative humidity range</option></select></label></div>
        {anova.suppressed?<Insufficient n={anova.n} need={10}/>:<><div className="group-list">{anovaGroups.map(group=><div className="group-row" key={group.label}><strong>{group.label}</strong><span>n = {group.stats.n}</span><span>Mean AQI {fmt(group.stats.mean)}</span><span>Median {fmt(group.stats.median)}</span></div>)}</div><p className="chart-alt">ANOVA F = {fmt(anova.fStatistic)} · p-value {formatPValue(anova.pValue)} · n = {anova.n}. This exploratory test describes group differences and does not establish cause.</p></>}
        <div className="categorical-grid">{categories.map(category => <CategoryDistribution key={category.title} {...category}/>)}</div>
      </section>

    </div></div>
    {model&&<div className="analysis-section" data-analysis-section="models" id={sectionPrefix+"-models"}><div className="insight-grid">
      {model&&<section className="chart-panel span-12" aria-labelledby={sectionPrefix+"-model-heading"}><div className="chart-heading"><div><h3 id={sectionPrefix+"-model-heading"}>Weather regression model</h3><p>Predictive associations for {metricLabel(metric)} using complete automated observations and local-hour controls.</p></div></div>{model.status!=="ok"?<div className="insufficient">{model.status==="insufficient"?`Model unlocks after 100 complete automated records. Currently ${model.n} complete rows.`:"Model is suppressed because the selected data do not support a stable fit."}</div>:<><p>Adjusted R² {fmt(model.value.adjustedRSquared)} · residual SD {fmt(model.value.residualSd)} · n = {model.value.n}. Predictive association, not cause.</p><div className="table-scroll"><table className="stats-table"><thead><tr><th scope="col">Feature</th><th scope="col">Standardized coefficient</th><th scope="col">95% CI</th><th scope="col">p</th><th scope="col">VIF</th></tr></thead><tbody>{model.value.coefficients.map(item=><tr key={item.feature}><th scope="row">{item.feature}</th><td>{fmt(item.estimate)}</td><td>{fmt(item.ci95[0])} to {fmt(item.ci95[1])}</td><td>{formatPValue(item.pValue)}</td><td>{fmt(item.vif)}</td></tr>)}</tbody></table></div><p className="plain-caption">This model summarizes predictive association in the selected sample. Feature importance is not available in this release.</p></>}</section>}
      {grid&&<section className="chart-panel span-12" aria-labelledby={sectionPrefix+"-grid-heading"}><div className="chart-heading"><div><h3 id={sectionPrefix+"-grid-heading"}>Two-condition weather grid</h3><p>Mean {metricLabel(metric)} for combinations of two weather conditions. Cells need at least five complete readings.</p></div><div className="pair-selects"><label><span>Rows</span><select value={gridY} onChange={event=>setGridY(event.target.value as typeof gridY)}>{gridOptions.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</select></label><label><span>Columns</span><select value={gridX} onChange={event=>setGridX(event.target.value as typeof gridX)}>{gridOptions.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</select></label></div></div>{grid.status!=="ok"?<div className="insufficient">Not enough complete weather data for a grid.</div>:grid.value.length===0?<div className="empty-panel small-empty">No complete rows for these weather conditions.</div>:<div className="matrix-scroll"><table className="correlation-table"><caption className="sr-only">Mean target by two weather condition bins</caption><thead><tr><th scope="col">{gridY}</th>{[...new Set(grid.value.map(cell=>cell.x))].map(value=><th scope="col" key={value}>{value}</th>)}</tr></thead><tbody>{[...new Set(grid.value.map(cell=>cell.y))].map(y=><tr key={y}><th scope="row">{y}</th>{[...new Set(grid.value.map(cell=>cell.x))].map(x=>{const cell=grid.value.find(value=>value.x===x&&value.y===y);return <td key={x} className={cell?.suppressed?"suppressed-cell":""} title={cell?`${cell.cityCount} contributing cities; n=${cell.n}${cell.dominanceWarning?"; dominated by one city":""}`:"No observations"}>{cell?.suppressed?`n < 5 (${cell.n})`:cell?`${fmt(cell.mean)} · n ${cell.n}`:"—"}</td>;})}</tr>)}</tbody></table></div>}<p className="plain-caption">Weather and air-quality patterns show association, not cause. Cells with low sample counts are hidden.</p></section>}
      {scenarios.length>0&&<section className="chart-panel span-12" aria-labelledby={sectionPrefix+"-scenario-heading"}><div className="chart-heading"><div><h3 id={sectionPrefix+"-scenario-heading"}>Weather scenario comparisons</h3><p>Each predefined condition is compared with all other selected observations. Tests are exploratory.</p></div></div><div className="group-list">{scenarios.map(({scenario,result})=><div className="group-row" key={scenario.key}><strong>{scenario.label}</strong>{result.status==="ok"?<><span>Inside n {result.value.inside.n} · mean {fmt(result.value.inside.mean)}</span><span>Outside n {result.value.outside.n} · mean {fmt(result.value.outside.mean)}</span><span>Difference {fmt(result.value.difference)} (95% CI {fmt(result.value.ci95[0])} to {fmt(result.value.ci95[1])}) · p-value {formatPValue(result.value.pValue)}</span></>:<span>Not enough data (n = {result.n}; need {result.required} per group)</span>}</div>)}</div><p className="plain-caption">These patterns show association, not cause. Scenario thresholds are exploratory.</p></section>}
    </div></div>}
    <div className="analysis-section" data-analysis-section="quality" id={sectionPrefix+"-quality"}>      <section className="chart-panel span-12" aria-labelledby={sectionPrefix+"-quality-heading"}><div className="chart-heading"><div><h3 id={sectionPrefix+"-quality-heading"}>Data quality</h3><p>Coverage for the selected time range.</p></div></div><div className="quality-stats"><div><span>Records</span><strong>{count}</strong></div><div><span>Date range</span><strong>{dateStart?`${getLocalDate(dateStart,timezone)} – ${getLocalDate(dateEnd!,timezone)}`:"N/A"}</strong></div><div><span>Manual entries</span><strong>{manualCount}</strong></div><div><span>Automated entries</span><strong>{automatedCount}</strong></div></div><div className="missing-grid">{dataQuality.map(item=><div key={item.key}><span>{item.label}{item.key==="cloud_coverage_eighths"?" (eighths)":""}</span><strong>{item.missing===null?"N/A":`${fmt(item.missing)}% N/A`}</strong><span className="missing-track"><i style={{width:`${item.missing??0}%`}}/></span></div>)}</div></section>
    </div>
    </div></div>}
    </div>
  </div>;
}

function Insufficient({n,need}:{n:number;need:number}) { return <div className="insufficient">Not enough data yet (n = {n}, need {need})</div>; }
function RollingChart({ data, selection, settings, count, timezone }: {
  data: Extract<InsightsChart, { type: "rolling" }>;
  selection: URLSearchParams;
  settings: ChartSettings;
  count: number;
  timezone: string;
}) {
  const showShort = settings.window !== "long";
  const showLong = settings.window !== "short";
  const { rows, total } = data;
  if (count < 5) return <Insufficient n={count} need={5}/>;
  if (!rows.length) return <p className="plain-caption">No rolling averages are available for this window.</p>;
  return <>
    <div className="rolling-legend">
      {showShort && <span><i className="legend-dot"/>24 hour window</span>}
      {showLong && <span><i className="legend-dot seven-day"/>7 day window</span>}
    </div>
    <div className="chart-frame"><ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{top:8,right:12,bottom:8,left:4}}>
        <CartesianGrid stroke="var(--border)" vertical={false}/>
        <XAxis dataKey="timestamp" type="number" scale="time" domain={["dataMin","dataMax"]} tickFormatter={formatChartDate} stroke="var(--ink-muted)"/>
        <YAxis tickFormatter={fmt} width={42} stroke="var(--ink-muted)"/>
        <ChartTooltip labelFormatter={value => formatChartDate(value) === "" ? "" : getLocalDate(new Date(Number(value)).toISOString(), timezone)}/>
        {showShort && <Line dataKey="short" name="24 hour" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls={false}/>}
        {showLong && <Line dataKey="long" name="7 day" stroke="var(--chart-2)" strokeWidth={2} dot={false} connectNulls={false}/>}
      </LineChart>
    </ResponsiveContainer></div>
    <p className="chart-alt">Rolling values are calculated from readings that fall within each time window.</p>
    <ExactChartToggle selection={selection} settings={settings} total={total} formatRows={chart => chart.type === "rolling" ? chart.rows.map(row => ({
      Time: getLocalDate(new Date(row.timestamp).toISOString(), timezone),
      ...(showShort ? { "24 hours": fmt(row.short) } : {}),
      ...(showLong ? { "7 days": fmt(row.long) } : {}),
    })) : []}/>
  </>;
}

function chartSettings(type: ChartSettings["type"], metric: MetricKey, xMetric: MetricKey = "temperature_c", window: RollingWindow = "both"): ChartSettings {
  return { type, metric, xMetric: type === "scatter" ? xMetric : "temperature_c", window };
}

function analysisUrl(selection: URLSearchParams, settings: Record<string, string | number>) {
  const query = new URLSearchParams(selection);
  for (const [key, value] of Object.entries(settings)) query.set(key, String(value));
  return `/api/insights?${query}`;
}

function AnalysisStatus({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div role="alert" className="error-panel">{error} <button type="button" onClick={retry}>Retry</button></div>
    : <p className="plain-caption" role="status">Loading statistics?</p>;
}

function AnalysisChart({ selection, settings, children }: {
  selection: URLSearchParams;
  settings: ChartSettings;
  children: (data: InsightsChart) => React.ReactNode;
}) {
  const { data, error, retry } = useAnalysisResult<InsightsChart>(analysisUrl(selection, settings));
  return data ? <>{children(data)}{data.type !== "distribution" && data.total > data.rows.length &&
    <p className="plain-caption">Showing {data.rows.length.toLocaleString()} of {data.total.toLocaleString()} points. Statistics use all selected observations.</p>}</>
    : <AnalysisStatus error={error} retry={retry}/>;
}

type ExactTableProps = {
  selection: URLSearchParams;
  settings: ChartSettings;
  total: number;
  formatRows: (chart: InsightsChart) => Array<Record<string, string | number>>;
};

function ExactChartToggle(props: ExactTableProps) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="table-toggle" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      {open ? "Hide data table" : "View as table"}
    </button>
    {open && <ExactChartTable key={analysisUrl(props.selection, props.settings)} {...props}/>}
  </>;
}

function ExactChartTable({ selection, settings, total, formatRows }: ExactTableProps) {
  const [page, setPage] = useState(1);
  const { data, error, retry } = useAnalysisResult<InsightsChart>(analysisUrl(selection, { ...settings, page }));
  const pageCount = Math.max(1, Math.ceil(total / chartTablePageSize));
  return <>
    {data ? <DataTable rows={formatRows(data)}/> : <AnalysisStatus error={error} retry={retry}/>}
    {pageCount > 1 && <div className="segmented-control" role="group" aria-label="Chart data pages">
      <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} of {pageCount}</span>
      <button type="button" disabled={page === pageCount} onClick={() => setPage(page + 1)}>Next</button>
    </div>}
  </>;
}

function DataTable({rows}:{rows:Array<Record<string,string|number>>}) { const cols=Object.keys(rows[0]??{}); return <div className="data-table-scroll"><table className="data-table"><thead><tr>{cols.map(col=><th key={col} scope="col">{col}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{cols.map(col=><td key={col}>{row[col]}</td>)}</tr>)}</tbody></table></div>; }
function PatternList({title,rows}:{title:string;rows:Array<{label:string;mean:number|null;n:number}>}) { return <div className="pattern-list"><strong>{title}</strong>{rows.length?rows.map(row=><div key={row.label}><span>{row.label}</span><b>{fmt(row.mean)}</b><small>n {row.n}</small></div>):<small>Not enough data yet</small>}</div>; }
function CategoryDistribution({ title, rows }: { title: string; rows: InsightsReport["categories"][number]["rows"] }) {
  return <div className="category-distribution"><strong>{title}</strong>{rows.length
    ? rows.map(({ label, count, percent }) => <div key={label}><span>{label}</span><b>{fmt(percent)}%</b><small>n {count}</small></div>)
    : <span className="muted-line">Not available</span>}</div>;
}
