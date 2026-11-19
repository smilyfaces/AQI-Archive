import type { Reading } from "@/lib/data";
import type { InsightsSource } from "@/lib/insights-settings";
import { NUMERIC_METRICS, type MetricKey } from "@/lib/metrics";
import { mannWhitney, metricValue, pairedTTest, summarize, wilcoxonSignedRank, type AnalysisScope } from "@/lib/statistics";

type History = { slug: string; readings: Reading[] };

function comparisonWindow(histories: History[], mode: "overlap" | "all") {
  if (mode === "all" || histories.length < 2) return histories;
  const bounds = histories.flatMap(({ readings }) => {
    let first = Infinity;
    let last = -Infinity;
    for (const row of readings) {
      const time = Date.parse(row.recorded_at);
      if (!Number.isFinite(time)) continue;
      first = Math.min(first, time);
      last = Math.max(last, time);
    }
    return first <= last ? [[first, last] as const] : [];
  });
  const start = Math.max(...bounds.map(([first]) => first));
  const end = Math.min(...bounds.map(([, last]) => last));
  return histories.map(({ slug, readings }) => ({
    slug,
    readings: bounds.length < 2 || start > end ? [] : readings.filter(row => {
      const time = Date.parse(row.recorded_at);
      return time >= start && time <= end;
    }),
  }));
}

function pairTests(histories: History[], metric: MetricKey) {
  if (histories.length < 2) return null;
  const [first, second] = histories;
  const scope: AnalysisScope = { kind: "cities", cityIds: [first.slug, second.slug] };
  const a = first.readings.map(row => metricValue(row, metric)).filter(value => value !== null);
  const b = second.readings.map(row => metricValue(row, metric)).filter(value => value !== null);
  const bByTime = new Map(second.readings.map(row => [Date.parse(row.recorded_at), metricValue(row, metric)]));
  const pairedA: number[] = [];
  const pairedB: number[] = [];
  for (const row of first.readings) {
    const x = metricValue(row, metric);
    const y = bByTime.get(Date.parse(row.recorded_at));
    if (x !== null && y != null) {
      pairedA.push(x);
      pairedB.push(y);
    }
  }
  return {
    mw: mannWhitney(a, b, scope),
    paired: pairedTTest(pairedA, pairedB, scope),
    wilcoxon: wilcoxonSignedRank(pairedA, pairedB, scope),
    pairedN: pairedA.length,
  };
}

export function calculateSavedComparison(histories: History[], metric: MetricKey, mode: "overlap" | "all") {
  const selected = comparisonWindow(histories, mode);
  const byTime = new Map<number, Record<string, number>>();
  const summaries = Object.fromEntries(selected.map(({ slug, readings }) => {
    const values = readings.map(row => {
      const value = metricValue(row, metric);
      if (value === null) return null;
      const timestamp = Date.parse(row.recorded_at);
      byTime.set(timestamp, { ...byTime.get(timestamp), [slug]: value });
      return value;
    });
    return [slug, summarize(values)];
  }));
  const ranked = Object.keys(summaries)
    .filter(slug => summaries[slug].mean !== null)
    .sort((a, b) => (metric === "aqi" ? 1 : -1) * (summaries[a].mean! - summaries[b].mean!));
  const chartRows = [...byTime].sort(([a], [b]) => a - b)
    .map(([timestamp, values]) => ({ timestamp, ...values }));
  return { summaries, ranked, chartRows, pair: pairTests(selected, metric) };
}
export type SavedComparison = ReturnType<typeof calculateSavedComparison>;

export function summarizeSavedHistory(readings: Reading[], source: InsightsSource, timezone: string) {
  const keys = ["aqi", "pm25", "temperature_c", "relative_humidity"] as const;
  const summaries = keys.map(key => ({
    key, label: NUMERIC_METRICS.find(item => item.key === key)!.label,
    stats: summarize(readings.map(row => metricValue(row, key))),
  }));
  return { count: readings.length, summaries, source, timezone };
}
export type SavedHistorySummary = ReturnType<typeof summarizeSavedHistory>;
