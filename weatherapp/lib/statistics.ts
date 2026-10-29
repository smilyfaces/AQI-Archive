import { max, mean, median, min, quantile, sampleStandardDeviation, sampleVariance } from "simple-statistics";
import jStat from "jstat";
import type { Reading } from "@/lib/data";

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
export type MetricSummary = { n: number; mean: number | null; median: number | null; min: number | null; max: number | null; sd: number | null; variance: number | null; q1:number|null; q3:number|null; iqr: number | null; p05: number | null; p95: number | null; mode: number | null };
export const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const cleanValues = (values: Array<number | null | undefined>) => values.filter(numeric);

export function summarize(values: Array<number | null | undefined>): MetricSummary {
  const clean = cleanValues(values);
  if (!clean.length) return { n: 0, mean: null, median: null, min: null, max: null, sd: null, variance: null, q1:null, q3:null, iqr: null, p05: null, p95: null, mode: null };
  const sorted = [...clean].sort((a,b)=>a-b);
  const distinctCounts = new Map<number,number>();
  for (const value of sorted) distinctCounts.set(value, (distinctCounts.get(value) ?? 0) + 1);
  const greatestFrequency = Math.max(...distinctCounts.values());
  const modes = [...distinctCounts].filter(([,count])=>count===greatestFrequency).map(([value])=>value);
  return {
    n: clean.length, mean: mean(clean), median: median(sorted), min: min(clean), max: max(clean),
    sd: clean.length > 1 ? sampleStandardDeviation(clean) : null,
    variance: clean.length > 1 ? sampleVariance(clean) : null,
    q1:quantile(sorted,.25),q3:quantile(sorted,.75),iqr: quantile(sorted,.75)-quantile(sorted,.25), p05: quantile(sorted,.05), p95: quantile(sorted,.95), mode: Math.min(...modes),
  };
}

export type CorrelationResult = { n: number; r: number | null; rSquared: number | null; slope: number | null; intercept: number | null; pValue: number | null; suppressed: boolean };
function pearsonRaw(pairs: Array<[number,number]>) {
  const mx = mean(pairs.map(([x])=>x)); const my = mean(pairs.map(([,y])=>y));
  const dx = pairs.map(([x])=>x-mx); const dy = pairs.map(([,y])=>y-my);
  const xx = dx.reduce((sum,value)=>sum+value*value,0); const yy=dy.reduce((sum,value)=>sum+value*value,0);
  if (xx === 0 || yy === 0) return { r: null, slope: null, intercept: null };
  const xy = pairs.reduce((sum,[x,y])=>sum+(x-mx)*(y-my),0);
  const r = Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy)));
  return { r, slope: xy/xx, intercept: my-(xy/xx)*mx };
}
function ranks(values: number[]) {
  const order = values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value);
  const out = Array(values.length);
  for (let i=0;i<order.length;) {
    let end=i+1; while(end<order.length && order[end].value===order[i].value) end++;
    const averageRank=(i+1+end)/2;
    for(let j=i;j<end;j++) out[order[j].index]=averageRank;
    i=end;
  }
  return out as number[];
}

export function correlation(xValues: Array<number|null|undefined>, yValues: Array<number|null|undefined>, method: "pearson"|"spearman" = "pearson", minimumN = 10): CorrelationResult {
  const pairs: Array<[number,number]> = [];
  for(let i=0;i<Math.min(xValues.length,yValues.length);i++) { const x=xValues[i],y=yValues[i]; if(numeric(x)&&numeric(y)) pairs.push([x,y]); }
  const n=pairs.length;
  if(n<minimumN) return {n,r:null,rSquared:null,slope:null,intercept:null,pValue:null,suppressed:true};
  let inputPairs=pairs;
  if(method==="spearman") {
    const xRanks=ranks(pairs.map(pair=>pair[0]));
    const yRanks=ranks(pairs.map(pair=>pair[1]));
    inputPairs=xRanks.map((value,index):[number,number]=>[value,yRanks[index]]);
  }
  const calculated=pearsonRaw(inputPairs);
  const {r,slope,intercept}=calculated;
  if(r===null || slope===null || intercept===null) return {n,r:null,rSquared:null,slope:null,intercept:null,pValue:null,suppressed:false};
  const t = Math.abs(r) >= 1 ? Infinity : Math.abs(r)*Math.sqrt((n-2)/(1-r*r));
  const pValue = t===Infinity ? 0 : Math.max(0,Math.min(1,2*(1-jStat.studentt.cdf(t,n-2))));
  return { n, r, rSquared:r*r, slope, intercept, pValue, suppressed:false };
}

export type AnovaResult = { n: number; groups: number; fStatistic: number | null; pValue: number | null; suppressed: boolean };
export function oneWayAnova(valuesByGroup: Array<Array<number|null|undefined>>, minimumN=10): AnovaResult {
  const groups=valuesByGroup.map(cleanValues).filter(group=>group.length>=2);
  const n=groups.reduce((sum,group)=>sum+group.length,0);
  if(n<minimumN || groups.length<2) return {n,groups:groups.length,fStatistic:null,pValue:null,suppressed:true};
  const all=groups.flat(); const grand=mean(all);
  const between=groups.reduce((sum,group)=>sum+group.length*(mean(group)-grand)**2,0);
  const within=groups.reduce((sum,group)=>sum+group.reduce((part,value)=>part+(value-mean(group))**2,0),0);
  const df1=groups.length-1, df2=n-groups.length;
  if(within===0 || df2<=0) return {n,groups:groups.length,fStatistic:within===0&&between>0?Infinity:null,pValue:within===0&&between>0?0:null,suppressed:false};
  const f=(between/df1)/(within/df2);
  return {n,groups:groups.length,fStatistic:f,pValue:Math.max(0,Math.min(1,1-jStat.centralF.cdf(f,df1,df2))),suppressed:false};
}

export function metricValue(reading: Reading, metric: MetricKey): number | null {
  if (metric === "cloud_coverage_eighths") {
    const eighths: Record<string, number> = { Clear: 0, Few: 1, Scattered: 4, Broken: 6, Overcast: 8 };
    if (reading.cloud_coverage_label && reading.cloud_coverage_label in eighths) return eighths[reading.cloud_coverage_label];
    return numeric(reading.cloud_coverage_pct) ? reading.cloud_coverage_pct / 12.5 : null;
  }
  const value=reading[metric];
  return numeric(value) ? value : null;
}

export function groupedAverages(readings: Reading[], timezone: string, groupBy: "hour"|"weekday") {
  const fmt=new Intl.DateTimeFormat("en-US",{timeZone:timezone,hour:"2-digit",hourCycle:"h23",weekday:"long"});
  const groups=new Map<string,number[]>();
  for(const reading of readings) {
    if(!numeric(reading.aqi)) continue;
    const parts=Object.fromEntries(fmt.formatToParts(new Date(reading.recorded_at)).map(part=>[part.type,part.value]));
    const key=groupBy==="hour"?String(parts.hour??""):String(parts.weekday??"");
    const values=groups.get(key)??[]; values.push(reading.aqi); groups.set(key,values);
  }
  return [...groups].map(([label,values])=>({label,...summarize(values)}));
}

export function rollingAverages(readings: Reading[], metric: MetricKey, windowMs: number) {
  const sorted=[...readings].sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at));
  const out:Array<{timestamp:number;recorded_at:string;mean:number;n:number}>=[];
  let left=0,sum=0,count=0;
  for(let right=0;right<sorted.length;right++) {
    const value=metricValue(sorted[right],metric);
    if(value!==null) {sum+=value;count++;}
    const timestamp=Date.parse(sorted[right].recorded_at);
    while(left<=right && timestamp-Date.parse(sorted[left].recorded_at)>windowMs) {
      const removed=metricValue(sorted[left],metric);
      if(removed!==null) {sum-=removed;count--;}
      left++;
    }
    if(count) out.push({timestamp,recorded_at:sorted[right].recorded_at,mean:sum/count,n:count});
  }
  return out;
}

export type TrendResult={n:number;slopePerDay:number|null;lower95:number|null;upper95:number|null;pValue:number|null;suppressed:boolean};
export function timeTrend(readings:Reading[],metric:MetricKey="aqi",minimumN=10):TrendResult {
  const rows=readings.map(row=>({time:Date.parse(row.recorded_at),value:metricValue(row,metric)})).filter((row):row is {time:number;value:number}=>row.value!==null&&Number.isFinite(row.time)).sort((a,b)=>a.time-b.time);
  const n=rows.length;
  if(n<minimumN)return {n,slopePerDay:null,lower95:null,upper95:null,pValue:null,suppressed:true};
  const origin=rows[0].time;
  const x=rows.map(row=>(row.time-origin)/86_400_000),y=rows.map(row=>row.value);
  const fit=correlation(x,y,"pearson",minimumN);
  if(fit.slope===null||fit.intercept===null)return {n,slopePerDay:null,lower95:null,upper95:null,pValue:null,suppressed:false};
  const mx=mean(x);const sxx=x.reduce((sum,value)=>sum+(value-mx)**2,0);
  const residual=x.reduce((sum,value,index)=>sum+(y[index]-(fit.slope!*value+fit.intercept!))**2,0);
  const se=sxx===0||n<=2?null:Math.sqrt((residual/(n-2))/sxx);
  if(se===null)return {n,slopePerDay:fit.slope,lower95:null,upper95:null,pValue:fit.pValue,suppressed:false};
  const critical=jStat.studentt.inv(.975,n-2);
  return {n,slopePerDay:fit.slope,lower95:fit.slope-critical*se,upper95:fit.slope+critical*se,pValue:fit.pValue,suppressed:false};
}
