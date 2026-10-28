import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Cloud, CloudRain, CloudSun, Droplets, Gauge, Wind } from "lucide-react";
import { CityInsights } from "@/components/CityInsights";
import { SaveButton } from "@/components/SaveButton";
import { getCity } from "@/lib/data";

export async function generateMetadata({ params }: { params: Promise<{slug:string}> }) {
  const {slug}=await params;
  const {city}=await getCity(slug);
  return { title: city ? `${city.name}, ${city.state}` : "City not found" };
}

const na=(value:number|string|null|undefined,unit="")=>value===null||value===undefined?"N/A":`${value}${unit}`;
function tone(aqi:number|null) { return aqi===null?"unknown":aqi<=50?"good":aqi<=100?"moderate":aqi<=150?"sensitive":aqi<=200?"unhealthy":aqi<=300?"very-unhealthy":"hazardous"; }
function temperature(c:number|null) { return c===null?"N/A":`${Math.round(c*9/5+32)}°F`; }

export default async function CityPage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const {city,readings,error,localFallback,asOf}=await getCity(slug);
  if(error) return <main id="main-content" className="page-main"><div className="page-container"><div className="error-panel" role="alert"><div><strong>City data could not load.</strong><span>{error}</span></div><Link className="button secondary" href={`/city/${slug}`}>Try again</Link></div></div></main>;
  if(!city) notFound();
  const latest=city.latest;
  const aqi=latest?.aqi??null;
  const primary=latest?.primary_pollutant??null;
  const concentration=primary==="PM2.5"?latest?.pm25:primary==="PM10"?latest?.pm10:primary==="Ozone"?latest?.ozone:primary==="NO2"?latest?.no2:primary==="SO2"?latest?.so2:primary==="CO"?latest?.co:null;
  const weatherIcon=latest?.text_description?.toLowerCase().includes("rain")?<CloudRain size={18}/>:latest?.text_description?.toLowerCase().includes("cloud")?<CloudSun size={18}/>:<Cloud size={18}/>;
  const timezone=city.timezone??(city.slug==="oakland-ca"?"America/Los_Angeles":city.slug==="lamont-ok"?"America/Chicago":"America/New_York");
  const ringAngle=aqi===null?0:Math.min(360,aqi/500*360);

  return <main id="main-content" className="page-main city-page">
    <div className="page-container">
      <Link className="back-link" href="/">← <span>All cities</span></Link>
      {localFallback&&<div className="notice-panel"><span>Showing the supplied manual readings until the Supabase schema is applied. No weather was backfilled.</span></div>}
      <section className="city-hero" aria-labelledby="city-title">
        <div className="city-hero-main">
          <div className={`aqi-ring tone-${tone(aqi)}`} role="img" aria-label={aqi===null?"Air quality unavailable":"AQI " + aqi + ", " + (latest?.aqi_category??"category unavailable")} style={{background:`conic-gradient(var(--aqi-color) ${ringAngle}deg, var(--surface-2) ${ringAngle}deg)`}}><div className="aqi-ring-inner"><strong>{na(aqi)}</strong><span>AQI</span></div></div>
          <div className="city-hero-copy"><p className="page-kicker">City air quality</p><h1 id="city-title">{city.name}, {city.state}</h1><span className={`category-pill tone-${tone(aqi)}`}>{latest?.aqi_category??"Not available"}</span><div className="hero-actions"><SaveButton slug={city.slug} cityName={`${city.name}, ${city.state}`} /><Link className="button primary" href={`/city/${city.slug}/archive`}><Archive size={17}/>View archive</Link></div></div>
        </div>
        <div className="current-conditions"><h2>Current conditions</h2><div className="current-primary"><span>Primary pollutant</span><strong>{primary??"N/A"}</strong><small>{concentration===null||concentration===undefined?"N/A":`${concentration} ${primary==="CO"?"mg/m³":"µg/m³"}`}</small></div><div className="condition-grid">
          <Condition icon={weatherIcon} label="Weather" value={latest?.text_description??"N/A"}/>
          <Condition icon={<span className="temp-icon">°</span>} label="Temperature" value={temperature(latest?.temperature_c??null)}/>
          <Condition icon={<Droplets size={18}/>} label="Humidity" value={na(latest?.relative_humidity,"%")}/>
          <Condition icon={<CloudSun size={18}/>} label="Cloud cover" value={na(latest?.cloud_coverage_pct,"%")}/>
          <Condition icon={<CloudRain size={18}/>} label="Precipitation" value={latest?.precipitation_last_hour_mm===null||latest?.precipitation_last_hour_mm===undefined?"N/A":`${latest.precipitation_last_hour_mm} mm · ${latest.precipitation_type??"N/A"}`}/>
          <Condition icon={<Wind size={18}/>} label="Wind" value={latest?.wind_speed_ms===null||latest?.wind_speed_ms===undefined?"N/A":`${(latest.wind_speed_ms*2.23694).toFixed(1)} mph`}/>
        </div><div className="city-source-row"><span><Gauge size={15}/> Data source</span><p>{city.data_source_note??(latest?.weather_station_id?`NWS station ${latest.weather_station_id}`:"Nearby reporting and weather stations")}{latest?.aqi_source_site?` · AQI: ${latest.aqi_source_site}`:""}</p></div></div>
        <div className="hero-last-updated">{latest?.recorded_at?<>Last reading <time dateTime={latest.recorded_at}>{new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(latest.recorded_at))}</time>{city.stale&&<span className="stale-tag">Stale</span>}</>:"No readings yet"}</div>
      </section>
      <CityInsights readings={readings} timezone={timezone} now={asOf}/>
    </div>
  </main>;
}

function Condition({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) { return <div className="condition-tile"><span className="condition-icon">{icon}</span><span>{label}</span><strong>{value}</strong></div>; }
