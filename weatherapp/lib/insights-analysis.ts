import { analysisPeriods } from "@/lib/analysis-periods";
import type { City, Reading } from "@/lib/data";
import { chartTablePageSize, defaultReportSettings, type AnalysisSelection, type ChartSettings, type ReportSettings } from "@/lib/insights-settings";
import { formatNumber } from "@/lib/format-number";
import { NUMERIC_METRICS } from "@/lib/metrics";
import {
  binnedGrid, compareCondition, correlation, deriveFeatures, groupedAverages, metricValue,
  multipleWeatherRegression, oneWayAnova, rollingAverages, summarize, timeTrend, WEATHER_SCENARIOS,
  type AnalysisScope, type CityContext,
} from "@/lib/statistics";

export type InsightsDataset = {
  readings: Reading[];
  now: number;
  timezone: string;
  scope: AnalysisScope;
  cities: CityContext[];
};

export function cityInsightsDataset(city: City, readings: Reading[], now: number, saved = false): InsightsDataset {
  const cityId = city.id ?? city.slug;
  const timezone = city.timezone ?? (saved ? "America/New_York" :
    city.slug === "oakland-ca" ? "America/Los_Angeles" :
    city.slug === "lamont-ok" ? "America/Chicago" : "America/New_York");
  const cities = city.lat !== undefined && city.lon !== undefined ? [{
    id: cityId, slug: city.slug, name: city.name, state: city.state, timezone,
    lat: city.lat, lon: city.lon, region: city.region, climateType: city.climate_type,
    sizeBand: city.size_band, population: city.population,
  }] : [];
  return {
    readings: readings.map(row => ({ ...row, city_id: row.city_id ?? cityId })),
    now, timezone, scope: { kind: "city", cityId }, cities,
  };
}

function randomSample<T>(values: T[], size: number, seed: number): T[] {
  const shuffled = [...values];
  let state = seed >>> 0;
  const nextRandom = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(nextRandom() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled.slice(0, Math.min(size, shuffled.length));
}
type SelectedReadings = { visible: Reading[]; periodCount: number };
const selectedReadingsCache = new WeakMap<InsightsDataset, { key: string; selected: SelectedReadings }>();

function selectReadings(dataset: InsightsDataset, selection: AnalysisSelection): SelectedReadings {
  const { readings, now } = dataset;
  const key = JSON.stringify([selection.period, selection.includeManual, selection.sampleSize, selection.sampleSeed]);
  const cached = selectedReadingsCache.get(dataset);
  if (cached?.key === key) return cached.selected;
  const duration = analysisPeriods.find(period => period.key === selection.period)!.duration;
  const periodReadings = readings.filter(row => {
    const age = now - Date.parse(row.recorded_at);
    return age >= 0 && age <= duration && (selection.includeManual || row.source === "automated");
  }).sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const visible = selection.sampleSize === null ? periodReadings :
    randomSample(periodReadings, selection.sampleSize, selection.sampleSeed)
      .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const selected = { visible, periodCount: periodReadings.length };
  selectedReadingsCache.set(dataset, { key, selected });
  return selected;
}

function groupAqi(visible: Reading[], groupMode: ReportSettings["groupMode"]) {
  const groups=new Map<string,number[]>();
  for(const row of visible){
    let category:string|null=null;
    if(groupMode==="pollutant")category=row.primary_pollutant;
    else if(groupMode==="precipitation")category=row.precipitation_type;
    else if(groupMode==="cloud")category=row.cloud_coverage_label;
    else if(groupMode==="temperature"&&row.temperature_c!==null){const fahrenheit=row.temperature_c*9/5+32;category=fahrenheit<32?"<32°F":fahrenheit<50?"32–50°F":fahrenheit<65?"50–65°F":fahrenheit<80?"65–80°F":fahrenheit<90?"80–90°F":">90°F";}
    else if(groupMode==="humidity"&&row.relative_humidity!==null){const humidity=row.relative_humidity;category=humidity<30?"<30%":humidity<50?"30–50%":humidity<70?"50–70%":humidity<90?"70–90%":">90%";}
    if(category&&row.aqi!==null){const group=groups.get(category)??[];group.push(row.aqi);groups.set(category,group);}
  }
  return [...groups];
}

function categoryDistribution(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    total++;
  }
  return [...counts].sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, percent: count * 100 / total }));
}

function calculateMatrix(columns: ReturnType<typeof metricColumns>, correlationMethod: ReportSettings["correlationMethod"]) {
  const pairs = columns.map((x, index) =>
    columns.slice(index).map(y => correlation(x.values, y.values, correlationMethod)));
  return columns.map(({ key, label }, i) => ({
    key, label,
    cells: columns.map((y, j) => {
      const { r, n, suppressed } = i <= j ? pairs[i][j - i] : pairs[j][i - j];
      return { key: y.key, r, n, suppressed };
    }),
  }));
}

function metricColumns(visible: Reading[]) {
  return NUMERIC_METRICS.map(item => ({ ...item, values: visible.map(row => metricValue(row, item.key)) }));
}

function describeBase(visible: Reading[], timezone: string, columns: ReturnType<typeof metricColumns>) {
  const summary = columns.map(({ values, ...item }) => ({ ...item, summary: summarize(values) }));
  return {
    summary,
    manualCount: visible.filter(row => row.source === "manual").length,
    automatedCount: visible.filter(row => row.source === "automated").length,
    hourly: groupedAverages(visible, timezone, "hour").sort((a, b) => Number(a.label) - Number(b.label)),
    weekly: groupedAverages(visible, timezone, "weekday"),
    trend: timeTrend(visible, "aqi"),
    categories: [
      { title: "AQI category", rows: categoryDistribution(visible.map(row => row.aqi_category)) },
      { title: "Primary pollutant", rows: categoryDistribution(visible.map(row => row.primary_pollutant)) },
      { title: "Precipitation type", rows: categoryDistribution(visible.map(row => row.precipitation_type)) },
      { title: "Cloud coverage", rows: categoryDistribution(visible.map(row => row.cloud_coverage_label)) },
    ],
  };
}

const descriptions = new WeakMap<Reading[], {
  base: ReturnType<typeof describeBase>;
  matrices: Map<ReportSettings["correlationMethod"], ReturnType<typeof calculateMatrix>>;
}>();

function describeReadings(visible: Reading[], timezone: string, method: ReportSettings["correlationMethod"]) {
  let columns: ReturnType<typeof metricColumns> | undefined;
  let description = descriptions.get(visible);
  if (!description) {
    columns = metricColumns(visible);
    description = { base: describeBase(visible, timezone, columns), matrices: new Map() };
    descriptions.set(visible, description);
  }
  let matrix = description.matrices.get(method);
  if (!matrix) {
    matrix = calculateMatrix(columns ?? metricColumns(visible), method);
    description.matrices.set(method, matrix);
  }
  return { ...description.base, matrix };
}

export function calculateInsights(dataset: InsightsDataset, selection: AnalysisSelection, settings: ReportSettings = defaultReportSettings) {
  const { visible, periodCount } = selectReadings(dataset, selection);
  const { scope, cities, timezone } = dataset;
  const { metric, gridX, gridY, groupMode, correlationMethod } = settings;
  const derived = scope.kind === "city" && cities.length ? deriveFeatures(visible, cities, scope) : [];
  const model = derived.length ? multipleWeatherRegression(derived, metric, scope) : null;
  const grid = derived.length ? binnedGrid(derived, gridX, gridY, metric, scope) : null;
  const scenarioValues = derived.map(row => metricValue(row, metric) ?? Number.NaN);
  const scenarios = derived.length ? WEATHER_SCENARIOS.map(({ key, label, test }) => ({
    scenario: { key, label }, result: compareCondition(scenarioValues, derived.map(test), scope),
  })) : [];

  const { summary, matrix, hourly, weekly, trend, categories, manualCount, automatedCount } =
    describeReadings(visible, timezone, correlationMethod);
  const groups = groupAqi(visible, groupMode);
  return {
    count: visible.length, periodCount, scope: scope.kind,
    dateStart: visible[0]?.recorded_at, dateEnd: visible.at(-1)?.recorded_at,
    manualCount, automatedCount,
    summary, matrix, model, grid, scenarios,
    dataQuality: summary.map(({ key, label, summary }) => ({
      key, label, missing: visible.length ? (visible.length - summary.n) * 100 / visible.length : null,
    })),
    anova: oneWayAnova(groups.map(([, values]) => values)),
    anovaGroups: groups.map(([label, values]) => ({ label, stats: summarize(values) })),
    hourly, weekly, trend, categories,
  };
}
export type InsightsReport = ReturnType<typeof calculateInsights>;

const chartPointLimit = 1200;

function chartPoints<T>(rows: T[], page?: number) {
  if (page !== undefined) return rows.slice((page - 1) * chartTablePageSize, page * chartTablePageSize);
  if (rows.length <= chartPointLimit) return rows;
  return Array.from({ length: chartPointLimit }, (_, index) =>
    rows[Math.round(index * (rows.length - 1) / (chartPointLimit - 1))]);
}

export function calculateChart(dataset: InsightsDataset, selection: AnalysisSelection, settings: ChartSettings) {
  const { visible } = selectReadings(dataset, selection);
  const { type, metric, xMetric, window, page } = settings;
  if (type === "series") {
    const rows = visible.flatMap(row => {
      const value = metricValue(row, metric);
      return value === null ? [] : [{ timestamp: Date.parse(row.recorded_at), value, recorded_at: row.recorded_at }];
    });
    return { type, total: rows.length, rows: chartPoints(rows, page) } as const;
  }
  if (type === "distribution") {
    const values = visible.map(row => metricValue(row, metric)).filter(value => value !== null);
    const summary = summarize(values);
    const { min, max } = summary;
    const bins = Math.min(8, Math.max(1, Math.ceil(Math.sqrt(values.length))));
    const width = min === null || max === null ? 0 : (max - min) / bins;
    const rows = min === null || max === null ? [] : min === max ?
      [{ range: formatNumber(min), count: values.length }] :
      Array.from({ length: bins }, (_, index) => {
        const start = min + index * width;
        const end = index === bins - 1 ? max : min + (index + 1) * width;
        const count = values.filter(value => value >= start && (index === bins - 1 ? value <= end : value < end)).length;
        return { range: `${formatNumber(start)}?${formatNumber(end)}`, count };
      });
    return { type, summary, rows } as const;
  }
  if (type === "scatter") {
    const pearson = correlation(visible.map(row => metricValue(row, xMetric)), visible.map(row => metricValue(row, metric)));
    let minX = Infinity;
    let maxX = -Infinity;
    const rows = visible.flatMap(row => {
      const x = metricValue(row, xMetric);
      const y = metricValue(row, metric);
      if (x === null || y === null) return [];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      return [{ x, y, recorded_at: row.recorded_at }];
    });
    const { slope, intercept } = pearson;
    const regression = slope === null || intercept === null ? [] : [minX, maxX].map(x => ({ x, y: slope * x + intercept }));
    return { type, pearson, regression, total: rows.length, rows: chartPoints(rows, page) } as const;
  }
  const day = 86_400_000;
  const short = window !== "long" ? rollingAverages(visible, metric, day) : [];
  const long = window !== "short" ? rollingAverages(visible, metric, 7 * day) : [];
  const combined = new Map<number, { timestamp: number; short?: number; long?: number }>();
  for (const row of short) combined.set(row.timestamp, { timestamp: row.timestamp, short: row.mean });
  for (const row of long) combined.set(row.timestamp, { ...combined.get(row.timestamp), timestamp: row.timestamp, long: row.mean });
  const rows = [...combined.values()].sort((a, b) => a.timestamp - b.timestamp);
  return { type, total: rows.length, rows: chartPoints(rows, page) } as const;
}
export type InsightsChart = ReturnType<typeof calculateChart>;
