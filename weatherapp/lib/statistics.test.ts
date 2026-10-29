import { describe, expect, it } from "vitest";
import { bootstrapDifference, benjaminiHochberg, cityAdjustedCorrelation, correlation, descriptiveSummary, deriveFeatures, dunnPostHoc, kruskalWallis, linearRegression, mannKendall, mannWhitney, multipleWeatherRegression, oneWayAnova, prepareDataset, randomEffectsMetaAnalysis, rankCitiesByAqi, rowsForScope, scopedCorrelation, summarize, timeTrend, welchTTest, wilcoxonSignedRank, wilsonInterval, type AnalysisScope } from "@/lib/statistics";
import { getManualReadings, manualSeedValues } from "@/lib/manual-data";
import reference from "@/lib/statistics-reference.json";

describe("statistics calculations", () => {
  const columbiaScope: AnalysisScope = { kind: "city", cityId: "columbia" };

  it("enforces scoped descriptive spread minimums and carries method metadata", () => {
    const result = descriptiveSummary([1, 2, 3, 4], columbiaScope);
    expect(result).toMatchObject({ n: 4, method: "descriptive summary", status: "ok", mean: 2.5, sd: null, q05: null });
    expect(() => descriptiveSummary([1], undefined as unknown as AnalysisScope)).toThrow(/scope/i);
    expect(descriptiveSummary([], columbiaScope)).toMatchObject({ n: 0, status: "insufficient", mean: null });
  });

  it("requires explicit scope filters and excludes manual rows from weather datasets", () => {
    const automated = { city_id:"columbia", recorded_at:"2026-06-01T12:00:00.000Z", source:"automated" as const } as ReturnType<typeof getManualReadings>[number];
    const manual = { ...automated, source:"manual" as const, recorded_at:"2026-06-01T13:00:00.000Z" };
    expect(rowsForScope([automated,manual],columbiaScope)).toEqual([automated,manual]);
    expect(rowsForScope([automated,{...automated,city_id:"oakland"}],{kind:"global",cityIds:["columbia"]})).toHaveLength(1);
    const result=prepareDataset([automated,manual],columbiaScope,{dataset:"automated",range:"all",includeManualAqi:true,target:"aqi",now:Date.parse("2026-06-02T00:00:00Z")});
    expect(result).toMatchObject({n:1,method:"automated dataset · all range",rows:[automated]});
    expect(prepareDataset([automated,manual],columbiaScope,{dataset:"all",range:"all",includeManualAqi:true,target:"aqi",now:Date.parse("2026-06-02T00:00:00Z")}).n).toBe(2);
    expect(prepareDataset([automated,manual],columbiaScope,{dataset:"all",range:"all",includeManualAqi:true,target:"ozone",now:Date.parse("2026-06-02T00:00:00Z")}).n).toBe(1);
  });

  it("computes robust group and trend tests and a Wilson interval", () => {
    const groupA = [1, 2, 2, 3, 3, 4, 4, 5, 5, 6];
    const groupB = [12, 13, 13, 14, 14, 15, 15, 16, 16, 17];
    expect(mannWhitney(groupA, groupB, columbiaScope)).toMatchObject({ status: "ok", method: "Mann–Whitney U with seeded bootstrap CI", n: 20, value: { pValue: expect.any(Number), effectSize: expect.any(Number) } });
    expect(mannWhitney(groupA.slice(0, 7), groupB, columbiaScope)).toMatchObject({ status: "insufficient", required: 8 });
    expect(mannKendall([1,2,3,4,5,6,7,8,9,10], columbiaScope).value?.pValue).toBeLessThan(.05);
    expect(wilsonInterval(10, 20, columbiaScope).value?.probability).toBe(.5);
    expect(wilsonInterval(2, 19, columbiaScope).status).toBe("insufficient");
  });

  it("matches SciPy and statsmodels reference fixtures", () => {
    const a=[1.2,2,2.5,3.1,4,4.4,5,6,7,8],b=[2,2.6,3.3,4.1,4.9,5.7,6.3,7.1,8,9.4];
    const x=[20,22,25,27,30,33,35,38,40,43],y=[12,11,17,16,20,19,24,25,27,30];
    const paired=[2.1,3.2,4,4.8,6,7.1,8.3,9,10.2,11.4],pairedB=[1.7,3.4,3.1,4.4,5,7.6,7,9.2,9.9,10.1];
    const fit=scopedCorrelation(x,y,columbiaScope);
    expect(fit.value?.r).toBeCloseTo(reference.pearson.r,12);
    expect(fit.value?.pValue).toBeCloseTo(reference.pearson.pValue,8);
    expect(scopedCorrelation(x,y,columbiaScope,"spearman").value?.r).toBeCloseTo(reference.spearman.rho,12);
    const regression=linearRegression(x,y,columbiaScope);
    expect(regression.value?.slope).toBeCloseTo(reference.linearRegression.slope,12);
    expect(regression.value?.intercept).toBeCloseTo(reference.linearRegression.intercept,12);
    expect(regression.value?.rSquared).toBeCloseTo(reference.linearRegression.rSquared,12);
    expect(regression.value?.ci95[0]).toBeCloseTo(reference.linearRegression.slopeCi95[0],9);
    expect(regression.value?.ci95[1]).toBeCloseTo(reference.linearRegression.slopeCi95[1],9);
    const welch=welchTTest(a,b,columbiaScope);
    expect(welch.value?.pValue).toBeCloseTo(reference.welchT.pValue,8);
    expect(mannWhitney(a,b,columbiaScope).value?.u).toBe(reference.mannWhitney.u);
    expect(mannWhitney(a,b,columbiaScope).value?.pValue).toBeCloseTo(reference.mannWhitney.pValue,2);
    const kw=kruskalWallis([a,b,x],columbiaScope);
    expect(kw.value?.h).toBeCloseTo(reference.kruskalWallis.h,8);
    expect(kw.value?.pValue).toBeCloseTo(reference.kruskalWallis.pValue,8);
    expect(dunnPostHoc([{label:"a",values:a},{label:"b",values:b},{label:"x",values:x}],columbiaScope,1).status).toBe("suppressed");
    expect(wilcoxonSignedRank(paired,pairedB,columbiaScope).value?.pValue).toBeCloseTo(reference.wilcoxon.pValue,2);
    expect(bootstrapDifference(a,b,columbiaScope,reference.provenance.seed).value?.ci95[0]).toBeCloseTo(reference.bootstrapDifference.ci95[0],12);
    expect(bootstrapDifference(a,b,columbiaScope,reference.provenance.seed).value?.ci95[1]).toBeCloseTo(reference.bootstrapDifference.ci95[1],12);
    expect(benjaminiHochberg(reference.benjaminiHochberg.pValues,columbiaScope).value?.adjusted).toEqual(reference.benjaminiHochberg.adjusted);
    const wilson=wilsonInterval(reference.wilson.successes,reference.wilson.n,columbiaScope);
    expect(wilson.value?.probability).toBe(reference.wilson.probability);
    expect(wilson.value?.ci95[0]).toBeCloseTo(reference.wilson.ci95[0],12);
    expect(wilson.value?.ci95[1]).toBeCloseTo(reference.wilson.ci95[1],12);
  });

  it("uses city-cluster resampling and random-effects estimates for pooled relationships", () => {
    const readings=Array.from({length:5},(_,city)=>Array.from({length:12},(_,index)=>({city_id:`c${city}`,recorded_at:new Date(Date.UTC(2026,0,1,index)).toISOString(),temperature_c:city*20+index,aqi:city*100-index} as ReturnType<typeof getManualReadings>[number]))).flat();
    const result=cityAdjustedCorrelation(readings,"temperature_c","aqi",{kind:"global"});
    expect(result.status).toBe("ok");
    expect(result.value?.disagrees).toBe(true);
    expect(result.method).toContain("city-cluster bootstrap");
    const pooled=randomEffectsMetaAnalysis([{slope:1,standardError:.2},{slope:1.2,standardError:.3},{slope:.9,standardError:.25}],{kind:"global"});
    expect(pooled.status).toBe("ok");
    expect(pooled.value?.iSquared).toBeGreaterThanOrEqual(0);
    expect(pooled.value?.ci95[0]).toBeLessThan(pooled.value!.slope);
  });

  it("ranks city-level AQI summaries and separates cities below the coverage minimum", () => {
    const readings=Array.from({length:10},(_,index)=>({city_id:"a",aqi:30+index} as ReturnType<typeof getManualReadings>[number]))
      .concat(Array.from({length:9},(_,index)=>({city_id:"b",aqi:10+index} as ReturnType<typeof getManualReadings>[number])));
    const result=rankCitiesByAqi(readings,[{id:"a",slug:"alpha",name:"Alpha",state:"AA"},{id:"b",slug:"beta",name:"Beta",state:"BB"},{id:"c",slug:"gamma",name:"Gamma",state:"CC"}],{kind:"global"});
    expect(result.status).toBe("ok");
    expect(result.value?.map(city=>[city.slug,city.eligible])).toEqual([["alpha",true],["beta",false],["gamma",false]]);
    expect(result.value?.[0]).toMatchObject({n:10,mean:34.5,median:34.5,above100Percent:0});
    expect(rankCitiesByAqi(readings,[{id:"a",name:"Alpha",state:"AA"}],{kind:"global",cityIds:["a"]}).value).toHaveLength(1);
  });

  it("locks multivariable models below 100 complete rows", () => {
    const rows=Array.from({length:120},(_,index)=>{const temperature=15+(index*17%300)/10,humidity=20+(index*37%75),wind=.5+(index*19%120)/10,cloud=(index*53)%101;return{city_id:"columbia",recorded_at:new Date(Date.UTC(2026,0,1,index)).toISOString(),source:"automated" as const,aqi:20+temperature*.5+humidity*.1-wind*.2,temperature_c:temperature,dewpoint_c:null,relative_humidity:humidity,cloud_coverage_pct:cloud,cloud_coverage_label:"Few",precipitation_last_hour_mm:index%7===0?1:0,precipitation_3h_mm:null,precipitation_6h_mm:null,precipitation_type:index%7===0?"rain":"none",text_description:null,wind_speed_ms:wind,wind_direction_deg:180,wind_gust_ms:null,barometric_pressure_pa:99500+(index*71%5000),sea_level_pressure_pa:null,visibility_m:10000,heat_index_c:null,wind_chill_c:null,weather_station_id:null,weather_observed_at:null,aqi_category:"Good",primary_pollutant:"PM2.5",pm25:10+index*.2,pm10:null,ozone:null,no2:null,so2:null,co:null,aqi_source_site:null} as ReturnType<typeof getManualReadings>[number];});
    const features=deriveFeatures(rows,[{id:"columbia",timezone:"America/New_York",lat:34,lon:-81}],columbiaScope);
    expect(multipleWeatherRegression(features.slice(0,99),"aqi",columbiaScope).status).toBe("insufficient");
    const model=multipleWeatherRegression(features,"aqi",columbiaScope);
    expect(model.status).toBe("ok");
    expect(model.value?.n).toBeGreaterThanOrEqual(100);
    expect(Number.isFinite(model.value?.adjustedRSquared)).toBe(true);
  });

  it("derives local weather bins, wind sectors, pressure deltas, and rain context", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      recorded_at: new Date(Date.UTC(2026, 5, 1, index)).toISOString(), source: "automated" as const,
      city_id: "columbia", aqi: 20 + index, aqi_category: "Good", primary_pollutant: "PM2.5",
      pm25: 5 + index, pm10: null, ozone: null, no2: null, so2: null, co: null,
      temperature_c: 30, dewpoint_c: 18, relative_humidity: 55, cloud_coverage_pct: 5, cloud_coverage_label: "Clear",
      precipitation_last_hour_mm: index === 3 ? 2 : 0, precipitation_3h_mm: null, precipitation_6h_mm: null,
      precipitation_type: index === 3 ? "rain" : "none", text_description: null, wind_speed_ms: 0, wind_direction_deg: 90,
      wind_gust_ms: null, barometric_pressure_pa: 101000 + index * 10, sea_level_pressure_pa: null, visibility_m: null,
      heat_index_c: null, wind_chill_c: null, weather_station_id: null, weather_observed_at: null, aqi_source_site: null,
    }));
    const features = deriveFeatures(rows, [{ id:"columbia",timezone:"America/New_York",lat:34.0007,lon:-81.0348 }], columbiaScope);
    const atThree=features[3],atFour=features[4],atTwentyFour=features[24];
    expect(atThree).toMatchObject({ wind_dir_sector:"calm", precip_flag:true, temp_bin:"80–90°F", wind_bin:"calm (<1 m/s)" });
    expect(atFour.hours_since_rain).toBe(1);
    expect(atTwentyFour.rain_last_24h_mm).toBe(2);
    expect(atFour.pressure_change_3h).toBe(30);
  });

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
