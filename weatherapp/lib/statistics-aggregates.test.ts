import { describe, expect, it } from "vitest";
import { aggregateStatisticsRows, type DailyMetricAggregate } from "@/lib/statistics-aggregates";

describe("backend statistics rollups", () => {
  it("combines source rows without losing missing counts or city weighting", () => {
    const rows: DailyMetricAggregate[] = [
      { city_id: "a", local_date: "2026-06-01", source: "automated", metric_key: "aqi", record_count: 12, value_count: 10, value_sum: 20, value_sum_squares: 50 },
      { city_id: "b", local_date: "2026-06-01", source: "automated", metric_key: "aqi", record_count: 20, value_count: 20, value_sum: 200, value_sum_squares: 2100 },
      { city_id: "a", local_date: "2026-06-01", source: "automated", metric_key: "pm25", record_count: 12, value_count: 8, value_sum: 40, value_sum_squares: 240 },
    ];
    const result = aggregateStatisticsRows(rows, [
      { id: "a", slug: "alpha", name: "Alpha", state: "AA" },
      { id: "b", slug: "beta", name: "Beta", state: "BB" },
      { id: "c", slug: "gamma", name: "Gamma", state: "CC" },
    ]);
    const aqi = result.metrics.find(item => item.metric === "aqi")!;
    expect(aqi.entryWeighted).toMatchObject({ n: 30, nMissing: 2, mean: 220 / 30 });
    expect(aqi.entryWeighted.variance).toBeCloseTo((2150 - 220 * 220 / 30) / 29, 10);
    expect(aqi.cityWeighted).toMatchObject({ mean: 6, contributingCities: 2 });
    expect(result.sourceCounts).toEqual({ automated: 32, manual: 0, total: 32 });
    expect(result.rankings.ranked.map(city => city.slug)).toEqual(["alpha", "beta"]);
    expect(result.rankings.lowCoverage.map(city => city.slug)).toEqual(["gamma"]);
    expect(result.warnings[0]).toContain("quantiles");
  });

  it("returns null summary values for metrics with no valid observations", () => {
    const result = aggregateStatisticsRows([
      { city_id: "a", local_date: "2026-06-01", source: "manual", metric_key: "ozone", record_count: 4, value_count: 0, value_sum: 0, value_sum_squares: 0 },
    ], [{ id: "a", slug: "alpha", name: "Alpha", state: "AA" }]);
    expect(result.metrics[0].entryWeighted).toMatchObject({ n: 0, nMissing: 4, mean: null, sd: null, variance: null });
  });
});
