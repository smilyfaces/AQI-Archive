import { createClient } from "@supabase/supabase-js";
import { fromZonedTime } from "date-fns-tz";
import { manualEntryTimes, manualEntryTimezone, manualSeedValues } from "../lib/manual-data";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const cityRows = [
  ["columbia-sc","Columbia","SC",34.0007,-81.0348,"America/New_York","KCAE","Columbia",[34.0007,-81.0348]],
  ["oakland-ca","Oakland","CA",37.8044,-122.2712,"America/Los_Angeles","KOAK","Oakland",[37.8044,-122.2712]],
  ["lamont-ok","Lamont","OK",36.6764,-97.5581,"America/Chicago",null,"Enid",[36.6764,-97.5581]],
  ["new-york-ny","New York","NY",40.7128,-74.006,"America/New_York","KNYC","New York",[40.7128,-74.006]],
  ["los-angeles-ca","Los Angeles","CA",34.0522,-118.2437,"America/Los_Angeles","KLAX","Los Angeles",[34.0522,-118.2437]],
  ["chicago-il","Chicago","IL",41.8781,-87.6298,"America/Chicago","KMDW","Chicago",[41.8781,-87.6298]],
  ["houston-tx","Houston","TX",29.7604,-95.3698,"America/Chicago","KHOU","Houston",[29.7604,-95.3698]],
  ["phoenix-az","Phoenix","AZ",33.4484,-112.074,"America/Phoenix","KPHX","Phoenix",[33.4484,-112.074]],
  ["philadelphia-pa","Philadelphia","PA",39.9526,-75.1652,"America/New_York","KPHL","Philadelphia",[39.9526,-75.1652]],
  ["san-antonio-tx","San Antonio","TX",29.4241,-98.4936,"America/Chicago","KSAT","San Antonio",[29.4241,-98.4936]],
  ["san-diego-ca","San Diego","CA",32.7157,-117.1611,"America/Los_Angeles","KSAN","San Diego",[32.7157,-117.1611]],
  ["dallas-tx","Dallas","TX",32.7767,-96.797,"America/Chicago","KDAL","Dallas",[32.7767,-96.797]],
  ["jacksonville-fl","Jacksonville","FL",30.3322,-81.6557,"America/New_York","KJAX","Jacksonville",[30.3322,-81.6557]],
  ["fort-worth-tx","Fort Worth","TX",32.7555,-97.3308,"America/Chicago","KFTW","Dallas-Fort Worth",[32.7555,-97.3308]],
  ["san-jose-ca","San Jose","CA",37.3382,-121.8863,"America/Los_Angeles","KSJC","San Jose",[37.3382,-121.8863]],
  ["austin-tx","Austin","TX",30.2672,-97.7431,"America/Chicago","KAUS","Austin",[30.2672,-97.7431]],
  ["charlotte-nc","Charlotte","NC",35.2271,-80.8431,"America/New_York","KCLT","Charlotte",[35.2271,-80.8431]],
  ["columbus-oh","Columbus","OH",39.9612,-82.9988,"America/New_York","KCMH","Columbus",[39.9612,-82.9988]],
  ["indianapolis-in","Indianapolis","IN",39.7684,-86.1581,"America/Indiana/Indianapolis","KIND","Indianapolis",[39.7684,-86.1581]],
  ["san-francisco-ca","San Francisco","CA",37.7749,-122.4194,"America/Los_Angeles","KSFO","San Francisco",[37.7749,-122.4194]],
  ["seattle-wa","Seattle","WA",47.6062,-122.3321,"America/Los_Angeles","KSEA","Seattle",[47.6062,-122.3321]],
  ["denver-co","Denver","CO",39.7392,-104.9903,"America/Denver","KDEN","Denver",[39.7392,-104.9903]],
  ["washington-dc","Washington","DC",38.9072,-77.0369,"America/New_York","KDCA","Washington",[38.9072,-77.0369]],
  ["nashville-tn","Nashville","TN",36.1627,-86.7816,"America/Chicago","KBNA","Nashville",[36.1627,-86.7816]],
  ["oklahoma-city-ok","Oklahoma City","OK",35.4676,-97.5164,"America/Chicago","KOKC","Oklahoma City",[35.4676,-97.5164]],
  ["el-paso-tx","El Paso","TX",31.7619,-106.485,"America/Denver","KELP","El Paso",[31.7619,-106.485]],
  ["boston-ma","Boston","MA",42.3601,-71.0589,"America/New_York","KBOS","Boston",[42.3601,-71.0589]],
  ["portland-or","Portland","OR",45.5152,-122.6784,"America/Los_Angeles","KPDX","Portland",[45.5152,-122.6784]],
  ["las-vegas-nv","Las Vegas","NV",36.1699,-115.1398,"America/Los_Angeles","KLAS","Las Vegas",[36.1699,-115.1398]],
  ["detroit-mi","Detroit","MI",42.3314,-83.0458,"America/Detroit","KDTW","Detroit",[42.3314,-83.0458]],
  ["memphis-tn","Memphis","TN",35.1495,-90.049,"America/Chicago","KMEM","Memphis",[35.1495,-90.049]],
  ["louisville-ky","Louisville","KY",38.2527,-85.7585,"America/Kentucky/Louisville","KSDF","Louisville",[38.2527,-85.7585]],
  ["baltimore-md","Baltimore","MD",39.2904,-76.6122,"America/New_York","KBWI","Baltimore",[39.2904,-76.6122]],
  ["milwaukee-wi","Milwaukee","WI",43.0389,-87.9065,"America/Chicago","KMKE","Milwaukee",[43.0389,-87.9065]],
  ["albuquerque-nm","Albuquerque","NM",35.0844,-106.6504,"America/Denver","KABQ","Albuquerque",[35.0844,-106.6504]],
  ["tucson-az","Tucson","AZ",32.2226,-110.9747,"America/Phoenix","KTUS","Tucson",[32.2226,-110.9747]],
  ["fresno-ca","Fresno","CA",36.7378,-119.7871,"America/Los_Angeles","KFAT","Fresno",[36.7378,-119.7871]],
  ["sacramento-ca","Sacramento","CA",38.5816,-121.4944,"America/Los_Angeles","KSMF","Sacramento",[38.5816,-121.4944]],
  ["mesa-az","Mesa","AZ",33.4152,-111.8315,"America/Phoenix","KFFZ","Phoenix",[33.4152,-111.8315]],
  ["atlanta-ga","Atlanta","GA",33.749,-84.388,"America/New_York","KATL","Atlanta",[33.749,-84.388]],
  ["kansas-city-mo","Kansas City","MO",39.0997,-94.5786,"America/Chicago","KMKC","Kansas City",[39.0997,-94.5786]],
  ["colorado-springs-co","Colorado Springs","CO",38.8339,-104.8214,"America/Denver","KCOS","Colorado Springs",[38.8339,-104.8214]],
  ["omaha-ne","Omaha","NE",41.2565,-95.9345,"America/Chicago","KOMA","Omaha",[41.2565,-95.9345]],
  ["raleigh-nc","Raleigh","NC",35.7796,-78.6382,"America/New_York","KRDU","Raleigh",[35.7796,-78.6382]],
  ["miami-fl","Miami","FL",25.7617,-80.1918,"America/New_York","KMIA","Miami",[25.7617,-80.1918]],
  ["virginia-beach-va","Virginia Beach","VA",36.8529,-75.978,"America/New_York","KORF","Norfolk-Virginia Beach",[36.8529,-75.978]],
  ["long-beach-ca","Long Beach","CA",33.7701,-118.1937,"America/Los_Angeles","KLGB","Los Angeles",[33.7701,-118.1937]],
  ["minneapolis-mn","Minneapolis","MN",44.9778,-93.265,"America/Chicago","KMSP","Minneapolis",[44.9778,-93.265]],
  ["tampa-fl","Tampa","FL",27.9506,-82.4572,"America/New_York","KTPA","Tampa",[27.9506,-82.4572]],
  ["new-orleans-la","New Orleans","LA",29.9511,-90.0715,"America/Chicago","KMSY","New Orleans",[29.9511,-90.0715]],
  ["cleveland-oh","Cleveland","OH",41.4993,-81.6944,"America/New_York","KCLE","Cleveland",[41.4993,-81.6944]],
  ["honolulu-hi","Honolulu","HI",21.3099,-157.8581,"Pacific/Honolulu","PHNL","Honolulu",[21.3099,-157.8581]],
  ["anchorage-ak","Anchorage","AK",61.2181,-149.9003,"America/Anchorage","PANC","Anchorage",[61.2181,-149.9003]],
  ["pittsburgh-pa","Pittsburgh","PA",40.4406,-79.9959,"America/New_York","KPIT","Pittsburgh",[40.4406,-79.9959]],
  ["st-louis-mo","St. Louis","MO",38.627,-90.1994,"America/Chicago","KSTL","St. Louis",[38.627,-90.1994]],
  ["cincinnati-oh","Cincinnati","OH",39.1031,-84.512,"America/New_York","KLUK","Cincinnati",[39.1031,-84.512]],
  ["salt-lake-city-ut","Salt Lake City","UT",40.7608,-111.891,"America/Denver","KSLC","Salt Lake City",[40.7608,-111.891]],
  ["boise-id","Boise","ID",43.615,-116.2023,"America/Boise","KBOI","Boise",[43.615,-116.2023]],
  ["birmingham-al","Birmingham","AL",33.5186,-86.8104,"America/Chicago","KBHM","Birmingham",[33.5186,-86.8104]],
  ["charleston-sc","Charleston","SC",32.7765,-79.9311,"America/New_York","KCHS","Charleston",[32.7765,-79.9311]],
] as const;

const category = (aqi: number) => aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy for Sensitive Groups" : aqi <= 200 ? "Unhealthy" : aqi <= 300 ? "Very Unhealthy" : "Hazardous";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const cities = cityRows.map(([slug,name,state,lat,lon,timezone]) => ({
    slug,name,state,lat,lon,timezone,
    // Resolve actual station/monitor IDs at ingest time instead of baking in an unverified guess.
    nws_station_id: null,
    airnow_area: null,
    data_source_note: slug === "lamont-ok" ? "Air and weather observations use the nearest reporting sites with recent data." : null,
  }));
  const { data: insertedCities, error: cityError } = await supabase.from("cities").upsert(cities, { onConflict: "slug" }).select("id,slug");
  if (cityError) throw cityError;
  if (!insertedCities || insertedCities.length !== cityRows.length) throw new Error("City upsert did not return all cities.");
  const idBySlug = new Map(insertedCities.map(city => [city.slug, city.id]));
  const seedGroups = Object.entries(manualSeedValues);
  const entries = seedGroups.flatMap(([slug, values]) => values.map(([pollutant, concentration, aqi], i) => {
    const ppm = pollutant === "PM2.5" ? "pm25" : pollutant === "PM10" ? "pm10" : pollutant === "Ozone" ? "ozone" : pollutant === "NO2" ? "no2" : pollutant === "SO2" ? "so2" : "co";
    return {
      city_id: idBySlug.get(slug),
      recorded_at: fromZonedTime(`${manualEntryTimes[i]}:00`, manualEntryTimezone).toISOString(),
      source: "manual",
      aqi, aqi_category: category(aqi), primary_pollutant: pollutant,
      pm25: ppm === "pm25" ? concentration : null,
      pm10: ppm === "pm10" ? concentration : null,
      ozone: ppm === "ozone" ? concentration : null,
      no2: ppm === "no2" ? concentration : null,
      so2: ppm === "so2" ? concentration : null,
      co: ppm === "co" ? concentration : null,
    };
  }));
  if (entries.length !== 69 || entries.some(row => !row.city_id)) throw new Error(`Expected 69 manual rows, got ${entries.length}.`);
  const { error: readingsError } = await supabase.from("readings").upsert(entries, { onConflict: "city_id,recorded_at" });
  if (readingsError) throw readingsError;
  console.log(`Seeded ${cities.length} cities and ${entries.length} manual readings.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
