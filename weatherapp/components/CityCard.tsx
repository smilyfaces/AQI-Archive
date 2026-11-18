"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Cloud, Wind } from "lucide-react";
import { AqiRing } from "@/components/AqiRing";
import { SaveButton } from "@/components/SaveButton";
import { cityImages } from "@/lib/city-images";
import type { City, Reading } from "@/lib/data";
import { aqiCategory } from "@/lib/theme";

const concentrationFields: Partial<Record<string, keyof Reading>> = {
  "PM2.5": "pm25", PM10: "pm10", Ozone: "ozone", NO2: "no2", SO2: "so2", CO: "co",
};
const pollutantLabels: Record<string, string> = {
  "PM2.5": "PM₂.₅", PM10: "PM₁₀", Ozone: "O₃", NO2: "NO₂", SO2: "SO₂",
};

export function CityCard({ city, priority = false }: { city: City; priority?: boolean }) {
  const reading = city.latest;
  const aqi = reading?.aqi ?? null;
  const category = aqiCategory(aqi);
  const image = cityImages[city.slug];
  const primary = reading?.primary_pollutant;
  const field = primary ? concentrationFields[primary] : undefined;
  const concentration = field ? reading?.[field] : null;
  const timezone = city.timezone ?? ({ "oakland-ca": "America/Los_Angeles", "lamont-ok": "America/Chicago" }[city.slug] ?? "America/New_York");
  const updated = reading?.recorded_at
    ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(reading.recorded_at))
    : null;

  return (
    <article className="city-card city-row" style={{ borderInlineStartColor: category.textOnColorVar }}>
      {image && <div className="city-row-photo"><Image src={image.src} alt="" fill sizes="(max-width: 767px) 55vw, 520px" loading={priority ? "eager" : "lazy"} /></div>}
      <Link href={`/city/${city.slug}`} className="card-link-hit" aria-label={`Open ${city.name}, ${city.state}. AQI ${aqi ?? "unavailable"}`} />
      <div className="city-row-main">
        <AqiRing aqi={aqi} />
        <div>
          <span className="city-row-location">{city.state}{city.region && ` · ${city.region}`}</span>
          <h3>{city.name}</h3>
          <span style={{ color: category.textOnColorVar }}>{reading?.aqi_category ?? category.label}</span>
        </div>
      </div>
      <div className="city-row-measurements">
        <span>Primary pollutant</span>
        <strong>{primary ? pollutantLabels[primary] ?? primary : "N/A"} · {typeof concentration === "number" ? `${concentration} ${primary === "CO" ? "mg/m³" : "µg/m³"}` : "N/A"}</strong>
        <span className="city-row-weather"><Cloud size={15} aria-hidden="true" />{reading?.text_description ?? "Weather N/A"} · {reading?.temperature_c == null ? "N/A" : `${Math.round(reading.temperature_c * 9 / 5 + 32)}°F`}{reading?.wind_speed_ms != null && <><Wind size={15} aria-hidden="true" />{Math.round(reading.wind_speed_ms * 2.23694)} mph</>}</span>
        {city.data_source_note && <span>{city.data_source_note}</span>}
      </div>
      <div className="city-row-end">
        <div>{updated ? <time dateTime={reading?.recorded_at}>{city.stale ? "Last reading" : "Updated"} {updated}</time> : "No readings yet"}{reading?.source === "manual" && <span>Manual entry</span>}</div>
        <SaveButton slug={city.slug} cityName={`${city.name}, ${city.state}`} compact />
        <ChevronRight size={16} aria-hidden="true" />
      </div>
    </article>
  );
}
