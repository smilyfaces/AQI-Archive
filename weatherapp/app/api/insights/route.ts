import { z } from "zod";
import { analysisPeriods } from "@/lib/analysis-periods";
import { calculateChart, calculateInsights } from "@/lib/insights-analysis";
import { loadInsightsDataset } from "@/lib/insights-data";
import { groupModes, weatherBins } from "@/lib/insights-settings";
import { NUMERIC_METRICS } from "@/lib/metrics";

const periods = z.enum(analysisPeriods.map(period => period.key));
const metric = z.enum(NUMERIC_METRICS.map(item => item.key));
const sourceSchema = z.object({
  asOf: z.coerce.number().int().min(1).max(8_640_000_000_000_000),
  slug: z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  days: z.coerce.number().int().min(1).max(3650).optional(),
  archivePeriod: periods.optional(),
  period: periods,
  includeManual: z.enum(["true", "false"]).transform(value => value === "true"),
  sampleSize: z.enum(["all", "100", "500", "1000", "5000"]).transform(value => value === "all" ? null : Number(value)),
  sampleSeed: z.coerce.number().int().min(0).max(0xffffffff),
});
const viewSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("report"), metric,
    groupMode: z.enum(groupModes), gridX: z.enum(weatherBins), gridY: z.enum(weatherBins),
    correlationMethod: z.enum(["pearson", "spearman"]),
  }),
  z.object({
    type: z.enum(["series", "distribution", "scatter", "rolling"]), metric, xMetric: metric,
    window: z.enum(["short", "long", "both"]), page: z.coerce.number().int().min(1).max(10_000_000).optional(),
  }),
]);

export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const source = sourceSchema.safeParse(query);
  const view = viewSchema.safeParse(query);
  if (!source.success || !view.success) {
    return Response.json({ error: "Invalid analysis settings." }, { status: 400 });
  }
  const input = source.data;
  if (input.slug ? input.archivePeriod !== undefined : input.archivePeriod !== input.period || input.days !== undefined) {
    return Response.json({ error: "Invalid analysis range." }, { status: 400 });
  }
  try {
    const dataset = await loadInsightsDataset(input);
    const result = view.data.type === "report"
      ? calculateInsights(dataset, input, view.data)
      : calculateChart(dataset, input, view.data);
    return Response.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return Response.json({ error: "Could not load analysis for this selection." }, { status: 503 });
  }
}
