import { describe, expect, it } from "vitest";
import { correlation, oneWayAnova, summarize, timeTrend } from "@/lib/statistics";
import { getManualReadings, manualSeedValues } from "@/lib/manual-data";

describe("statistics calculations", () => {
  it("matches hand-calculated summary values and excludes nulls", () => {
    const result = summarize([1,2,3,4,null,Number.NaN]);
    expect(result).toMatchObject({ n:4, mean:2.5, median:2.5, min:1, max:4, sd:Math.sqrt(5/3), variance:5/3, iqr:1.5, p05:1.15 });
    expect(result.p95).toBeCloseTo(3.85,12);
    expect(summarize([null,undefined])).toMatchObject({n:0,mean:null,sd:null,variance:null});
  });

  it("matches an independent Columbia AQI calculation for all 23 manual rows", () => {
    const rows = getManualReadings("columbia-sc");
    const result = summarize(rows.map(row=>row.aqi));
    expect(rows).toHaveLength(23);
    expect(result.n).toBe(23);
    expect(result.mean).toBeCloseTo(1037/23,12);
    expect(result.median).toBe(46);
    expect(result.sd).toBeCloseTo(16.30368905124978,10);
    expect(result.variance).toBeCloseTo(265.8102766798419,9);
  });

  it("seeds exactly 69 manual observations with unmeasured fields left null", () => {
    expect(Object.values(manualSeedValues).reduce((count,rows)=>count+rows.length,0)).toBe(69);
    for (const slug of ["columbia-sc","oakland-ca","lamont-ok"]) {
      const rows=getManualReadings(slug);
      expect(rows).toHaveLength(23);
      for (const row of rows) {
        expect(row.source).toBe("manual");
        expect(row.temperature_c).toBeNull();
        expect(row.relative_humidity).toBeNull();
        expect(row.cloud_coverage_pct).toBeNull();
        expect(row.text_description).toBeNull();
        for (const field of ["pm25","pm10","ozone","no2","so2","co"] as const) {
          if (field !== ({"PM2.5":"pm25",PM10:"pm10",Ozone:"ozone",NO2:"no2",SO2:"so2",CO:"co"} as Record<string,string>)[row.primary_pollutant ?? ""]) expect(row[field]).toBeNull();
        }
      }
    }
  });

  it("suppresses correlations and tests below n=10", () => {
    expect(correlation([1,2,3],[2,4,6]).suppressed).toBe(true);
    expect(correlation([1,2,3,4],[2,4,6,8]).pValue).toBeNull();
    expect(oneWayAnova([[1,2],[4,5]]).suppressed).toBe(true);
  });

  it("uses pairwise-complete rows and returns a tested regression at n=10", () => {
    const result=correlation([1,2,3,4,5,6,7,8,9,10,null],[3,5,7,9,11,13,15,17,19,21,100]);
    expect(result.n).toBe(10);
    expect(result.suppressed).toBe(false);
    expect(result.r).toBeCloseTo(1,12);
    expect(result.slope).toBeCloseTo(2,12);
    expect(result.pValue).toBe(0);
  });

  it("computes a one-way ANOVA only when group sample sizes are adequate", () => {
    const result=oneWayAnova([[1,2,2,3,2],[8,9,9,10,9]]);
    expect(result.suppressed).toBe(false);
    expect(result.n).toBe(10);
    expect(result.pValue).not.toBeNull();
    expect(result.pValue!).toBeLessThan(0.05);
  });

  it("calculates an AQI trend per real elapsed day and suppresses a short series", () => {
    const readings=Array.from({length:10},(_,day)=>({recorded_at:new Date(Date.UTC(2026,0,1+day)).toISOString(),aqi:3+2*day} as ReturnType<typeof getManualReadings>[number]));
    const result=timeTrend(readings);
    expect(result.n).toBe(10);
    expect(result.suppressed).toBe(false);
    expect(result.slopePerDay).toBeCloseTo(2,12);
    expect(result.lower95).toBeCloseTo(2,10);
    expect(result.upper95).toBeCloseTo(2,10);
    expect(timeTrend(readings.slice(0,9)).suppressed).toBe(true);
  });
});
