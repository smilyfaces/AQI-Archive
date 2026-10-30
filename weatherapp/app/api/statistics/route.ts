import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aggregateStatisticsRows, type DailyMetricAggregate, type RollupCity } from "@/lib/statistics-aggregates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const querySchema = z.object({
  scope: z.enum(["global", "city", "cities"]).default("global"),
  days: z.union([z.literal("all"), z.coerce.number().int().min(1).max(36500)]).default(30),
  dataset: z.enum(["automated", "all"]).default("automated"),
  slugs: z.array(slugSchema).max(100).default([]),
});

type CacheEntry = { expiresAt: number; payload: unknown };
const root = globalThis as typeof globalThis & { __statisticsApiCache?: Map<string, CacheEntry> };
const cache = root.__statisticsApiCache ??= new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function databaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    scope: url.searchParams.get("scope") ?? "global",
    days: url.searchParams.get("days") ?? 30,
    dataset: url.searchParams.get("dataset") ?? "automated",
    slugs: url.searchParams.getAll("slug"),
  });
  if (!parsed.success) return Response.json({ error: "Invalid statistics scope, date range, dataset, or city selection." }, { status: 400 });
  const { scope, days, dataset, slugs } = parsed.data;
  if ((scope === "city" && slugs.length !== 1) || (scope === "cities" && (slugs.length < 2 || slugs.length > 10)) || new Set(slugs).size !== slugs.length) {
    return Response.json({ error: "City scope requires one city; cities scope requires two to ten unique cities." }, { status: 400 });
  }

  const db = databaseClient();
  if (!db) return Response.json({ error: "Statistics backend is not configured." }, { status: 503 });

  try {
    const { data: cityRows, error: cityError } = await db.from("cities")
      .select("id,slug,name,state").eq("is_active", true).order("name");
    if (cityError || !cityRows) return Response.json({ error: "Could not load city metadata for statistics." }, { status: 503 });
    const cities = cityRows as RollupCity[];
    const cityBySlug = new Map(cities.map(city => [city.slug, city]));
    if (slugs.some(slug => !cityBySlug.has(slug))) return Response.json({ error: "One or more selected cities are not active." }, { status: 404 });
    const selectedCities = slugs.length ? slugs.map(slug => cityBySlug.get(slug)!) : cities;
    const cityIds = slugs.length ? selectedCities.map(city => city.id) : null;
    const since = days === "all" ? null : new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const sources = dataset === "automated" ? ["automated"] : ["automated", "manual"];

    const { data: newest, error: versionError } = await db.from("city_daily_metric_aggregates")
      .select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (versionError) return Response.json({ error: "Statistics aggregates are unavailable. Apply migration 0005_additive_statistics_aggregates.sql." }, { status: 503 });

    const key = JSON.stringify({ version: newest?.updated_at ?? "empty", scope, days, dataset, slugs: [...slugs].sort() });
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return Response.json(cached.payload, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "X-Statistics-Cache": "HIT" } });

    const { data: rollups, error: rollupError } = await db.rpc("get_statistics_rollups", {
      p_since: since,
      p_sources: sources,
      p_city_ids: cityIds,
    });
    if (rollupError || !rollups) return Response.json({ error: "Statistics rollups could not be loaded. Confirm migration 0005 is installed." }, { status: 503 });

    const selectedIds = new Set(selectedCities.map(city => city.id));
    const selectedRollups = (rollups as DailyMetricAggregate[]).filter(row => selectedIds.has(row.city_id));
    const report = aggregateStatisticsRows(selectedRollups, selectedCities);
    const payload = {
      scope: { kind: scope, cities: selectedCities.map(city => ({ slug: city.slug, name: city.name, state: city.state })) },
      filters: { days, dataset, since },
      rangeNote: "Date filtering uses city-local daily buckets. The first included local date is included as a whole day.",
      asOf: new Date().toISOString(),
      dataVersion: newest?.updated_at ?? null,
      report,
    };
    if (cache.size >= 64) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return Response.json(payload, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "X-Statistics-Cache": "MISS" } });
  } catch {
    return Response.json({ error: "Statistics could not be computed right now." }, { status: 503 });
  }
}
