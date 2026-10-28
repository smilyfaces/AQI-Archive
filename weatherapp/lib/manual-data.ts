import { fromZonedTime } from "date-fns-tz";
import type { Reading } from "@/lib/data";

export const manualEntryTimezone = "America/New_York";
export const manualEntryTimes = ["2026-08-18 22:00","2026-08-27 21:25","2026-08-29 21:52","2026-09-03 10:16","2026-09-04 22:25","2026-09-05 21:15","2026-09-10 23:33","2026-09-11 15:48","2026-09-14 20:17","2026-09-16 14:57","2026-09-19 16:32","2026-09-21 14:39","2026-09-24 13:24","2026-09-27 15:37","2026-09-29 12:10","2026-10-04 15:13","2026-10-06 10:07","2026-10-08 15:35","2026-10-13 10:33","2026-10-14 11:22","2026-10-16 22:21","2026-10-20 10:07","2026-10-22 09:57"] as const;
export type ManualSeedValue = readonly [pollutant: string, concentration: number | null, aqi: number];
export const manualSeedValues: Record<string, readonly ManualSeedValue[]> = {
  "columbia-sc": [["PM2.5",null,53],["PM2.5",null,54],["PM2.5",null,55],["PM2.5",null,56],["PM2.5",null,32],["PM2.5",null,42],["PM2.5",4.2,23],["PM2.5",3.5,19],["Ozone",122,75],["PM2.5",9.1,52],["PM2.5",11.2,55],["PM2.5",11.2,55],["PM2.5",2.9,16],["Ozone",86,40],["PM2.5",6.6,37],["PM2.5",10.6,54],["PM2.5",6.4,35],["PM2.5",8.3,46],["PM2.5",7.2,39],["PM2.5",17,66],["PM2.5",21.3,74],["PM2.5",4.3,23],["PM2.5",6.6,36]],
  "oakland-ca": [["PM2.5",null,25],["PM2.5",null,20],["PM2.5",null,34],["Ozone",null,21],["Ozone",null,32],["Ozone",null,32],["PM2.5",7.7,42],["PM2.5",6,33],["PM2.5",5.1,28],["Ozone",60,28],["PM2.5",6.3,35],["Ozone",48,35],["PM2.5",8.9,49],["Ozone",56,26],["PM2.5",4.3,24],["PM2.5",8.5,47],["PM2.5",6.3,34],["PM2.5",7.6,42],["NO2",37.8,19],["PM2.5",3.6,20],["Ozone",103,48],["Ozone",32,32],["PM2.5",7.3,41]],
  "lamont-ok": [["PM2.5",null,56],["PM2.5",null,65],["Ozone",null,93],["PM2.5",null,37],["Ozone",null,54],["Ozone",null,54],["Ozone",68.03,42],["PM2.5",9.01,53],["PM2.5",6.6,37],["PM2.5",10.2,52],["PM2.5",9.63,54],["PM2.5",9.63,54],["PM2.5",12.9,58],["PM2.5",18.98,72],["PM2.5",14.67,64],["PM2.5",5.01,37],["PM2.5",5.36,26],["PM2.5",7.49,50],["PM2.5",5.87,29],["PM2.5",2.7,15],["Ozone",56.76,25],["PM2.5",8.7,46],["PM2.5",10.54,56]],
};

const fields: Record<string, keyof Reading> = { "PM2.5":"pm25", PM10:"pm10", Ozone:"ozone", NO2:"no2", SO2:"so2", CO:"co" };
export function getManualReadings(slug: string): Reading[] {
  return (manualSeedValues[slug] ?? []).map(([pollutant, concentration, aqi], index) => {
    const field = fields[pollutant];
    const at = fromZonedTime(`${manualEntryTimes[index]}:00`, manualEntryTimezone).toISOString();
    return {
      recorded_at: at, source: "manual", aqi, aqi_category: aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy for Sensitive Groups" : aqi <= 200 ? "Unhealthy" : aqi <= 300 ? "Very Unhealthy" : "Hazardous",
      primary_pollutant: pollutant, pm25: null, pm10: null, ozone: null, no2: null, so2: null, co: null,
      ...(field ? { [field]: concentration } : {}), temperature_c: null,dewpoint_c:null, relative_humidity: null, cloud_coverage_pct: null,cloud_coverage_label:null,
      precipitation_last_hour_mm: null,precipitation_3h_mm:null,precipitation_6h_mm:null, precipitation_type: null, text_description: null, wind_speed_ms: null,
      wind_direction_deg:null,wind_gust_ms:null,barometric_pressure_pa:null,sea_level_pressure_pa:null,visibility_m:null,heat_index_c:null,wind_chill_c:null,
      weather_station_id: null, weather_observed_at: null, aqi_source_site: null,
    } as Reading;
  });
}
