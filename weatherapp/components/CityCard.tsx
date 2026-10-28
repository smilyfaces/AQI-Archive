"use client";

import Link from "next/link";
import { Cloud, CloudRain, CloudSun, MapPin, Wind } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { City } from "@/lib/data";
import { SaveButton } from "@/components/SaveButton";

export function aqiTone(aqi: number | null) {
  if (aqi === null) return "unknown";
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "sensitive";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "very-unhealthy";
  return "hazardous";
}
const valueOrNa = (value: string | number | null | undefined) => value === null || value === undefined ? "N/A" : value;
function temperature(c: number | null) { return c === null ? "N/A" : `${Math.round(c * 9 / 5 + 32)}°F`; }

export function CityCard({ city }: { city: City }) {
  const reading = city.latest;
  const aqi = reading?.aqi ?? null;
  const stale = city.stale ?? false;
  const weatherIcon = reading?.text_description?.toLowerCase().includes("rain") ? <CloudRain size={16} /> : reading?.text_description?.toLowerCase().includes("cloud") ? <CloudSun size={16} /> : <Cloud size={16} />;
  const last = reading?.recorded_at ? new Date(reading.recorded_at) : null;
  const concentration = reading?.primary_pollutant === "PM2.5" ? reading.pm25 : reading?.primary_pollutant === "PM10" ? reading.pm10 : reading?.primary_pollutant === "Ozone" ? reading.ozone : reading?.primary_pollutant === "NO2" ? reading.no2 : reading?.primary_pollutant === "SO2" ? reading.so2 : reading?.primary_pollutant === "CO" ? reading.co : null;
  return <article className={`city-card tone-${aqiTone(aqi)}`}>
    <Link href={`/city/${city.slug}`} className="card-link-hit" aria-label={`${city.name}, ${city.state}. Air quality ${valueOrNa(aqi)}${reading?.aqi_category ? `, ${reading.aqi_category}` : ""}. Open city details.`}><span className="sr-only">Open {city.name}, {city.state}</span></Link>
    <div className="card-content">
      <div className="card-heading"><div className="city-title"><MapPin size={15} aria-hidden="true" /><h3>{city.name}<span>, {city.state}</span></h3></div><SaveButton slug={city.slug} cityName={`${city.name}, ${city.state}`} compact /></div>
      <div className="card-reading"><div className={`aqi-value-chip tone-${aqiTone(aqi)}`}><span>{valueOrNa(aqi)}</span></div><div className="aqi-summary"><span className={`aqi-label tone-text-${aqiTone(aqi)}`}>{reading?.aqi_category ?? "Not available"}</span><span className="metric-line">{valueOrNa(reading?.primary_pollutant)} <span aria-hidden="true">·</span> {concentration === null ? "N/A" : `${concentration} ${reading?.primary_pollutant === "CO" ? "mg/m³" : "µg/m³"}`}</span></div></div>
      <div className="aqi-scale" aria-label={aqi === null ? "AQI unavailable" : `AQI scale, current value ${aqi} of 500`}><span className="aqi-scale-marker" style={{ left: `${Math.min(100,Math.max(0,(aqi ?? 0)/500*100))}%` }} /></div>
      <div className="card-weather"><div className="weather-value">{weatherIcon}<span>{reading?.text_description ?? "Weather N/A"}</span><span className="weather-divider" aria-hidden="true">·</span><span>{temperature(reading?.temperature_c ?? null)}</span></div>{reading?.wind_speed_ms !== null && reading?.wind_speed_ms !== undefined ? <span className="wind-hint"><Wind size={14} /> {Math.round(reading.wind_speed_ms * 2.23694)} mph</span> : null}</div>
      <div className="card-meta">{stale && last ? <span className="stale-tag" title={last.toLocaleString()}>Last updated {formatDistanceToNow(last,{addSuffix:true})}</span> : last ? <span>Updated {formatDistanceToNow(last,{addSuffix:true})}</span> : <span>No readings yet</span>}{reading?.source === "manual" && <span className="manual-tag">Manual entry</span>}{city.slug === "lamont-ok" && city.data_source_note && <span className="source-note">Nearby stations</span>}</div>
    </div>
  </article>;
}
