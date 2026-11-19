import { z } from "zod";
import { getArchive, type Reading } from "@/lib/data";

const input = z.object({
  slugs: z.array(z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(100),
});
const readingColumns = [
  "recorded_at", "source", "aqi", "aqi_category", "primary_pollutant",
  "pm25", "pm10", "ozone", "no2", "so2", "co", "temperature_c", "dewpoint_c",
  "relative_humidity", "cloud_coverage_pct", "cloud_coverage_label", "precipitation_last_hour_mm",
  "precipitation_3h_mm", "precipitation_6h_mm", "precipitation_type", "text_description",
  "wind_speed_ms", "wind_direction_deg", "wind_gust_ms", "barometric_pressure_pa",
  "sea_level_pressure_pa", "visibility_m", "heat_index_c", "wind_chill_c",
  "weather_station_id", "weather_observed_at", "aqi_source_site",
] as const satisfies readonly (keyof Reading)[];

function csvRow(values: readonly (string | number | null | undefined)[]) {
  return values.map(value => {
    if (typeof value !== "string") return value ?? "";
    const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(",");
}

async function exportCity(slug: string, before: string) {
  const options = { pageSize: 1000, before };
  const first = await getArchive(slug, { page: 1 }, options);
  if (first.error || !first.city) throw new Error(slug);

  const city = first.city;
  const prefix = [city.slug, city.name, city.state, city.timezone];
  const lines: string[] = [];
  for (let page = 1; ; page++) {
    const result = page === 1 ? first : await getArchive(slug, { page }, options);
    if (result.error || !result.city || result.total !== first.total) throw new Error(slug);
    for (const row of result.rows) {
      lines.push(csvRow([...prefix, ...readingColumns.map(column => row[column])]));
    }
    if (lines.length >= first.total) return lines.join("\r\n");
    if (result.rows.length < options.pageSize) throw new Error(slug);
  }
}

export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Select valid saved cities to export." }, { status: 400 });

  const slugs = [...new Set(parsed.data.slugs)];
  const before = new Date().toISOString();
  const sections = [csvRow(["city_slug", "city", "state", "timezone", ...readingColumns])];
  try {
    for (let start = 0; start < slugs.length; start += 4) {
      const batch = await Promise.all(slugs.slice(start, start + 4).map(slug => exportCity(slug, before)));
      sections.push(...batch.filter(Boolean));
    }
  } catch {
    return Response.json({ error: "Could not export every saved city. Try again in a moment." }, { status: 502 });
  }

  return new Response("\uFEFF" + sections.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="saved-cities-archive.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
