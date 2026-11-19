"use client";

import { formatNumber } from "@/lib/format-number";
import Image from "next/image";
import type { ReactNode } from "react";
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

export function CityCard({ city, priority = false, actions, onUnsave }: { city: City; priority?: boolean; actions?: ReactNode; onUnsave?: () => void }) {
  const reading = city.latest;
  const aqi = reading?.aqi ?? null;
  const category = aqiCategory(aqi);
  const image = cityImages[city.slug];
  const primary = reading?.primary_pollutant;
  const field = primary ? concentrationFields[primary] : undefined;
  const concentration = field ? reading?.[field] : null;

  return (
    <article className="city-card city-row" style={{ borderInlineStartColor: category.textOnColorVar }}>
      {image && <div className="city-row-photo"><Image src={image.src} alt="" fill sizes="(max-width: 767px) 55vw, 520px" loading={priority ? "eager" : "lazy"} style={{ objectPosition: image.position }} /></div>}
      <Link href={`/city/${city.slug}`} className="card-link-hit" aria-label={`Open ${city.name}, ${city.state}. AQI ${aqi === null ? "unavailable" : formatNumber(aqi)}`} />
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
        <strong>{primary ? pollutantLabels[primary] ?? primary : "N/A"} · {typeof concentration === "number" ? `${formatNumber(concentration)} ${primary === "CO" ? "mg/m³" : "µg/m³"}` : "N/A"}</strong>
        <span className="city-row-weather"><Cloud size={15} aria-hidden="true" />{reading?.text_description ?? "Weather N/A"} · {reading?.temperature_c == null ? "N/A" : `${formatNumber((reading.temperature_c * 9 + 160) / 5)}°F`}{reading?.wind_speed_ms != null && <><Wind size={15} aria-hidden="true" />{formatNumber(reading.wind_speed_ms * 2.23694)} mph</>}</span>
        {city.data_source_note && <span>{city.data_source_note}</span>}
      </div>
      <div className="city-row-end">
        {reading?.source === "manual" && <span>Manual entry</span>}
        <SaveButton slug={city.slug} cityName={`${city.name}, ${city.state}`} compact onUnsave={onUnsave} />
        <ChevronRight size={16} aria-hidden="true" />
      </div>
      {actions && <div className="city-row-actions">{actions}</div>}
    </article>
  );
}
