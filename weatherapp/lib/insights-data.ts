import { analysisPeriods } from "@/lib/analysis-periods";
import { getAllReadings, getCity, type Reading } from "@/lib/data";
import { cityInsightsDataset, type InsightsDataset } from "@/lib/insights-analysis";
import type { InsightsSource } from "@/lib/insights-settings";

const datasets = new Map<string, { promise: Promise<InsightsDataset>; expires: number }>();
const cacheLifetime = 5 * 60_000;
const cacheLimit = 12;

function datasetKey({ asOf, slug, days, archivePeriod }: InsightsSource) {
  return JSON.stringify([slug, days, archivePeriod, asOf]);
}

export function filterSavedHistory(readings: Reading[], days: number, asOf: number) {
  const cutoff = asOf - days * 86_400_000;
  return readings.filter(row => {
    const timestamp = Date.parse(row.recorded_at);
    return timestamp >= cutoff && timestamp <= asOf;
  });
}

export function savedHistoryAnchor(readings: Reading[]) {
  return readings.reduce((latest, row) => Math.max(latest, Date.parse(row.recorded_at)), 0);
}

function storeDataset(key: string, promise: Promise<InsightsDataset>) {
  if (datasets.size >= cacheLimit) datasets.delete(datasets.keys().next().value!);
  datasets.set(key, { promise, expires: Date.now() + cacheLifetime });
  void promise.catch(() => {
    if (datasets.get(key)?.promise === promise) datasets.delete(key);
  });
}

export function rememberInsightsDataset(source: InsightsSource, dataset: InsightsDataset) {
  storeDataset(datasetKey(source), Promise.resolve(dataset));
}

export function loadInsightsDataset(source: InsightsSource) {
  const key = datasetKey(source);
  const cached = datasets.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = fetchInsightsDataset(source);
  storeDataset(key, promise);
  return promise;
}

async function fetchInsightsDataset({ slug, days, asOf, archivePeriod }: InsightsSource): Promise<InsightsDataset> {
  if (slug) {
    const { city, readings, error } = await getCity(slug);
    if (error || !city) throw new Error(error ?? "City not found.");
    const rows = days === undefined ? readings : filterSavedHistory(readings, days, asOf);
    return cityInsightsDataset(city, rows, days === undefined ? asOf : savedHistoryAnchor(rows), days !== undefined);
  }
  const duration = analysisPeriods.find(period => period.key === archivePeriod)?.duration;
  const { readings, cities, error } = await getAllReadings(duration, asOf);
  if (error) throw new Error(error);
  return { readings, cities, now: asOf, timezone: "UTC", scope: { kind: "global" } };
}
