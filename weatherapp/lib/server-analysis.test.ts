import { expect, it } from "vitest";
import { GET } from "@/app/api/insights/route";
import type { Reading } from "@/lib/data";
import { calculateInsights } from "@/lib/insights-analysis";
import { rememberInsightsDataset } from "@/lib/insights-data";
import { calculateSavedComparison } from "@/lib/saved-analysis";

function reading(aqi: number, timestamp: number, source: Reading["source"] = "automated") {
  return { aqi, temperature_c: aqi / 10, source, recorded_at: new Date(timestamp).toISOString() } as Reading;
}

it("computes archive statistics on every eligible reading and serves bounded charts with exact table rows", async () => {
  const asOf = Date.parse("2026-11-18T15:00:00Z");
  const readings = Array.from({ length: 1300 }, (_, index) => reading(index, asOf - (1300 - index) * 60_000));
  const manual = reading(5000, asOf, "manual");
  const source = { asOf, archivePeriod: "all" as const };
  rememberInsightsDataset(source, { readings: [...readings, manual], now: asOf, timezone: "UTC", scope: { kind: "global" }, cities: [] });
  const query = new URLSearchParams({
    asOf: String(asOf), archivePeriod: "all", period: "all", includeManual: "false",
    sampleSize: "all", sampleSeed: "0", metric: "aqi",
  });

  async function request(params: Record<string, string>) {
    const response = await GET(new Request(`http://localhost/api/insights?${new URLSearchParams({ ...Object.fromEntries(query), ...params })}`));
    expect(response.status).toBe(200);
    return response.json();
  }

  const reportSettings = { type: "report", correlationMethod: "pearson", groupMode: "pollutant", gridX: "temp_bin", gridY: "wind_bin" };
  const report = await request(reportSettings);
  expect(report.count).toBe(1300);
  expect(report.summary.find((item: { key: string }) => item.key === "aqi").summary.mean).toBe(649.5);
  expect(report.matrix[0].cells.find((item: { key: string }) => item.key === "temperature_c")).toMatchObject({ n: 1300, suppressed: false });

  const chart = { type: "series", xMetric: "temperature_c", window: "both" };
  const series = await request(chart);
  expect(series.total).toBe(1300);
  expect(series.rows).toHaveLength(1200);
  const table = await request({ ...chart, page: "13" });
  expect(table.rows).toHaveLength(100);
  expect(table.rows[0].value).toBe(1200);
  expect(table.rows.at(-1).value).toBe(1299);

  const scatter = await request({ ...chart, type: "scatter" });
  expect(scatter.pearson.n).toBe(1300);
  expect(scatter.rows).toHaveLength(1200);
  const distribution = await request({ ...chart, type: "distribution" });
  expect(distribution.rows.reduce((count: number, row: { count: number }) => count + row.count, 0)).toBe(1300);
  const rolling = await request({ ...chart, type: "rolling" });
  expect(rolling.rows.at(-1)).toMatchObject({ short: 649.5, long: 649.5 });

  const sampled = await request({ ...reportSettings, includeManual: "true", sampleSize: "100" });
  expect(sampled).toMatchObject({ count: 100, periodCount: 1301 });
  const sampledSeries = await request({ ...chart, includeManual: "true", sampleSize: "100" });
  expect(sampledSeries.total).toBe(sampled.count);
});

it("handles city archive readings from before optional weather fields were populated", () => {
  const now = Date.parse("2026-11-18T15:00:00Z");
  const city = { id: "test-city", name: "Test", state: "NY", timezone: "UTC", lat: 40, lon: -74 };
  const readings = [{ ...reading(20, now), city_id: city.id }];
  const report = calculateInsights({
    readings, now, timezone: "UTC", scope: { kind: "city", cityId: city.id }, cities: [city],
  }, { period: "all", includeManual: false, sampleSize: null, sampleSeed: 0 });
  expect(report).toMatchObject({ count: 1, model: { status: "insufficient" } });
});

it("computes saved-city tests only from the requested comparison window", () => {
  const start = Date.parse("2026-11-18T00:00:00Z");
  const first = Array.from({ length: 14 }, (_, index) => reading(index, start + index * 60_000));
  const second = Array.from({ length: 14 }, (_, index) => reading(index + 20, start + (index + 4) * 60_000));
  const histories = [{ slug: "first", readings: first }, { slug: "second", readings: second }];
  const overlap = calculateSavedComparison(histories, "aqi", "overlap");
  expect(overlap.summaries.first).toMatchObject({ n: 10, mean: 8.5 });
  expect(overlap.summaries.second).toMatchObject({ n: 10, mean: 24.5 });
  expect(overlap.pair).toMatchObject({ pairedN: 10, mw: { status: "ok" } });
  expect(overlap.chartRows).toHaveLength(10);
  expect(calculateSavedComparison(histories, "aqi", "all").summaries.first.n).toBe(14);
});
