// The EPA scale extends to 500. A 300 display maximum makes ordinary readings legible.
export const AQI_RING_MAX = 300;

const categories = [
  { max: 50, key: "good", label: "Good" },
  { max: 100, key: "moderate", label: "Moderate" },
  { max: 150, key: "sensitive", label: "Unhealthy for Sensitive Groups" },
  { max: 200, key: "unhealthy", label: "Unhealthy" },
  { max: 300, key: "very-unhealthy", label: "Very Unhealthy" },
  { max: Infinity, key: "hazardous", label: "Hazardous" },
] as const;

export const aqiCategories = categories.map(({ key, label }) => ({ key, label, colorVar: `var(--aqi-${key})` }));

export function aqiCategory(aqi: number | null) {
  const category = aqi === null ? undefined : categories.find(({ max }) => aqi <= max);
  const key = category?.key ?? "unknown";
  return {
    key,
    label: category?.label ?? "Not available",
    colorVar: category ? `var(--aqi-${key})` : "var(--surface-2)",
    textOnColorVar: `var(--aqi-mark-${key})`,
  };
}

export const chartSeriesColors = Array.from({ length: 10 }, (_, index) => `var(--chart-${index + 1})`);
