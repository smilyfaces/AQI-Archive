export type DailyMetricAggregate = {
  city_id: string;
  local_date: string;
  source: "automated" | "manual";
  metric_key: string;
  record_count: number;
  value_count: number;
  value_sum: number;
  value_sum_squares: number;
};

export type RollupMetricSummary = {
  n: number;
  nMissing: number;
  mean: number | null;
  variance: number | null;
  sd: number | null;
  method: string;
  warnings: string[];
};

export type RollupCity = { id: string; slug: string; name: string; state: string };
const MIN_RANKING_N = 10;
const METHOD = "city-local-day sufficient-statistics rollup; sample variance from count, sum, and sum of squares";

function summarizeParts(recordCount: number, valueCount: number, sum: number, sumSquares: number): RollupMetricSummary {
  const n = Math.max(0, valueCount);
  const variance = n >= 2 ? Math.max(0, (sumSquares - sum * sum / n) / (n - 1)) : null;
  return {
    n,
    nMissing: Math.max(0, recordCount - n),
    mean: n ? sum / n : null,
    variance,
    sd: variance === null ? null : Math.sqrt(variance),
    method: METHOD,
    warnings: ["Exact medians, quantiles, and extrema cannot be recovered from these additive rollups."] ,
  };
}

export function aggregateStatisticsRows(rows: DailyMetricAggregate[], cities: RollupCity[]) {
  const cityLookup = new Map(cities.map(city => [city.id, city]));
  const byCityMetric = new Map<string, { cityId: string; metric: string; records: number; n: number; sum: number; sumSquares: number }>();
  const sources = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.city_id}\u0000${row.metric_key}`;
    const value = byCityMetric.get(key) ?? { cityId: row.city_id, metric: row.metric_key, records: 0, n: 0, sum: 0, sumSquares: 0 };
    value.records += Number(row.record_count);
    value.n += Number(row.value_count);
    value.sum += Number(row.value_sum);
    value.sumSquares += Number(row.value_sum_squares);
    byCityMetric.set(key, value);
    if (row.metric_key === "aqi") sources.set(row.source, (sources.get(row.source) ?? 0) + Number(row.record_count));
  }

  const cityMetrics = [...byCityMetric.values()].flatMap(value => {
    const city = cityLookup.get(value.cityId);
    if (!city) return [];
    return [{ city, metric: value.metric, summary: summarizeParts(value.records, value.n, value.sum, value.sumSquares) }];
  });
  const metricKeys = [...new Set(cityMetrics.map(value => value.metric))];
  const metrics = metricKeys.map(metric => {
    const groups = cityMetrics.filter(value => value.metric === metric);
    const records = rows.filter(row => row.metric_key === metric).reduce((sum, row) => sum + Number(row.record_count), 0);
    const n = groups.reduce((sum, city) => sum + city.summary.n, 0);
    const total = groups.reduce((sum, city) => sum + city.summary.mean! * city.summary.n, 0);
    const squares = groups.reduce((sum, city) => sum + (city.summary.variance === null ? 0 : city.summary.variance * (city.summary.n - 1)) + city.summary.n * (city.summary.mean ?? 0) ** 2, 0);
    const cityWeightedValues = groups.filter(city => city.summary.mean !== null && city.summary.n >= MIN_RANKING_N).map(city => city.summary.mean!);
    const entryWeighted = summarizeParts(records, n, total, squares);
    const cityWeightedMean = cityWeightedValues.length ? cityWeightedValues.reduce((sum, value) => sum + value, 0) / cityWeightedValues.length : null;
    return { metric, entryWeighted, cityWeighted: { mean: cityWeightedMean, contributingCities: cityWeightedValues.length, method: "unweighted mean of city means; cities require at least 10 observations", warnings: [] as string[] } };
  });

  const aqiByCity = new Map(cityMetrics.filter(item => item.metric === "aqi").map(item => [item.city.id, item]));
  const aqiCities = cities.map(city => {
    const summary = aqiByCity.get(city.id)?.summary;
    return { ...city, n: summary?.n ?? 0, mean: summary?.mean ?? null, eligible: (summary?.n ?? 0) >= MIN_RANKING_N && summary?.mean !== null && summary?.mean !== undefined };
  });
  const ranked = aqiCities.filter(city => city.eligible).sort((a, b) => a.mean! - b.mean!);
  const lowCoverage = aqiCities.filter(city => !city.eligible);
  const entryCount = [...sources.values()].reduce((sum, count) => sum + count, 0);
  return {
    method: METHOD,
    warnings: ["Rollups provide means and sample spread; quantiles, medians, and minimum/maximum are not calculated."],
    sourceCounts: { automated: sources.get("automated") ?? 0, manual: sources.get("manual") ?? 0, total: entryCount },
    metrics,
    cityMetrics,
    rankings: { ranked, lowCoverage, method: "mean AQI by city; minimum 10 valid AQI records" },
  };
}
