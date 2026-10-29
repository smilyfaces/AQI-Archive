import { max, mean, median, min, quantile, sampleStandardDeviation, sampleVariance } from "simple-statistics";
import jStat from "jstat";
import type { Reading } from "@/lib/data";

export type AnalysisScope =
  | { kind: "global"; cityIds?: string[] }
  | { kind: "city"; cityId: string }
  | { kind: "cities"; cityIds: string[] };
export type ResultMeta = { n: number; method: string; warnings: string[]; scope: AnalysisScope; required?: number };
export type InferentialResult<T extends object> = ResultMeta & ({ status: "ok"; value: T } | { status: "insufficient"; required: number; value: null });
export const MINIMUMS = { descriptive: 1, spread: 5, distribution: 8, correlation: 10, group: 8, pooledCities: 5, cityRanking: 10, citySlope: 30, model: 100 } as const;
function checkedScope(scope: AnalysisScope): AnalysisScope {
  if (!scope || !["global", "city", "cities"].includes(scope.kind)) throw new Error("A valid analysis scope is required.");
  if (scope.kind === "city" && !scope.cityId) throw new Error("City scope requires a cityId.");
  if (scope.kind === "cities" && (!scope.cityIds || scope.cityIds.length < 2 || scope.cityIds.length > 10)) throw new Error("Cities scope requires 2–10 city IDs.");
  return scope;
}
function meta(n: number, method: string, scope: AnalysisScope, warnings: string[] = []): ResultMeta {
  return { n, method, warnings, scope: checkedScope(scope) };
}

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

export type ScopedSummary = ResultMeta & {
  status: "ok" | "insufficient"; required: number; missing: number; mean: number | null; median: number | null;
  mode: number | null; min: number | null; max: number | null; range: number | null; sd: number | null;
  variance: number | null; coefficientOfVariation: number | null; q05: number | null; q25: number | null;
  q75: number | null; q95: number | null; iqr: number | null; skewness: number | null;
  meanCi95: [number, number] | null;
};

export function descriptiveSummary(values: Array<number|null|undefined>, scope: AnalysisScope, missing = 0): ScopedSummary {
  const m = meta(cleanValues(values).length, "descriptive summary", scope);
  const clean = cleanValues(values), sorted = [...clean].sort((a,b)=>a-b);
  const enoughSpread = clean.length >= MINIMUMS.spread;
  const avg = clean.length ? mean(clean) : null;
  const sd = clean.length > 1 ? sampleStandardDeviation(clean) : null;
  const q05 = enoughSpread ? quantile(sorted,.05) : null, q25 = enoughSpread ? quantile(sorted,.25) : null;
  const q75 = enoughSpread ? quantile(sorted,.75) : null, q95 = enoughSpread ? quantile(sorted,.95) : null;
  let skewness: number | null = null;
  if (clean.length >= MINIMUMS.spread && sd && sd > 0 && avg !== null) skewness = clean.length / ((clean.length-1)*(clean.length-2)) * clean.reduce((sum,value)=>sum+((value-avg)/sd)**3,0);
  const meanCi95 = clean.length >= MINIMUMS.spread && sd !== null && avg !== null
    ? (() => { const delta=jStat.studentt.inv(.975,clean.length-1)*sd/Math.sqrt(clean.length); return [avg-delta,avg+delta] as [number,number]; })() : null;
  return {
    ...m, status: clean.length >= MINIMUMS.descriptive ? "ok" : "insufficient", required: MINIMUMS.spread, missing,
    mean: avg, median: clean.length ? median(sorted) : null,
    mode: clean.length ? summarize(clean).mode : null, min: clean.length ? min(clean) : null, max: clean.length ? max(clean) : null,
    range: clean.length ? max(clean)-min(clean) : null, sd: enoughSpread ? sd : null,
    variance: enoughSpread && clean.length > 1 ? sampleVariance(clean) : null,
    coefficientOfVariation: enoughSpread && avg !== null && avg !== 0 && sd !== null ? sd/Math.abs(avg) : null,
    q05,q25,q75,q95,iqr:q25===null||q75===null?null:q75-q25,skewness,meanCi95,
  };
}

export type DifferenceResult = { difference: number; ci95: [number,number]; effectSize: number; pValue: number; adjustedPValue?: number; verdict: string };
function seededRandom(seed:number) {
  let state=seed>>>0;
  return () => { state=(state+0x6D2B79F5)|0; let value=state; value=Math.imul(value^value>>>15,value|1); value^=value+Math.imul(value^value>>>7,value|61); return ((value^value>>>14)>>>0)/4294967296; };
}
export function bootstrapMean(values:number[], scope:AnalysisScope, seed=1, repetitions=2000): InferentialResult<{mean:number;ci95:[number,number]}> {
  const clean=cleanValues(values), minimum=MINIMUMS.spread;
  if(clean.length<minimum)return {...meta(clean.length,"seeded percentile bootstrap",scope),status:"insufficient",required:minimum,value:null};
  const rng=seededRandom(seed), means:number[]=[];
  for(let iteration=0;iteration<repetitions;iteration++){let sum=0;for(let i=0;i<clean.length;i++)sum+=clean[Math.floor(rng()*clean.length)];means.push(sum/clean.length);}
  means.sort((a,b)=>a-b);
  return {...meta(clean.length,"seeded percentile bootstrap",scope),status:"ok",required:minimum,value:{mean:mean(clean),ci95:[quantile(means,.025),quantile(means,.975)]}};
}
function averageRanks(values:number[]) { return ranks(values); }
function normalTwoSided(z:number) { return Math.min(1,2*(1-jStat.normal.cdf(Math.abs(z),0,1))); }

export function mannWhitney(aValues:number[],bValues:number[],scope:AnalysisScope):InferentialResult<DifferenceResult & {u:number}> {
  const a=cleanValues(aValues),b=cleanValues(bValues),n1=a.length,n2=b.length,n=n1+n2,required=MINIMUMS.group;
  if(n1<required||n2<required)return {...meta(n,"Mann–Whitney U",scope),status:"insufficient",required,value:null};
  const all=[...a,...b],rs=averageRanks(all),r1=rs.slice(0,n1).reduce((s,x)=>s+x,0),u1=r1-n1*(n1+1)/2,u2=n1*n2-u1,u=Math.min(u1,u2);
  const ties=new Map<number,number>();for(const value of all)ties.set(value,(ties.get(value)??0)+1);
  const tieTerm=[...ties.values()].reduce((sum,t)=>sum+t**3-t,0),variance=n1*n2/12*((n+1)-tieTerm/(n*(n-1)));
  const z=variance>0?(u1-n1*n2/2+(u1>n1*n2/2?-.5:.5))/Math.sqrt(variance):0,pValue=normalTwoSided(z);
  const d=mean(a)-mean(b),pooled=Math.sqrt(((n1-1)*sampleVariance(a)+(n2-1)*sampleVariance(b))/(n-2));
  const boot=bootstrapDifference(a,b,scope,1,2000);
  if(boot.status!=="ok")return {...meta(n,"Mann–Whitney U with bootstrap CI",scope),status:"insufficient",required,value:null};
  return {...meta(n,"Mann–Whitney U with seeded bootstrap CI",scope,["Exploratory comparison; observations may be temporally dependent."]),status:"ok",required,value:{u,difference:d,ci95:boot.value.ci95,effectSize:pooled?d/pooled:0,pValue,verdict:pValue<.05?"Likely a difference; exploratory.":"No clear difference detected."}};
}
export function bootstrapDifference(a:number[],b:number[],scope:AnalysisScope,seed=1,repetitions=2000):InferentialResult<{ci95:[number,number]}> {
  const rng=seededRandom(seed),values:number[]=[];
  for(let iteration=0;iteration<repetitions;iteration++){let x=0,y=0;for(let i=0;i<a.length;i++)x+=a[Math.floor(rng()*a.length)];for(let i=0;i<b.length;i++)y+=b[Math.floor(rng()*b.length)];values.push(x/a.length-y/b.length);}
  values.sort((x,y)=>x-y);
  return {...meta(a.length+b.length,"seeded percentile bootstrap difference",scope),status:"ok",required:MINIMUMS.group,value:{ci95:[quantile(values,.025),quantile(values,.975)]}};
}

export function kruskalWallis(valuesByGroup:number[][],scope:AnalysisScope):InferentialResult<{h:number;pValue:number;groups:number}> {
  const groups=valuesByGroup.map(cleanValues),kept=groups.filter(group=>group.length>=MINIMUMS.group),n=kept.reduce((s,g)=>s+g.length,0),required=MINIMUMS.group;
  if(kept.length<3)return {...meta(n,"Kruskal–Wallis H",scope),status:"insufficient",required,value:null};
  const all=kept.flat(),rs=averageRanks(all);let offset=0;
  const h=kept.reduce((sum,group)=>{const rankSum=rs.slice(offset,offset+group.length).reduce((a,b)=>a+b,0);offset+=group.length;return sum+rankSum**2/group.length;},0)*12/(n*(n+1))-3*(n+1);
  const tieCounts=new Map<number,number>();for(const value of all)tieCounts.set(value,(tieCounts.get(value)??0)+1);
  const correction=1-[...tieCounts.values()].reduce((s,t)=>s+t**3-t,0)/(n**3-n);
  const corrected=correction>0?h/correction:0;
  return {...meta(n,"Kruskal–Wallis H",scope,["Exploratory; follow-up comparisons require a significant omnibus result."]),status:"ok",required,value:{h:corrected,pValue:Math.max(0,Math.min(1,1-jStat.chisquare.cdf(corrected,kept.length-1))),groups:kept.length}};
}

export function benjaminiHochberg(pValues:number[],scope:AnalysisScope):InferentialResult<{adjusted:number[]}> {
  const n=pValues.length;
  if(!n)return {...meta(0,"Benjamini–Hochberg FDR",scope),status:"insufficient",required:1,value:null};
  const ordered=pValues.map((p,index)=>({p:Math.max(0,Math.min(1,p)),index})).sort((a,b)=>a.p-b.p),adjusted=Array(n);let running=1;
  for(let i=n-1;i>=0;i--){running=Math.min(running,ordered[i].p*n/(i+1));adjusted[ordered[i].index]=running;}
  return {...meta(n,"Benjamini–Hochberg false discovery rate",scope),status:"ok",required:1,value:{adjusted}};
}

export function wilsonInterval(successes:number,total:number,scope:AnalysisScope):InferentialResult<{probability:number;ci95:[number,number]}> {
  if(total<20||successes<0||successes>total)return {...meta(total,"Wilson score interval",scope),status:"insufficient",required:20,value:null};
  const z=1.959963984540054,p=successes/total,denom=1+z*z/total,center=(p+z*z/(2*total))/denom,half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total**2))/denom;
  return {...meta(total,"Wilson score interval",scope),status:"ok",required:20,value:{probability:p,ci95:[center-half,center+half]}};
}

export function scopedCorrelation(x:number[],y:number[],scope:AnalysisScope,method:"pearson"|"spearman"="pearson"):InferentialResult<{r:number;rSquared:number;slope:number;intercept:number;pValue:number}> {
  const result=correlation(x,y,method,MINIMUMS.correlation),warnings=["Exploratory association; correlation does not establish cause.","Hourly observations may be autocorrelated."];
  if(result.suppressed||result.r===null||result.slope===null||result.intercept===null||result.pValue===null)
    return {...meta(result.n,`${method} correlation and linear regression`,scope,warnings),status:"insufficient",required:MINIMUMS.correlation,value:null};
  return {...meta(result.n,`${method} correlation and linear regression`,scope,warnings),status:"ok",required:MINIMUMS.correlation,value:{r:result.r,rSquared:result.rSquared!,slope:result.slope,intercept:result.intercept,pValue:result.pValue}};
}

export function welchTTest(aValues:number[],bValues:number[],scope:AnalysisScope):InferentialResult<DifferenceResult & {degreesOfFreedom:number}> {
  const a=cleanValues(aValues),b=cleanValues(bValues),n=a.length+b.length,required=MINIMUMS.group;
  if(a.length<required||b.length<required)return {...meta(n,"Welch two-sample t-test",scope),status:"insufficient",required,value:null};
  const va=sampleVariance(a),vb=sampleVariance(b),sa=va/a.length,sb=vb/b.length,se=Math.sqrt(sa+sb);
  const df=(sa+sb)**2/(sa**2/(a.length-1)+sb**2/(b.length-1)),difference=mean(a)-mean(b),t=se?difference/se:0;
  const pValue=Math.max(0,Math.min(1,2*(1-jStat.studentt.cdf(Math.abs(t),df))));
  const critical=jStat.studentt.inv(.975,df),pooled=Math.sqrt(((a.length-1)*va+(b.length-1)*vb)/(n-2)),ci95:[number,number]=[difference-critical*se,difference+critical*se];
  return {...meta(n,"Welch two-sample t-test",scope,["Exploratory; use daily means for inference when observations are hourly."]),status:"ok",required,value:{difference,ci95,effectSize:pooled?difference/pooled:0,pValue,degreesOfFreedom:df,verdict:pValue<.05?"Likely a difference; exploratory.":"No clear difference detected."}};
}

export function wilcoxonSignedRank(aValues:number[],bValues:number[],scope:AnalysisScope):InferentialResult<{w:number;pValue:number;medianDifference:number}> {
  const pairs=Array.from({length:Math.min(aValues.length,bValues.length)},(_,i)=>[aValues[i],bValues[i]] as const).filter(([a,b])=>numeric(a)&&numeric(b)&&a!==b);
  const n=pairs.length,required=MINIMUMS.correlation;
  if(n<required)return {...meta(n,"Wilcoxon signed-rank test",scope),status:"insufficient",required,value:null};
  const diffs=pairs.map(([a,b])=>a-b),rs=ranks(diffs.map(Math.abs)),positive=rs.reduce((sum,rank,index)=>sum+(diffs[index]>0?rank:0),0),negative=rs.reduce((sum,rank,index)=>sum+(diffs[index]<0?rank:0),0),w=Math.min(positive,negative);
  const ties=new Map<number,number>();for(const value of diffs.map(Math.abs))ties.set(value,(ties.get(value)??0)+1);
  const variance=n*(n+1)*(2*n+1)/24-[...ties.values()].reduce((sum,count)=>sum+(count**3-count)/48,0),z=variance?Math.abs(w-n*(n+1)/4)/Math.sqrt(variance):0;
  return {...meta(n,"Wilcoxon signed-rank test",scope,["Exploratory paired comparison."]),status:"ok",required,value:{w,pValue:normalTwoSided(z),medianDifference:median(diffs)}};
}

export function mannKendall(values:number[],scope:AnalysisScope):InferentialResult<{s:number;z:number;pValue:number}> {
  const clean=cleanValues(values),n=clean.length,required=MINIMUMS.correlation;
  if(n<required)return {...meta(n,"Mann–Kendall trend test",scope),status:"insufficient",required,value:null};
  let s=0;for(let i=0;i<n-1;i++)for(let j=i+1;j<n;j++)s+=Math.sign(clean[j]-clean[i]);
  const ties=new Map<number,number>();for(const value of clean)ties.set(value,(ties.get(value)??0)+1);
  const variance=(n*(n-1)*(2*n+5)-[...ties.values()].reduce((sum,t)=>sum+t*(t-1)*(2*t+5),0))/18,z=variance?Math.sign(s)*Math.max(0,Math.abs(s)-1)/Math.sqrt(variance):0;
  return {...meta(n,"Mann–Kendall trend test",scope,["Exploratory monotonic trend test."]),status:"ok",required,value:{s,z,pValue:normalTwoSided(z)}};
}

export function conditionalProbability(flags:boolean[],outcomes:boolean[],scope:AnalysisScope):InferentialResult<{probability:number;ci95:[number,number];baseline:number;conditionN:number}> {
  const n=Math.min(flags.length,outcomes.length),condition=outcomes.slice(0,n).filter((_,i)=>flags[i]),successes=condition.filter(Boolean).length,baselineN=outcomes.slice(0,n).filter(Boolean).length,required=20;
  if(n<required||condition.length<5)return {...meta(condition.length,"conditional probability with Wilson interval",scope),status:"insufficient",required,value:null};
  const interval=wilsonInterval(successes,condition.length,scope);
  if(interval.status!=="ok")return {...meta(condition.length,"conditional probability with Wilson interval",scope),status:"insufficient",required,value:null};
  return {...meta(condition.length,"conditional probability with Wilson interval",scope),status:"ok",required,value:{probability:interval.value.probability,ci95:interval.value.ci95,baseline:baselineN/n,conditionN:condition.length}};
}

export type CityContext = { id:string; timezone:string; lat:number; lon:number; region?:string|null; climateType?:string|null; sizeBand?:string|null };
export type DerivedReading = Reading & {
  local_hour:number|null; day_of_week:number|null; month:number|null; season:string|null; is_daytime:boolean|null;
  precip_flag:boolean|null; hours_since_rain:number|null; rain_last_24h_mm:number|null; wind_dir_sector:string|null;
  temp_bin:string|null; wind_bin:string|null; rh_bin:string|null; cloud_bin:string|null; pressure_bin:string|null;
  pressure_change_3h:number|null; aqi_delta_vs_hour_mean:number|null; pollutant_delta_vs_hour_mean:Record<string,number|null>;
  city_timezone:string; city_region:string|null; climate_type:string|null; city_size_band:string|null;
};
export function rowsForScope<T extends {city_id?:string}>(rows:T[],scope:AnalysisScope):T[] {
  checkedScope(scope);
  if(scope.kind==="city")return rows.filter(row=>row.city_id===scope.cityId);
  if(scope.kind==="cities")return rows.filter(row=>!!row.city_id&&scope.cityIds.includes(row.city_id));
  if(scope.cityIds)return rows.filter(row=>!!row.city_id&&scope.cityIds!.includes(row.city_id));
  return rows;
}
export type Dataset="all"|"automated";
export type TimeRange="24h"|"7d"|"30d"|"90d"|"all";
export type PreparationControls={dataset:Dataset;range:TimeRange;includeManualAqi:boolean;target:string;now:number};
export function prepareDataset(rows:Reading[],scope:AnalysisScope,controls:PreparationControls):{rows:Reading[];n:number;method:string;warnings:string[]} {
  const scoped=rowsForScope(rows,scope),durations:Record<TimeRange,number>={"24h":86400000,"7d":7*86400000,"30d":30*86400000,"90d":90*86400000,all:Infinity};
  const rangeRows=scoped.filter(row=>{const age=controls.now-Date.parse(row.recorded_at);return Number.isFinite(age)&&age>=0&&age<=durations[controls.range];});
  const aqOnly=controls.target==="aqi"&&controls.includeManualAqi;
  const selected=rangeRows.filter(row=>(controls.dataset==="all"||row.source==="automated")&&(row.source==="automated"||aqOnly));
  return {rows:selected,n:selected.length,method:`${controls.dataset} dataset · ${controls.range} range`,warnings:aqOnly?["Manual entries included for AQI only; their irregular observation times can bias temporal summaries."]:[]};
}
const localParts=(value:string,timezone:string)=>Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"numeric",day:"numeric",hour:"numeric",weekday:"short",hourCycle:"h23"}).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
function sunriseSunsetUtc(date:Date,latitude:number,longitude:number) {
  const day=Math.floor((Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())-Date.UTC(date.getUTCFullYear(),0,0))/86400000);
  const calculate=(rise:boolean) => {
    const lngHour=longitude/15,t=day+((rise?6:18)-lngHour)/24,m=.9856*t;
    let l=m+1.916*Math.sin(m*Math.PI/180)+.020*Math.sin(2*m*Math.PI/180)+282.634;l=(l%360+360)%360;
    let ra=Math.atan(.91764*Math.tan(l*Math.PI/180))*180/Math.PI;ra=(ra%360+360)%360;ra+=(Math.floor(l/90)*90-Math.floor(ra/90)*90);ra/=15;
    const sinDec=.39782*Math.sin(l*Math.PI/180),cosDec=Math.cos(Math.asin(sinDec));
    const cosH=(Math.cos(90.833*Math.PI/180)-sinDec*Math.sin(latitude*Math.PI/180))/(cosDec*Math.cos(latitude*Math.PI/180));
    if(cosH>1)return null;if(cosH< -1)return rise?0:1440;
    const h=(rise?360-Math.acos(cosH)*180/Math.PI:Math.acos(cosH)*180/Math.PI)/15;
    const utc=(h+ra-.06571*t-6.622-lngHour)*60;
    return (utc%1440+1440)%1440;
  };
  return {sunrise:calculate(true),sunset:calculate(false)};
}
function temperatureBin(c:number|null) { if(c===null)return null;const f=c*9/5+32;return f<32?"<32°F":f<50?"32–50°F":f<65?"50–65°F":f<80?"65–80°F":f<90?"80–90°F":">90°F"; }
function windBin(ms:number|null) { if(ms===null)return null;const mph=ms*2.23694;return ms<1?"calm (<1 m/s)":mph<5?"1–5 mph":mph<10?"5–10 mph":mph<15?"10–15 mph":">15 mph"; }
function humidityBin(v:number|null) { if(v===null)return null;return v<30?"<30%":v<50?"30–50%":v<70?"50–70%":v<90?"70–90%":">90%"; }
function cloudBin(v:number|null) { if(v===null)return null;return v<=10?"clear":v<=50?"few/scattered":v<=90?"broken":"overcast"; }
export function deriveFeatures(input:Reading[],cities:CityContext[],scope:AnalysisScope):DerivedReading[] {
  const rows=rowsForScope(input,scope),cityById=new Map(cities.map(city=>[city.id,city]));
  const cityRows=new Map<string,Reading[]>();
  for(const row of rows){const id=row.city_id??(scope.kind==="city"?scope.cityId:"");if(!id)continue;const list=cityRows.get(id)??[];list.push(row);cityRows.set(id,list);}
  const result:DerivedReading[]=[];
  for(const [cityId,unsorted] of cityRows){
    const city=cityById.get(cityId);if(!city)continue;
    const ordered=[...unsorted].sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at));
    const hours=new Map<number,number[]>(),pollutantHours=new Map<string,Map<number,number[]>>();
    for(const row of ordered){const part=localParts(row.recorded_at,city.timezone),hour=Number(part.hour),aqiValues=hours.get(hour)??[];if(numeric(row.aqi))aqiValues.push(row.aqi);hours.set(hour,aqiValues);
      for(const field of ["pm25","pm10","ozone","no2","so2","co"] as const){const byHour=pollutantHours.get(field)??new Map<number,number[]>(),values=byHour.get(hour)??[];if(numeric(row[field]))values.push(row[field]!);byHour.set(hour,values);pollutantHours.set(field,byHour);}}
    const pressure=ordered.map(row=>row.barometric_pressure_pa).filter(numeric).sort((a,b)=>a-b),pLow=pressure.length?quantile(pressure,1/3):null,pHigh=pressure.length?quantile(pressure,2/3):null;
    const timestamps=ordered.map(row=>Date.parse(row.recorded_at));
    let lastRain:number|null=null,left24=0,rainSum=0,rainHours=0;
    for(let index=0;index<ordered.length;index++){
      const row=ordered[index],timestamp=timestamps[index],part=localParts(row.recorded_at,city.timezone),hour=Number(part.hour),month=Number(part.month),dayOfYear=Number(part.day),localDate=new Date(`${part.year}-${String(month).padStart(2,"0")}-${String(dayOfYear).padStart(2,"0")}T12:00:00Z`);
      const season=month<=2||month===12?"Winter":month<=5?"Spring":month<=8?"Summer":"Autumn";
      const precipFlag=row.precipitation_type!==null?row.precipitation_type.toLowerCase()!=="none":numeric(row.precipitation_last_hour_mm)?row.precipitation_last_hour_mm>0:null;
      if(precipFlag)lastRain=timestamp;
      if(numeric(row.precipitation_last_hour_mm)){rainSum+=row.precipitation_last_hour_mm;rainHours++;}
      while(left24<=index&&timestamp-timestamps[left24]>=24*3600000){const expired=ordered[left24].precipitation_last_hour_mm;if(numeric(expired)){rainSum-=expired;rainHours--;}left24++;}
      let low=0,high=index;const target=timestamp-3*3600000;
      while(low<high){const mid=Math.floor((low+high)/2);if(timestamps[mid]<target)low=mid+1;else high=mid;}
      const priorIndex=[low,low-1].filter(candidate=>candidate>=0&&candidate<index&&Math.abs(timestamps[candidate]-target)<=30*60000&&numeric(ordered[candidate].barometric_pressure_pa)).sort((a,b)=>Math.abs(timestamps[a]-target)-Math.abs(timestamps[b]-target))[0];
      const prior=priorIndex===undefined?null:ordered[priorIndex].barometric_pressure_pa;
      const solar=sunriseSunsetUtc(localDate,city.lat,city.lon),utcNow=new Date(timestamp),utcMinute=utcNow.getUTCHours()*60+utcNow.getUTCMinutes();
      const localHourMean=hours.get(hour)??[],aqiMean=localHourMean.length?mean(localHourMean):null;
      const pollutantDeltaVsHourMean=Object.fromEntries((["pm25","pm10","ozone","no2","so2","co"] as const).map(field=>{const values=pollutantHours.get(field)?.get(hour)??[];return [field,numeric(row[field])&&values.length?row[field]!-mean(values):null];}));
      const sector=row.wind_speed_ms!==null&&row.wind_speed_ms<1?"calm":numeric(row.wind_direction_deg)?(["N","NE","E","SE","S","SW","W","NW"][Math.round(row.wind_direction_deg/45)%8]):null;
      result.push({...row,local_hour:Number.isFinite(hour)?hour:null,day_of_week:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(part.weekday),month,season,
        is_daytime:solar.sunrise===null?false:solar.sunset===null?true:utcMinute>=solar.sunrise&&utcMinute<=solar.sunset,
        precip_flag:precipFlag,hours_since_rain:lastRain===null?null:(timestamp-lastRain)/3600000,rain_last_24h_mm:rainHours>=18?rainSum:null,wind_dir_sector:sector,
        temp_bin:temperatureBin(row.temperature_c),wind_bin:windBin(row.wind_speed_ms),rh_bin:humidityBin(row.relative_humidity),cloud_bin:cloudBin(row.cloud_coverage_pct),
        pressure_bin:!numeric(row.barometric_pressure_pa)||pLow===null||pHigh===null?null:row.barometric_pressure_pa<=pLow?"low":row.barometric_pressure_pa<=pHigh?"medium":"high",
        pressure_change_3h:numeric(prior)&&numeric(row.barometric_pressure_pa)?row.barometric_pressure_pa-prior:null,
        aqi_delta_vs_hour_mean:numeric(row.aqi)&&aqiMean!==null?row.aqi-aqiMean:null,pollutant_delta_vs_hour_mean:pollutantDeltaVsHourMean,
        city_timezone:city.timezone,city_region:city.region??null,climate_type:city.climateType??null,city_size_band:city.sizeBand??null});
    }
  }
  return result;
}
