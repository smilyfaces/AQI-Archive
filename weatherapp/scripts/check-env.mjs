import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const required = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "AIRNOW_API_KEY", "OPENAQ_API_KEY", "NWS_USER_AGENT", "INGEST_SECRET", "PASSWORD",
];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) {
  console.log(`Missing: ${missing.join(", ")}`);
  process.exitCode = 1;
  process.exit();
}

const results = [];
async function check(name, url, headers = {}) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
    const body = await response.text();
    let apiCode = null;
    let payload = null;
    try { payload = JSON.parse(body); apiCode = payload?.code ?? null; } catch { /* Empty and non-JSON responses are fine for the connectivity check. */ }
    const schemaPending = (name === "Supabase REST" || name === "Supabase service key") && apiCode === "PGRST205";
    const validPayload = name === "AirNow hourly service" ? Array.isArray(payload)
      : name === "OpenAQ v3" ? Array.isArray(payload?.results)
      : name === "NWS points" ? Boolean(payload?.properties?.observationStations)
      : true;
    results.push({ name, status: response.status, apiCode, ok: (response.ok && validPayload) || schemaPending, schemaPending });
  } catch (error) {
    results.push({ name, status: "unreachable", ok: false, reason: error instanceof Error ? error.name : "request error" });
  }
}

const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
await check("Supabase REST", `${supabaseUrl.origin}/rest/v1/cities?select=id&limit=1`, { apikey: anon, Authorization: `Bearer ${anon}` });
await check("Supabase service key", `${supabaseUrl.origin}/rest/v1/cities?select=id&limit=1`, { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` });

const hour = new Date();
hour.setUTCMinutes(0, 0, 0);
hour.setUTCHours(hour.getUTCHours() - 1);
const hourString = hour.toISOString().slice(0, 13);
const airNow = new URL("https://www.airnowapi.org/aq/data/");
for (const [key, value] of Object.entries({ startDate: hourString, endDate: new Date(hour.getTime() + 3_600_000).toISOString().slice(0, 13), parameters: "O3,PM25,PM10,NO2,SO2,CO", BBOX: "-81.25,33.25,-80.8,34.25", dataType: "A", format: "application/json", verbose: "1", API_KEY: process.env.AIRNOW_API_KEY })) airNow.searchParams.set(key, value);
await check("AirNow hourly service", airNow, {});
await check("OpenAQ v3", "https://api.openaq.org/v3/locations?limit=1&iso=US", { "X-API-Key": process.env.OPENAQ_API_KEY });
await check("NWS points", "https://api.weather.gov/points/34.0007,-81.0348", { "User-Agent": process.env.NWS_USER_AGENT, Accept: "application/geo+json" });

for (const result of results) console.log(`${result.schemaPending ? "CONNECTED · migrations pending" : result.ok ? "OK" : "CHECK"} ${result.name}: ${result.schemaPending ? result.apiCode : result.status}${result.reason ? ` (${result.reason})` : ""}`);
console.log(`Local ingest secret: ${process.env.INGEST_SECRET.length >= 32 ? "present" : "too short"}`);
if (results.some(result => !result.ok) || process.env.INGEST_SECRET.length < 32) process.exitCode = 1;
