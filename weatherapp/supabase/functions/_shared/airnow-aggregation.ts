export const AIR_QUALITY_SEARCH_RADII_KM = [25, 50, 100] as const;

export type NearbyValue = {
  parameter: string;
  value: number;
  distanceKm: number;
  siteName?: string | null;
};

export type NearbyAverage = {
  value: number;
  count: number;
  radiusKm: number;
  sites: string[];
};

/** Use the smallest search radius containing data for each pollutant, averaging all readings in that radius. */
export function averageAtNearestRadius(
  measurements: NearbyValue[],
  radii: readonly number[] = AIR_QUALITY_SEARCH_RADII_KM,
): Record<string, NearbyAverage> {
  const parameters = [...new Set(measurements.map(item => item.parameter))];
  const result: Record<string, NearbyAverage> = {};
  for (const parameter of parameters) {
    for (const radiusKm of radii) {
      const selected = measurements.filter(item => item.parameter === parameter && item.distanceKm <= radiusKm);
      if (!selected.length) continue;
      const sites = [...new Set(selected.map(item => item.siteName?.trim()).filter((site): site is string => Boolean(site)))];
      result[parameter] = {
        value: selected.reduce((sum, item) => sum + item.value, 0) / selected.length,
        count: selected.length,
        radiusKm,
        sites,
      };
      break;
    }
  }
  return result;
}
