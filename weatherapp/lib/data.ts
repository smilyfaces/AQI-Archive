import { createClient } from "@supabase/supabase-js";
import { fromZonedTime } from "date-fns-tz";
import { cityCatalog, manualLatest, type CitySummary } from "@/lib/catalog";
import { getManualReadings } from "@/lib/manual-data";
import { isMissingOptionalCityAnalysisColumn } from "@/lib/schema-compatibility";

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
  dewpoint_c:number|null;
  relative_humidity: number | null;
  cloud_coverage_pct: number | null;
  cloud_coverage_label: string | null;
  precipitation_last_hour_mm: number | null;
  precipitation_3h_mm: number | null;
  precipitation_6h_mm: number | null;
  precipitation_type: string | null;
  text_description: string | null;
  wind_speed_ms: number | null;
  wind_direction_deg:number|null;
  wind_gust_ms:number|null;
  barometric_pressure_pa:number|null;
  sea_level_pressure_pa:number|null;
  visibility_m:number|null;
  heat_index_c:number|null;
  wind_chill_c:number|null;
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
  region?: string | null;
  climate_type?: string | null;
  population?: number | null;
  size_band?: string | null;
  stale?: boolean;
  latest: Reading | null;
};
export type AnalysisCity = { id:string; slug:string; name:string; state:string; timezone:string; lat:number; lon:number; region:string|null; climateType:string|null; sizeBand:string|null; population:number|null };
type CityMetadataRow = { id:string; slug:string; name:string; state:string; timezone:string; lat:number; lon:number; data_source_note?:string|null; region?:string|null; climate_type?:string|null; population?:number|null; size_band?:string|null };

const emptyReading = (recorded_at: string, source: "manual" | "automated"): Reading => ({
  recorded_at, source, aqi: null, aqi_category: null, primary_pollutant: null,
  pm25: null, pm10: null, ozone: null, no2: null, so2: null, co: null,
  temperature_c: null,dewpoint_c:null, relative_humidity: null, cloud_coverage_pct: null,
  cloud_coverage_label:null, precipitation_last_hour_mm: null, precipitation_3h_mm:null, precipitation_6h_mm:null, precipitation_type: null, text_description: null,
  wind_speed_ms: null,wind_direction_deg:null,wind_gust_ms:null,barometric_pressure_pa:null,sea_level_pressure_pa:null,visibility_m:null,heat_index_c:null,wind_chill_c:null, weather_station_id: null, weather_observed_at: null, aqi_source_site: null,
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
function localCity(slug:string) {
  return localCities().find(item=>item.slug===slug)??null;
}

function publicDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? createClient(url, anon, { auth: { persistSession: false } }) : null;
}
const metadataColumnsMissing=isMissingOptionalCityAnalysisColumn;

export async function getCities(): Promise<{ cities: City[]; error: string | null; localFallback: boolean }> {
  const db = publicDb();
  if (!db) return { cities: localCities(), error: null, localFallback: true };
  const [metadataCityResult,readingResult]=await Promise.all([
    db.from("cities").select("id,slug,name,state,lat,lon,timezone,data_source_note,region,climate_type,population,size_band").eq("is_active", true).order("name"),
    db.from("latest_readings").select("*").limit(200),
  ]);
  const cityResult=metadataColumnsMissing(metadataCityResult.error)?await db.from("cities").select("id,slug,name,state,lat,lon,timezone,data_source_note").eq("is_active",true).order("name"):metadataCityResult;
  const {data:cities,error:cityError}=cityResult,{data:readings,error:readingError}=readingResult;
  if (cityError?.code==="PGRST205" || readingError?.code==="PGRST205") return { cities: localCities(), error: null, localFallback: true };
  if (cityError || readingError || !cities) return { cities: [], error: cityError?.message ?? readingError?.message ?? "Could not load city readings.", localFallback: false };
  const latestBySlug = new Map((readings ?? []).map(row => [row.slug as string, row as Reading]));
  return { cities: cities.map(city => {
    const latest = latestBySlug.get(city.slug) ?? null;
    return { ...city, latest, stale: latest ? Date.now() - new Date(latest.recorded_at).getTime() > 3*60*60*1000 : false } as City;
  }), error: null, localFallback: false };
}

export async function getAllReadings(): Promise<{ readings: Reading[]; cities:AnalysisCity[]; error: string | null; localFallback: boolean; asOf:number }> {
  const db = publicDb();
  const manualCityContexts:AnalysisCity[] = [
    {id:"columbia-sc",slug:"columbia-sc",name:"Columbia",state:"SC",timezone:"America/New_York",lat:34.0007,lon:-81.0348,region:"Southeast",climateType:null,sizeBand:null,population:null},
    {id:"oakland-ca",slug:"oakland-ca",name:"Oakland",state:"CA",timezone:"America/Los_Angeles",lat:37.8044,lon:-122.2712,region:"Pacific",climateType:null,sizeBand:null,population:null},
    {id:"lamont-ok",slug:"lamont-ok",name:"Lamont",state:"OK",timezone:"America/Chicago",lat:36.6778,lon:-97.4837,region:"Southwest",climateType:null,sizeBand:null,population:null},
  ];
  const manualReadings=()=>cityCatalog.flatMap(city=>getManualReadings(city.slug).map(row=>({...row,city_id:city.slug})));
  if (!db) return { readings: manualReadings(), cities:manualCityContexts, error: null, localFallback: true, asOf:Date.now() };

  const readings: Reading[] = [];
  const pageSize = 1000;
  const metadataCityResult=await db.from("cities").select("id,slug,name,state,timezone,lat,lon,region,climate_type,population,size_band").eq("is_active",true);
  const cityResult=metadataColumnsMissing(metadataCityResult.error)?await db.from("cities").select("id,slug,name,state,timezone,lat,lon").eq("is_active",true):metadataCityResult;
  const {data:cityRows,error:cityError}=cityResult;
  if(cityError?.code==="PGRST205")return {readings:manualReadings(),cities:manualCityContexts,error:null,localFallback:true,asOf:Date.now()};
  if(cityError)return {readings:[],cities:[],error:cityError.message,localFallback:false,asOf:Date.now()};
  const cities:AnalysisCity[]=((cityRows??[]) as CityMetadataRow[]).map((city)=>({id:city.id,slug:city.slug,name:city.name,state:city.state,timezone:city.timezone,lat:city.lat,lon:city.lon,region:city.region??null,climateType:city.climate_type??null,sizeBand:city.size_band??null,population:city.population??null}));
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("readings").select("*").order("recorded_at", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error?.code === "PGRST205") return { readings: manualReadings(), cities:manualCityContexts, error: null, localFallback: true, asOf:Date.now() };
    if (error) return { readings: [], cities:[], error: error.message, localFallback: false, asOf:Date.now() };
    const batch = (data ?? []) as Reading[];
    readings.push(...batch);
    if (batch.length < pageSize) break;
  }
  return { readings, cities, error: null, localFallback: false, asOf:Date.now() };
}

export async function getCity(slug: string): Promise<{ city: City | null; readings: Reading[]; error: string | null; localFallback: boolean; asOf:number }> {
  const db = publicDb();
  if (!db) {
    const city = localCities().find(item => item.slug === slug) ?? null;
    const readings = city ? getManualReadings(slug) : [];
    const latest = readings.at(-1) ?? null;
    return { city: city ? { ...city, latest, stale: latest ? Date.now() - new Date(latest.recorded_at).getTime() > 3*60*60*1000 : false } : null, readings, error: null, localFallback: true, asOf:Date.now() };
  }
  const metadataCityResult=await db.from("cities").select("id,slug,name,state,lat,lon,timezone,data_source_note,region,climate_type,population,size_band").eq("slug", slug).maybeSingle();
  const cityResult=metadataColumnsMissing(metadataCityResult.error)?await db.from("cities").select("id,slug,name,state,lat,lon,timezone,data_source_note").eq("slug",slug).maybeSingle():metadataCityResult;
  const {data:row,error:cityError}=cityResult;
  if (cityError?.code==="PGRST205") {
    const city=localCity(slug);
    const readings=city?getManualReadings(slug):[];
    const latest=readings.at(-1)??null;
    return {city:city?{...city,latest,stale:true}:null,readings,error:null,localFallback:true,asOf:Date.now()};
  }
  if (cityError) return { city: null, readings: [], error: cityError.message, localFallback: false, asOf:Date.now() };
  if (!row) return { city: null, readings: [], error: null, localFallback: false, asOf:Date.now() };
  const { data: rows, error: readingsError } = await db.from("readings").select("*").eq("city_id", row.id).order("recorded_at", { ascending: false }).limit(5000);
  if(readingsError?.code==="PGRST205") {
    const city=localCity(slug);
    const localReadings=city?getManualReadings(slug):[];
    const latest=localReadings.at(-1)??null;
    return {city:city?{...city,latest,stale:true}:null,readings:localReadings,error:null,localFallback:true,asOf:Date.now()};
  }
  if (readingsError) return { city: null, readings: [], error: readingsError.message, localFallback: false, asOf:Date.now() };
  const readings = (rows ?? []) as Reading[];
  const latest = readings[0] ?? null;
  return { city: { ...row, latest, stale: latest ? Date.now() - new Date(latest.recorded_at).getTime() > 3*60*60*1000 : false } as City, readings, error: null, localFallback: false, asOf:Date.now() };
}

export type ArchiveFilters={from?:string;to?:string;timeFrom?:string;timeTo?:string;pollutant?:string;min?:string;max?:string;page?:number};
export async function getArchive(slug:string,filters:ArchiveFilters={}) {
  const db=publicDb();
  const cityResult=db?await db.from("cities").select("id,slug,name,state,timezone,data_source_note").eq("slug",slug).maybeSingle():null;
  let city:City|null;
  if(cityResult?.error&&cityResult.error.code!=="PGRST205")return {city:null,rows:[],total:0,error:cityResult.error.message,page:1,localFallback:false};
  if(cityResult?.data) city={...cityResult.data,latest:null} as City;
  else city=localCity(slug);
  if(!city)return {city:null,rows:[],total:0,error:null,page:1,localFallback:!db};
  const page=Math.max(1,filters.page??1),size=50;
  if(!db||!city.id){
    const all=getManualReadings(slug);
    const filtered=filterArchive(all,filters,city.timezone??"America/New_York");
    return {city,rows:filtered.slice((page-1)*size,page*size),total:filtered.length,error:null,page,localFallback:true};
  }
  let query=db.from("readings").select("*",{count:"exact"}).eq("city_id",city.id).order("recorded_at",{ascending:false});
  const timezone=city.timezone??"America/New_York";
  if(filters.from)query=query.gte("recorded_at",fromZonedTime(`${filters.from}T00:00:00`,timezone).toISOString());
  if(filters.to)query=query.lte("recorded_at",fromZonedTime(`${filters.to}T23:59:59.999`,timezone).toISOString());
  if(filters.pollutant)query=query.eq("primary_pollutant",filters.pollutant);
  const pollutantField:Record<string,string>={"PM2.5":"pm25",PM10:"pm10",Ozone:"ozone",NO2:"no2",SO2:"so2",CO:"co"};
  const field=pollutantField[filters.pollutant??""];
  if(filters.min){const columns=field?[field]:Object.values(pollutantField);query=query.or(columns.map(column=>`and(primary_pollutant.eq.${Object.keys(pollutantField).find(key=>pollutantField[key]===column)},${column}.gte.${Number(filters.min)})`).join(","));}
  if(filters.max){const columns=field?[field]:Object.values(pollutantField);query=query.or(columns.map(column=>`and(primary_pollutant.eq.${Object.keys(pollutantField).find(key=>pollutantField[key]===column)},${column}.lte.${Number(filters.max)})`).join(","));}
  if(filters.timeFrom||filters.timeTo){
    const firstBatch=await query.range(0,499);
    if(firstBatch.error)return {city,rows:[],total:0,error:firstBatch.error.message,page,localFallback:false};
    const totalRows=firstBatch.count??0,matches:Reading[]=filterTime((firstBatch.data??[]) as Reading[],filters,timezone);
    for(let offset=500;offset<totalRows;offset+=500){
      const {data,error}=await query.range(offset,Math.min(offset+499,totalRows-1));
      if(error)return {city,rows:[],total:0,error:error.message,page,localFallback:false};
      matches.push(...filterTime((data??[]) as Reading[],filters,timezone));
    }
    return {city,rows:matches.slice((page-1)*size,page*size),total:matches.length,error:null,page,localFallback:false};
  }
  const {data,error,count}=await query.range((page-1)*size,page*size-1);
  if(error)return {city,rows:[],total:0,error:error.message,page,localFallback:false};
  return {city,rows:(data??[]) as Reading[],total:count??0,error:null,page,localFallback:false};
}

function filterArchive(rows:Reading[],filters:ArchiveFilters,timezone:string){
  return rows.filter(row=>{
    const date=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(row.recorded_at));
    const time=new Intl.DateTimeFormat("en-US",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(row.recorded_at));
    const concentration=row.primary_pollutant==="PM2.5"?row.pm25:row.primary_pollutant==="PM10"?row.pm10:row.primary_pollutant==="Ozone"?row.ozone:row.primary_pollutant==="NO2"?row.no2:row.primary_pollutant==="SO2"?row.so2:row.primary_pollutant==="CO"?row.co:null;
    const hm=Number(time.slice(0,2))*60+Number(time.slice(3,5)),lower=filters.timeFrom?Number(filters.timeFrom.slice(0,2))*60+Number(filters.timeFrom.slice(3,5)):0,upper=filters.timeTo?Number(filters.timeTo.slice(0,2))*60+Number(filters.timeTo.slice(3,5)):1439;
    return (!filters.from||date>=filters.from)&&(!filters.to||date<=filters.to)&&hm>=lower&&hm<=upper&&(!filters.pollutant||row.primary_pollutant===filters.pollutant)&&(filters.min===undefined||((concentration??-Infinity)>=Number(filters.min)))&&(filters.max===undefined||((concentration??Infinity)<=Number(filters.max)));
  }).sort((a,b)=>Date.parse(b.recorded_at)-Date.parse(a.recorded_at));
}
function filterTime(rows:Reading[],filters:ArchiveFilters,timezone:string){if(!filters.timeFrom&&!filters.timeTo)return rows;const lower=filters.timeFrom?Number(filters.timeFrom.slice(0,2))*60+Number(filters.timeFrom.slice(3,5)):0,upper=filters.timeTo?Number(filters.timeTo.slice(0,2))*60+Number(filters.timeTo.slice(3,5)):1439;return rows.filter(row=>{const time=new Intl.DateTimeFormat("en-US",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(row.recorded_at));const value=Number(time.slice(0,2))*60+Number(time.slice(3,5));return value>=lower&&value<=upper;});}
