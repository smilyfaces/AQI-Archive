import { createClient } from "@supabase/supabase-js";
import { cityCatalog, manualLatest, type CitySummary } from "@/lib/catalog";

export type Reading = {
  id?: number;
  city_id?: string;
  recorded_at: string;
  source: "manual" | "automated";
  aqi: number | null;
  aqi_category: string | null;
  primary_pollutant: string | null;
  pm25: number | null;
  pm10: number | null;
  ozone: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  temperature_c: number | null;
  relative_humidity: number | null;
  cloud_coverage_pct: number | null;
  precipitation_last_hour_mm: number | null;
  precipitation_type: string | null;
  text_description: string | null;
  wind_speed_ms: number | null;
  weather_station_id: string | null;
  weather_observed_at: string | null;
  aqi_source_site: string | null;
};

export type City = CitySummary & {
  id?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  data_source_note?: string | null;
  stale?: boolean;
  latest: Reading | null;
};

const emptyReading = (recorded_at: string, source: "manual" | "automated"): Reading => ({
  recorded_at, source, aqi: null, aqi_category: null, primary_pollutant: null,
  pm25: null, pm10: null, ozone: null, no2: null, so2: null, co: null,
  temperature_c: null, relative_humidity: null, cloud_coverage_pct: null,
  precipitation_last_hour_mm: null, precipitation_type: null, text_description: null,
  wind_speed_ms: null, weather_station_id: null, weather_observed_at: null, aqi_source_site: null,
});

function localCities(): City[] {
  return cityCatalog.map(city => {
    const latest = manualLatest[city.slug];
    if (!latest) return { ...city, latest: null };
    return { ...city, stale: true, data_source_note: city.slug === "lamont-ok" ? "Nearby reporting sites are used when local observations are unavailable." : null,
      latest: { ...emptyReading(latest.recorded_at, "manual"), aqi: latest.aqi, aqi_category: latest.aqi_category,
        primary_pollutant: latest.primary_pollutant, [latest.pollutant_field]: latest.concentration } } as City;
  });
}

function publicDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? createClient(url, anon, { auth: { persistSession: false } }) : null;
}

export async function getCities(): Promise<{ cities: City[]; error: string | null; localFallback: boolean }> {
  const db = publicDb();
  if (!db) return { cities: localCities(), error: null, localFallback: true };
  const [{ data: cities, error: cityError }, { data: readings, error: readingError }] = await Promise.all([
    db.from("cities").select("id,slug,name,state,lat,lon,timezone,data_source_note").eq("is_active", true).order("name"),
    db.from("latest_readings").select("*").limit(200),
  ]);
  if (cityError || readingError || !cities) return { cities: [], error: cityError?.message ?? readingError?.message ?? "Could not load city readings.", localFallback: false };
  const latestBySlug = new Map((readings ?? []).map(row => [row.slug as string, row as Reading]));
  return { cities: cities.map(city => {
    const latest = latestBySlug.get(city.slug) ?? null;
    return { ...city, latest, stale: latest ? Date.now() - new Date(latest.recorded_at).getTime() > 3*60*60*1000 : false } as City;
  }), error: null, localFallback: false };
}

export async function getCity(slug: string): Promise<{ city: City | null; readings: Reading[]; error: string | null; localFallback: boolean }> {
  const db = publicDb();
  if (!db) {
    const city = localCities().find(item => item.slug === slug) ?? null;
    return { city: city ?? null, readings: city?.latest ? [city.latest] : [], error: null, localFallback: true };
  }
  const { data: row, error: cityError } = await db.from("cities").select("id,slug,name,state,lat,lon,timezone,data_source_note").eq("slug", slug).maybeSingle();
  if (cityError) return { city: null, readings: [], error: cityError.message, localFallback: false };
  if (!row) return { city: null, readings: [], error: null, localFallback: false };
  const { data: rows, error: readingsError } = await db.from("readings").select("*").eq("city_id", row.id).order("recorded_at", { ascending: false }).limit(5000);
  if (readingsError) return { city: null, readings: [], error: readingsError.message, localFallback: false };
  const readings = (rows ?? []) as Reading[];
  const latest = readings[0] ?? null;
  return { city: { ...row, latest, stale: latest ? Date.now() - new Date(latest.recorded_at).getTime() > 3*60*60*1000 : false } as City, readings, error: null, localFallback: false };
}
