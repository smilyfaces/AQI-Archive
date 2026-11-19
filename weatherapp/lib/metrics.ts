export const NUMERIC_METRICS = [
  { key: "aqi", label: "AQI", unit: "" },
  { key: "pm25", label: "PM2.5", unit: "µg/m³" }, { key: "pm10", label: "PM10", unit: "µg/m³" },
  { key: "ozone", label: "Ozone", unit: "µg/m³" }, { key: "no2", label: "NO2", unit: "µg/m³" },
  { key: "so2", label: "SO2", unit: "µg/m³" }, { key: "co", label: "CO", unit: "mg/m³" },
  { key: "temperature_c", label: "Temperature", unit: "°C" }, {key:"dewpoint_c",label:"Dewpoint",unit:"°C"}, { key: "relative_humidity", label: "Relative humidity", unit: "%" },
  { key: "cloud_coverage_pct", label: "Cloud coverage", unit: "%" }, { key: "cloud_coverage_eighths", label: "Cloud coverage", unit: "eighths (0–8)" }, { key: "precipitation_last_hour_mm", label: "Precipitation (1 h)", unit: "mm" },
  {key:"precipitation_3h_mm",label:"Precipitation (3 h)",unit:"mm"},{key:"precipitation_6h_mm",label:"Precipitation (6 h)",unit:"mm"},
  {key:"wind_speed_ms",label:"Wind speed",unit:"m/s"},{key:"wind_direction_deg",label:"Wind direction",unit:"°"},{key:"wind_gust_ms",label:"Wind gust",unit:"m/s"},
  {key:"barometric_pressure_pa",label:"Barometric pressure",unit:"Pa"},{key:"sea_level_pressure_pa",label:"Sea-level pressure",unit:"Pa"},{key:"visibility_m",label:"Visibility",unit:"m"},
  {key:"heat_index_c",label:"Heat index",unit:"°C"},{key:"wind_chill_c",label:"Wind chill",unit:"°C"},
] as const;
export type MetricKey = typeof NUMERIC_METRICS[number]["key"];
