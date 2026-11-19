import { z } from "zod";
import { getCity } from "@/lib/data";
import { cityInsightsDataset } from "@/lib/insights-analysis";
import { filterSavedHistory, rememberInsightsDataset, savedHistoryAnchor } from "@/lib/insights-data";
import { NUMERIC_METRICS } from "@/lib/metrics";
import { calculateSavedComparison, summarizeSavedHistory } from "@/lib/saved-analysis";

const querySchema = z.object({
  slugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(10),
  days: z.coerce.number().int().min(1).max(3650),
  mode: z.enum(["readings", "compare", "summary"]),
  metric: z.enum(NUMERIC_METRICS.map(item => item.key)),
  window: z.enum(["overlap", "all"]),
});
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    slugs: searchParams.getAll("slug"), days: searchParams.get("days") ?? 30,
    mode: searchParams.get("mode") ?? "readings", metric: searchParams.get("metric") ?? "aqi",
    window: searchParams.get("window") ?? "overlap",
  });
  if (!parsed.success || new Set(parsed.data.slugs).size !== parsed.data.slugs.length ||
      (parsed.data.mode === "summary" && parsed.data.slugs.length !== 1)) {
    return Response.json({ error: "Choose one to ten valid saved cities and a time range from 1 to 3650 days." }, { status: 400 });
  }
  const { slugs, days, mode, metric, window } = parsed.data;
  const asOf = Date.now();
  const results = await Promise.all(slugs.map(async slug => {
    const result = await getCity(slug);
    return { slug, city: result.city, readings: filterSavedHistory(result.readings, days, asOf), error: result.error };
  }));
  const headers = { "Cache-Control": "private, no-store" };
  if (mode === "readings") {
    return Response.json({ cities: results.map(({ slug, readings, error }) => ({ slug, readings, error })) }, { headers });
  }
  if (results.some(result => result.error)) {
    return Response.json({ error: "Could not load selected city history." }, { status: 503 });
  }
  if (mode === "compare") {
    return Response.json(calculateSavedComparison(results, metric, window), { headers });
  }
  const [{ city, slug, readings }] = results;
  if (!city) return Response.json({ error: "City not found." }, { status: 404 });
  const source = { slug, days, asOf };
  const dataset = cityInsightsDataset(city, readings, savedHistoryAnchor(readings), true);
  rememberInsightsDataset(source, dataset);
  return Response.json(summarizeSavedHistory(readings, source, dataset.timezone), { headers });
}
