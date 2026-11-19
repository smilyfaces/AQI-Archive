import { formatNumber } from "@/lib/format-number";
import { aqiCategory, AQI_RING_MAX } from "@/lib/theme";

export function AqiRing({ aqi, size = 96, strokeWidth = 8, showLabel = true }: {
  aqi: number | null;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}) {
  const category = aqiCategory(aqi);
  const progress = Math.max(0, Math.min(aqi ?? 0, AQI_RING_MAX)) / AQI_RING_MAX;
  return (
    <div className="aqi-gauge" style={{ width: size }} role="img" aria-label={aqi === null ? "AQI unavailable" : `AQI ${formatNumber(aqi)}, ${category.label}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="43" fill="none" stroke="var(--accent-soft)" strokeWidth={strokeWidth} />
        {progress > 0 && <circle className="aqi-arc" cx="50" cy="50" r="43" fill="none"
          stroke={category.textOnColorVar} strokeWidth={strokeWidth} strokeLinecap="round"
          pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} transform="rotate(-90 50 50)" />}
      </svg>
      <div className={aqi === null ? "aqi-gauge-copy muted" : "aqi-gauge-copy"} aria-hidden="true">
        <strong>{formatNumber(aqi)}</strong>
        {showLabel && <span>AQI</span>}
      </div>
    </div>
  );
}
