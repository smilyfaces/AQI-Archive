import { describe, expect, it } from "vitest";
import { averageAtNearestRadius, type NearbyValue } from "./airnow-aggregation";

describe("averageAtNearestRadius", () => {
  it("averages all readings inside the first radius that has data", () => {
    const readings: NearbyValue[] = [
      { parameter: "pm25", value: 10, distanceKm: 8, siteName: "North" },
      { parameter: "pm25", value: 20, distanceKm: 21, siteName: "South" },
      { parameter: "pm25", value: 80, distanceKm: 34, siteName: "Farther" },
    ];

    expect(averageAtNearestRadius(readings).pm25).toEqual({
      value: 15,
      count: 2,
      radiusKm: 25,
      sites: ["North", "South"],
    });
  });

  it("widens the search when a pollutant has no reading in the nearer radius", () => {
    const readings: NearbyValue[] = [
      { parameter: "ozone", value: 30, distanceKm: 38 },
      { parameter: "ozone", value: 50, distanceKm: 45 },
    ];

    expect(averageAtNearestRadius(readings).ozone).toEqual({
      value: 40,
      count: 2,
      radiusKm: 50,
      sites: [],
    });
  });

  it("selects the nearest available radius independently for each pollutant", () => {
    const readings: NearbyValue[] = [
      { parameter: "pm25", value: 12, distanceKm: 15 },
      { parameter: "ozone", value: 40, distanceKm: 33 },
    ];

    expect(averageAtNearestRadius(readings)).toMatchObject({
      pm25: { value: 12, radiusKm: 25 },
      ozone: { value: 40, radiusKm: 50 },
    });
  });
});
