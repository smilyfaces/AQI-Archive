// Supabase Edge Function. Run with `supabase functions serve ingest` or deploy with the Supabase CLI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@4";
import { AIR_QUALITY_SEARCH_RADII_KM, averageAtNearestRadius, type NearbyValue } from "../_shared/airnow-aggregation.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const retry = async (url: string, init: RequestInit, attempts = 3): Promise<Response> => {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
      const retryAfter = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
      const retryAfterDate = retryAfter && !Number.isFinite(retryAfterSeconds) ? Date.parse(retryAfter) : NaN;
      const delay = response.status === 429
        ? Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : Number.isFinite(retryAfterDate) ? retryAfterDate - Date.now() : 1000
        : 500 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(delay, 30_000))));
      last = new Error(`HTTP ${response.status}`);
    } catch (error) {
      last = error;
      if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw last instanceof Error ? last : new Error("Request failed after retries");
};
const json = async <T>(url: string, init?: RequestInit): Promise<T> => (await retry(url, init ?? {})).json();
let openAqQueue: Promise<void> = Promise.resolve();
let openAqNextRequestAt = 0;
let openAqRateLimitedUntil = 0;
function openAqJson<T>(url: string, init: RequestInit): Promise<T> {
  const pending = openAqQueue.then(async () => {
    if (Date.now() < openAqRateLimitedUntil) throw new Error("OpenAQ temporarily paused after a rate limit");
    const waitMs = Math.max(0, openAqNextRequestAt - Date.now());
    if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
    try {
      const result = await json<T>(url, init);
      openAqNextRequestAt = Date.now() + 750;
      return result;
    } catch (error) {
      if (String(error).includes("HTTP 429")) openAqRateLimitedUntil = Date.now() + 5 * 60_000;
      openAqNextRequestAt = Date.now() + (String(error).includes("HTTP 429") ? 30_000 : 750);
      throw error;
    }
  });
  openAqQueue = pending.then(() => undefined, () => undefined);
  return pending;
}
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const nwsValue = (v: { value?: number | null } | null | undefined): number | null => num(v?.value);
const nwsMillimeters = (v: { value?: number | null; unitCode?: string } | null | undefined): number | null => {
  const value = nwsValue(v);
  if (value === null) return null;
  const unit = v?.unitCode?.toLowerCase() ?? "";
  if (unit.includes(":in") || unit.endsWith("inch")) return value * 25.4;
  if (unit.includes(":cm") || unit.endsWith("centimeter")) return value * 10;
  return value;
};
const category = (aqi: number | null) => aqi === null ? null : aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy for Sensitive Groups" : aqi <= 200 ? "Unhealthy" : aqi <= 300 ? "Very Unhealthy" : "Hazardous";
const cloudMap: Record<string, [number, string]> = { CLR: [0,"Clear"], SKC: [0,"Clear"], FEW: [12.5,"Few"], SCT: [50,"Scattered"], BKN: [75,"Broken"], OVC: [100,"Overcast"], VV: [100,"Overcast"] };
const precipitation = (items: Array<{ rawString?: string; weather?: string }> = []) => {
  const text = items.map(x => `${x.rawString ?? ""} ${x.weather ?? ""}`).join(" ").toUpperCase();
  if (/FZRA|FREEZING RAIN/.test(text)) return "freezing_rain";
  const found = [
    ["freezing_rain", /FZRA|FREEZING RAIN/], ["sleet", /PL|ICE PELLET|SLEET/], ["snow", /SN|SNOW/],
    ["hail", /GR|GS|HAIL/], ["drizzle", /DZ|DRIZZLE/], ["rain", /RA|RAIN/],
  ].filter(([, re]) => (re as RegExp).test(text)).map(([name]) => name as string);
  if (found.length > 1) return "mixed";
  return found[0] ?? "none";
};
const propsSchema = z.object({ properties: z.record(z.string(), z.unknown()) });
const pointSchema = z.object({ properties: z.object({ observationStations: z.string().url() }) });
const stationListSchema = z.object({ features: z.array(z.object({ id: z.string(), properties: z.object({ stationIdentifier: z.string().optional() }).passthrough() })) });
const openAqLocationsSchema = z.object({ results: z.array(z.object({ id: z.number(), distance: z.number().nullable().optional(), sensors: z.array(z.object({ id: z.number(), parameter: z.object({ name: z.string(), units: z.string() }) })) })) });
const openAqMeasurementsSchema = z.object({ results: z.array(z.object({ value: z.number().nullable(), parameter: z.object({ units: z.string() }), period: z.object({ datetimeFrom: z.object({ utc: z.string() }).nullable().optional(), datetimeTo: z.object({ utc: z.string() }).nullable().optional() }).nullable().optional() })) });
const airNowItemSchema = z.object({
  Latitude: z.number().optional(), Longitude: z.number().optional(), UTC: z.string().optional(),
  Parameter: z.string(), Unit: z.string().optional(), Value: z.number().nullable().optional(),
  AQI: z.number().nullable().optional(), SiteName: z.string().optional(), FullAQSCode: z.string().optional(),
}).passthrough();
const ingestRequestSchema = z.object({
  slugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(60).optional(),
}).passthrough();
type City = { id: string; slug: string; name: string; state: string; lat: number; lon: number; timezone: string; nws_station_id: string | null; openaq_location_ids: number[] };

async function weatherFor(city: City, headers: HeadersInit) {
  const point = pointSchema.parse(await json<unknown>(`https://api.weather.gov/points/${city.lat},${city.lon}`, { headers }));
  const stations = stationListSchema.parse(await json<unknown>(point.properties.observationStations, { headers }));
  const candidates = stations.features.slice(0, 5);
  let freshest: { properties: Record<string, unknown>; station: string; time: number } | null = null;
  for (const candidate of candidates) {
    const station = candidate.properties?.stationIdentifier ?? candidate.id.split("/").at(-1) ?? "unknown";
    try {
      const feature = await json<unknown>(`https://api.weather.gov/stations/${station}/observations/latest`, { headers });
      const parsed = propsSchema.safeParse(feature);
      if (!parsed.success) continue;
      const p = parsed.data.properties as Record<string, unknown>;
      const ts = Date.parse(String(p.timestamp ?? ""));
      if (!Number.isFinite(ts) || Date.now() - ts > 2 * 60 * 60 * 1000) continue;
      const layers = Array.isArray(p.cloudLayers) ? p.cloudLayers as Array<{ amount?: { value?: string | null }; base?: { value?: number | null } }> : [];
      const useful = layers.some(layer => !!cloudMap[layer.amount?.value ?? ""]);
      if (!freshest || ts > freshest.time) freshest = { properties: p, station, time: ts };
      if (useful) { freshest = { properties: p, station, time: ts }; break; }
    } catch { /* A failed station is skipped; the next nearest station may have data. */ }
  }
  if (!freshest) throw new Error("No recent NWS station observations found among the five nearest stations");
  const p = freshest.properties as Record<string, unknown>;
  const pWet = Array.isArray(p.presentWeather) ? p.presentWeather as Array<{ rawString?: string; weather?: string }> : [];
  const layers = Array.isArray(p.cloudLayers) ? p.cloudLayers as Array<{ amount?: { value?: string | null }; base?: { value?: number | null } }> : [];
  const cloud = layers.map(layer => cloudMap[layer.amount?.value ?? ""]).filter(Boolean).sort((a,b) => b[0]-a[0])[0];
  const quantified = (name: string) => nwsValue(p[name] as { value?: number | null } | null | undefined);
  const precipitationAmount = (name: string) => nwsMillimeters(p[name] as { value?: number | null; unitCode?: string } | null | undefined);
  return {
    temperature_c: quantified("temperature"), dewpoint_c: quantified("dewpoint"), relative_humidity: quantified("relativeHumidity"),
    cloud_coverage_pct: cloud?.[0] ?? null, cloud_coverage_label: cloud?.[1] ?? null, cloud_layers: layers.length ? layers : null,
    precipitation_last_hour_mm: precipitationAmount("precipitationLastHour"), precipitation_3h_mm: precipitationAmount("precipitationLast3Hours"),
    precipitation_6h_mm: precipitationAmount("precipitationLast6Hours"), precipitation_type: precipitation(pWet),
    text_description: typeof p.textDescription === "string" ? p.textDescription : null,
    wind_speed_ms: quantified("windSpeed"), wind_direction_deg: quantified("windDirection"), wind_gust_ms: quantified("windGust"),
    barometric_pressure_pa: quantified("barometricPressure"), sea_level_pressure_pa: quantified("seaLevelPressure"),
    visibility_m: quantified("visibility"), heat_index_c: quantified("heatIndex"), wind_chill_c: quantified("windChill"),
    present_weather: pWet.length ? pWet : null, raw_metar: typeof p.rawMessage === "string" ? p.rawMessage : null,
    weather_station_id: freshest.station, weather_observed_at: new Date(freshest.time).toISOString(),
    raw_weather: p,
  };
}

function airNowUrl(city: City, hour: Date, apiKey: string, dataType: "A" | "C") {
  const next = new Date(hour.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 13);
  const maxRadiusKm = AIR_QUALITY_SEARCH_RADII_KM.at(-1)!;
  const latDelta = maxRadiusKm / 110.574;
  const lonDelta = maxRadiusKm / (111.32 * Math.cos(city.lat * Math.PI / 180));
  const bbox = `${city.lon-lonDelta},${city.lat-latDelta},${city.lon+lonDelta},${city.lat+latDelta}`;
  const query = new URLSearchParams({ startDate: fmt(hour), endDate: fmt(next), parameters: "O3,PM25,PM10,NO2,SO2,CO", BBOX: bbox, dataType, format: "application/json", verbose: "1", API_KEY: apiKey });
  return `https://www.airnowapi.org/aq/data/?${query}`;
}
const paramField: Record<string, string> = { "PM2.5": "pm25", PM25: "pm25", PM10: "pm10", O3: "ozone", OZONE: "ozone", NO2: "no2", SO2: "so2", CO: "co" };
const distanceKm = (lat1:number,lon1:number,lat2:number,lon2:number) => {
  const toRad=(degrees:number)=>degrees*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
const selectedSiteLabel=(average:{count:number;radiusKm:number;sites:string[]}|undefined) => average
  ? `${average.sites.length?average.sites.join(", "):"Nearby sites"} (avg ${average.count}; within ${average.radiusKm} km)`
  : null;
async function airData(city: City, hour: Date, key: string) {
  const [aqiResult, concentrationResult] = await Promise.allSettled([
    json<unknown>(airNowUrl(city, hour, key, "A")),
    json<unknown>(airNowUrl(city, hour, key, "C")),
  ]);
  if (aqiResult.status === "rejected" && concentrationResult.status === "rejected") throw new Error(`AirNow AQI and concentration queries failed: ${String(aqiResult.reason)}; ${String(concentrationResult.reason)}`);
  const aqis = aqiResult.status === "fulfilled" ? z.array(airNowItemSchema).parse(aqiResult.value) : [];
  const concentrations = concentrationResult.status === "fulfilled" ? z.array(airNowItemSchema).parse(concentrationResult.value) : [];
  const aqiMeasurements:NearbyValue[]=[];
  for (const item of aqis) {
    const param = paramField[item.Parameter.toUpperCase()];
    const score = num(item.AQI) ?? num(item.Value);
    if (!param || score===null || num(item.Latitude)===null || num(item.Longitude)===null) continue;
    const distance=distanceKm(city.lat,city.lon,item.Latitude!,item.Longitude!);
    if(distance<=AIR_QUALITY_SEARCH_RADII_KM.at(-1)!)aqiMeasurements.push({parameter:param,value:score,distanceKm:distance,siteName:item.SiteName??item.FullAQSCode});
  }
  const scoreByParam = new Map(Object.entries(averageAtNearestRadius(aqiMeasurements)).map(([parameter,average])=>[parameter,Math.round(average.value)]));
  const aqiAverages=averageAtNearestRadius(aqiMeasurements);
  const primary = [...scoreByParam].sort((a,b) => b[1]-a[1])[0];
  const concentrationMeasurements:NearbyValue[]=[];
  for (const item of concentrations) {
    const param = paramField[item.Parameter.toUpperCase()];
    const value = num(item.Value);
    if (!param || value === null || num(item.Latitude)===null || num(item.Longitude)===null) continue;
    const distance=distanceKm(city.lat,city.lon,item.Latitude!,item.Longitude!);
    if(distance>AIR_QUALITY_SEARCH_RADII_KM.at(-1)!)continue;
    const unit = (item.Unit ?? "").toUpperCase();
    let normalized = value;
    if (unit.includes("PPB")) normalized = value * (param === "ozone" ? 1.96 : param === "no2" ? 1.88 : param === "so2" ? 2.62 : 1);
    else if (unit.includes("PPM") && param === "co") normalized = value * 1.146;
    else if ((unit.includes("MG/M3") || unit.includes("MG/M^3")) && param !== "co") normalized = value * 1000;
    concentrationMeasurements.push({parameter:param,value:normalized,distanceKm:distance,siteName:item.SiteName??item.FullAQSCode});
  }
  const concentrationAverages=averageAtNearestRadius(concentrationMeasurements);
  const values:Record<string,number|null>={pm25:null,pm10:null,ozone:null,no2:null,so2:null,co:null};
  for(const [parameter,average] of Object.entries(concentrationAverages))values[parameter]=average.value;
  const aqi = primary?.[1] ?? null;
  return {
    aqi, aqi_category: category(aqi), primary_pollutant: primary ? ({ pm25:"PM2.5",pm10:"PM10",ozone:"Ozone",no2:"NO2",so2:"SO2",co:"CO" } as Record<string,string>)[primary[0]] : null,
    pm25: values.pm25,pm10:values.pm10,ozone:values.ozone,no2:values.no2,so2:values.so2,co:values.co,
    aqi_pm25: scoreByParam.get("pm25") ?? null,aqi_pm10:scoreByParam.get("pm10") ?? null,aqi_ozone:scoreByParam.get("ozone") ?? null,
    aqi_no2:scoreByParam.get("no2") ?? null,aqi_so2:scoreByParam.get("so2") ?? null,aqi_co:scoreByParam.get("co") ?? null,
    aqi_source_site: primary ? selectedSiteLabel(aqiAverages[primary[0]]) : Object.values(concentrationAverages).map(selectedSiteLabel).filter(Boolean).join("; ") || null,
    raw_aqi: aqis,raw_concentrations: concentrations,
    source_selection:{aqi:aqiAverages,concentrations:concentrationAverages},
    source_errors: [aqiResult.status === "rejected" ? `AQI: ${String(aqiResult.reason)}` : null, concentrationResult.status === "rejected" ? `Concentrations: ${String(concentrationResult.reason)}` : null].filter(Boolean),
  };
}

async function openAqFallback(city: City, hour: Date, key: string, missing: string[]) {
  if (Date.now() < openAqRateLimitedUntil) return {};
  const fields: Record<string,string> = { pm25:"pm25",pm10:"pm10",ozone:"o3",no2:"no2",so2:"so2",co:"co" };
  const locUrl = new URL("https://api.openaq.org/v3/locations");
  locUrl.searchParams.set("coordinates", `${city.lat},${city.lon}`);
  locUrl.searchParams.set("radius", "25000"); locUrl.searchParams.set("iso", "US"); locUrl.searchParams.set("limit", "100");
  const locResponse = openAqLocationsSchema.parse(await openAqJson<unknown>(locUrl.toString(), { headers: { "X-API-Key": key } }));
  const out: Record<string,number|null> = {};
  for (const field of missing) {
    const candidates = locResponse.results.flatMap(loc => loc.sensors.filter(s => s.parameter.name.toLowerCase() === fields[field]).map(sensor => ({ ...sensor, distance: loc.distance ?? Infinity }))).sort((a,b) => a.distance-b.distance);
    for (const sensor of candidates.slice(0, 1)) {
      try {
        const query = new URLSearchParams({ datetime_from: hour.toISOString(), datetime_to: new Date(hour.getTime()+2*60*60*1000).toISOString(), limit:"100" });
        const result = openAqMeasurementsSchema.parse(await openAqJson<unknown>(`https://api.openaq.org/v3/sensors/${sensor.id}/measurements?${query}`, { headers: { "X-API-Key": key } }));
        const valid = result.results.filter(row => row.value !== null && row.period?.datetimeFrom?.utc && Math.abs(Date.parse(row.period.datetimeFrom.utc)-hour.getTime()) <= 2*60*60*1000);
        if (!valid.length) continue;
        let value = valid.reduce((sum, row) => sum + row.value!, 0) / valid.length;
        const unit = valid[0].parameter.units.toLowerCase();
        if (unit === "ppb") value *= field === "ozone" ? 1.96 : field === "no2" ? 1.88 : field === "so2" ? 2.62 : 1;
        if (unit === "ppm" && field === "co") value *= 1.146;
        if (unit === "mg/m³" && field !== "co") value *= 1000;
        out[field] = value;
        break;
      } catch (error) {
        if (String(error).includes("HTTP 429")) throw error;
        /* No usable data from this nearest sensor; leave the field missing. */
      }
    }
  }
  return out;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  const expected = Deno.env.get("INGEST_SECRET");
  if (!expected || request.headers.get("Authorization") !== `Bearer ${expected}`) return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors });
  const parsedRequest = ingestRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedRequest.success) return Response.json({ error: "Invalid city selection" }, { status: 400, headers: cors });
  const requestedSlugs = parsedRequest.data.slugs ? [...new Set(parsedRequest.data.slugs)] : null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const airnowKey = Deno.env.get("AIRNOW_API_KEY");
  const openaqKey = Deno.env.get("OPENAQ_API_KEY");
  const userAgent = Deno.env.get("NWS_USER_AGENT");
  if (!supabaseUrl || !serviceKey || !airnowKey || !userAgent) return Response.json({ error: "Missing server environment variables" }, { status: 500, headers: cors });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: run, error: runError } = await supabase.from("ingest_runs").insert({}).select("id").single();
  if (runError) return Response.json({ error: runError.message }, { status: 500, headers: cors });
  const { data: activeCities, error: cityError } = await supabase.from("cities").select("id,slug,name,state,lat,lon,timezone,nws_station_id,openaq_location_ids").eq("is_active", true);
  if (cityError || !activeCities) return Response.json({ error: cityError?.message ?? "Could not load cities" }, { status: 500, headers: cors });
  const cities = requestedSlugs ? activeCities.filter(city => requestedSlugs.includes(city.slug)) : activeCities;
  if (requestedSlugs && cities.length !== requestedSlugs.length) return Response.json({ error: "One or more selected cities are unavailable" }, { status: 404, headers: cors });
  const now = new Date();
  const hour = new Date(now); hour.setUTCMinutes(0,0,0); hour.setUTCHours(hour.getUTCHours()-1);
  const counts = { ok: 0, partial: 0, failed: 0 };
  const errors: Array<{ city: string; source: string; error: string }> = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < cities.length) {
      const city = cities[nextIndex++] as City;
      const weatherHeaders = { "User-Agent": userAgent, Accept: "application/geo+json" };
      const promises = await Promise.allSettled([
        weatherFor(city, weatherHeaders), airData(city, hour, airnowKey),
      ]);
      const weather = promises[0].status === "fulfilled" ? promises[0].value : null;
      let air = promises[1].status === "fulfilled" ? promises[1].value : null;
      const cityErrors: string[] = [];
      if (!weather) { const message = String((promises[0] as PromiseRejectedResult).reason); errors.push({ city: city.slug, source: "NWS", error: message }); cityErrors.push(message); }
      if (!air) { const message = String((promises[1] as PromiseRejectedResult).reason); errors.push({ city: city.slug, source: "AirNow", error: message }); cityErrors.push(message); }
      if (air) for (const detail of air.source_errors) { errors.push({ city: city.slug, source: "AirNow", error: detail as string }); cityErrors.push(detail as string); }
      if (air && openaqKey) {
        const missing = ["pm25","pm10","ozone","no2","so2","co"].filter(key => air[key] === null);
        if (missing.length) {
          const primaryField: Record<string, string> = { "PM2.5": "pm25", "PM10": "pm10", Ozone: "ozone", NO2: "no2", SO2: "so2", CO: "co" };
          const preferred = primaryField[air.primary_pollutant ?? ""];
          const fallbackFields = preferred && missing.includes(preferred) ? [preferred] : missing.includes("pm25") ? ["pm25"] : missing.slice(0, 1);
          try { const fallback = await openAqFallback(city, hour, openaqKey, fallbackFields); air = { ...air, ...Object.fromEntries(Object.entries(fallback).filter(([,v]) => v !== undefined && v !== null)) }; }
          catch (error) {
            if (!String(error).includes("temporarily paused after a rate limit")) errors.push({ city: city.slug, source: "OpenAQ", error: String(error) });
          }
        }
      }
      if (!weather && !air) { counts.failed++; return; }
      const { raw_weather, raw_aqi, raw_concentrations, ...weatherFields } = weather ?? {};
      const airFields = { ...(air ?? {}) };
      delete airFields.raw_aqi;
      delete airFields.raw_concentrations;
      delete airFields.source_errors;
      const sourceSelection = airFields.source_selection;
      delete airFields.source_selection;
      const payload = {
        city_id: city.id, recorded_at: hour.toISOString(), source: "automated",
        ...(weather ? weatherFields : {}), ...(air ? airFields : {}),
        raw: { ...(weather ? { nws: raw_weather } : {}), ...(air ? { airnow_aqi: raw_aqi, airnow_concentrations: raw_concentrations, source_selection: sourceSelection } : {}) },
      };
      const { error } = await supabase.from("readings").upsert(payload, { onConflict: "city_id,recorded_at" });
      if (error) { counts.failed++; errors.push({ city: city.slug, source: "database", error: error.message }); }
      else if (cityErrors.length) counts.partial++;
      else counts.ok++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, cities.length) }, worker));
  await supabase.from("ingest_runs").update({ finished_at: new Date().toISOString(), cities_ok: counts.ok, cities_partial: counts.partial, cities_failed: counts.failed, errors }).eq("id", run.id);
  return Response.json({ recorded_at: hour.toISOString(), total: cities.length, ...counts, errors }, { headers: cors });
});
