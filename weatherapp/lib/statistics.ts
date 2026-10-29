import { max, mean, median, min, quantile, sampleStandardDeviation, sampleVariance } from "simple-statistics";
import jStat from "jstat";
import type { Reading } from "@/lib/data";

export type AnalysisScope =
  | { kind: "global"; cityIds?: string[] }
  | { kind: "city"; cityId: string }
  | { kind: "cities"; cityIds: string[] };
export type ResultMeta = { n: number; method: string; warnings: string[]; scope: AnalysisScope; required?: number };
export type InferentialResult<T extends object> = ResultMeta & ({ status: "ok"; value: T } | { status: "insufficient"|"suppressed"; required: number; value: null });
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

export type HistogramResult=ResultMeta & {status:"ok"|"table-only"|"insufficient";bins:Array<{from:number;to:number;count:number}>;required:number;reason:string|null};
export function histogram(values:number[],scope:AnalysisScope):HistogramResult {
  const clean=cleanValues(values),n=clean.length,required=MINIMUMS.distribution;
  if(n<required)return {...meta(n,"Freedman–Diaconis histogram",scope),status:"table-only",bins:[],required,reason:"Histogram suppressed; show the source values as a table."};
  const sorted=[...clean].sort((a,b)=>a-b),iqr=quantile(sorted,.75)-quantile(sorted,.25),fdWidth=iqr>0?2*iqr/Math.cbrt(n):0;
  const rawBins=fdWidth>0?Math.ceil((sorted[n-1]-sorted[0])/fdWidth):1,count=Math.max(1,Math.min(30,rawBins)),width=(sorted[n-1]-sorted[0])/count||1;
  const bins=Array.from({length:count},(_,index)=>({from:sorted[0]+index*width,to:index===count-1?sorted[n-1]:sorted[0]+(index+1)*width,count:0}));
  for(const value of clean){const index=Math.min(count-1,Math.floor((value-sorted[0])/width));bins[index].count++;}
  return {...meta(n,"Freedman–Diaconis histogram",scope),status:"ok",bins,required,reason:null};
}

export function kernelDensity(values:number[],scope:AnalysisScope,points=80):InferentialResult<{x:number;y:number}[]> {
  const clean=cleanValues(values),n=clean.length,required=MINIMUMS.distribution;
  if(n<required)return {...meta(n,"Gaussian kernel density with Silverman bandwidth",scope),status:"insufficient",required,value:null};
  const sd=sampleStandardDeviation(clean),iqr=quantile([...clean].sort((a,b)=>a-b),.75)-quantile([...clean].sort((a,b)=>a-b),.25),scale=Math.min(sd,iqr/1.34)||sd,bandwidth=.9*scale*Math.pow(n,-.2);
  if(!Number.isFinite(bandwidth)||bandwidth<=0)return {...meta(n,"Gaussian kernel density with Silverman bandwidth",scope),status:"insufficient",required,value:null};
  const lo=min(clean)-3*bandwidth,hi=max(clean)+3*bandwidth;
  const density=Array.from({length:points},(_,index)=>{const x=lo+(hi-lo)*index/(points-1),y=clean.reduce((sum,value)=>sum+Math.exp(-.5*((x-value)/bandwidth)**2),0)/(n*bandwidth*Math.sqrt(2*Math.PI));return{x,y};});
  return {...meta(n,"Gaussian kernel density with Silverman bandwidth",scope),status:"ok",required,value:density};
}

export type RegressionResult=InferentialResult<{slope:number;intercept:number;rSquared:number;ci95:[number,number];pValue:number;unitSlope10:number}>;
export function linearRegression(xValues:number[],yValues:number[],scope:AnalysisScope,minimumN:number=MINIMUMS.correlation):RegressionResult {
  const pairs:Array<[number,number]>=[];for(let i=0;i<Math.min(xValues.length,yValues.length);i++)if(numeric(xValues[i])&&numeric(yValues[i]))pairs.push([xValues[i],yValues[i]]);
  const n=pairs.length;
  if(n<minimumN)return {...meta(n,"ordinary least squares regression",scope),status:"insufficient",required:minimumN,value:null};
  const x=pairs.map(([v])=>v),y=pairs.map(([,v])=>v),fit=pearsonRaw(pairs);
  if(fit.slope===null||fit.intercept===null)return {...meta(n,"ordinary least squares regression",scope),status:"insufficient",required:minimumN,value:null};
  const mx=mean(x),sxx=x.reduce((sum,v)=>sum+(v-mx)**2,0),residual=y.reduce((sum,v,i)=>sum+(v-(fit.intercept!+fit.slope!*x[i]))**2,0),se=Math.sqrt((residual/(n-2))/sxx),critical=jStat.studentt.inv(.975,n-2);
  const pValue=correlation(x,y,"pearson",minimumN).pValue??1;
  return {...meta(n,"ordinary least squares regression",scope,["Association is not causation."]),status:"ok",required:minimumN,value:{slope:fit.slope,intercept:fit.intercept,rSquared:correlation(x,y,"pearson",minimumN).rSquared??0,ci95:[fit.slope-critical*se,fit.slope+critical*se],pValue,unitSlope10:fit.slope*10}};
}

export function pairedTTest(aValues:number[],bValues:number[],scope:AnalysisScope):InferentialResult<{difference:number;ci95:[number,number];effectSize:number;pValue:number}> {
  const paired=Array.from({length:Math.min(aValues.length,bValues.length)},(_,index)=>[aValues[index],bValues[index]] as const).filter(([a,b])=>numeric(a)&&numeric(b)),diffs=paired.map(([a,b])=>a-b),n=diffs.length,required=MINIMUMS.correlation;
  if(n<required)return {...meta(n,"paired t-test",scope),status:"insufficient",required,value:null};
  const difference=mean(diffs),sd=sampleStandardDeviation(diffs),se=sd/Math.sqrt(n),t=difference/se,df=n-1,critical=jStat.studentt.inv(.975,df),pValue=2*(1-jStat.studentt.cdf(Math.abs(t),df));
  return {...meta(n,"paired t-test",scope,["Exploratory paired comparison."]),status:"ok",required,value:{difference,ci95:[difference-critical*se,difference+critical*se],effectSize:sd?difference/sd:0,pValue}};
}

export function correlationMatrix(metrics:Array<{key:string;label:string;values:number[]}>,scope:AnalysisScope,method:"pearson"|"spearman"="pearson"):InferentialResult<Array<{x:string;y:string;n:number;r:number|null;pValue:number|null;adjustedPValue:number|null;suppressed:boolean}>> {
  const cells:Array<{x:string;y:string;n:number;r:number|null;pValue:number|null;adjustedPValue:number|null;suppressed:boolean}> = [];
  for(let i=0;i<metrics.length;i++)for(let j=0;j<metrics.length;j++){
    const result=scopedCorrelation(metrics[i].values,metrics[j].values,scope,method),r=result.status==="ok"?result.value.r:null,pValue=result.status==="ok"?result.value.pValue:null;
    cells.push({x:metrics[i].key,y:metrics[j].key,n:result.n,r,pValue,adjustedPValue:null,suppressed:result.status!=="ok"});
  }
  const tested=cells.map((cell,index)=>({cell,index})).filter(({cell})=>cell.pValue!==null&&cell.x!==cell.y),correction=benjaminiHochberg(tested.map(({cell})=>cell.pValue!),scope);
  if(correction.status==="ok")tested.forEach(({cell},index)=>cell.adjustedPValue=correction.value.adjusted[index]);
  return {...meta(cells.reduce((maxN,cell)=>Math.max(maxN,cell.n),0),`${method} correlation matrix with Benjamini–Hochberg FDR`,scope,["Exploratory associations; correlation does not establish cause."]),status:"ok",required:MINIMUMS.correlation,value:cells};
}

export function scopedAnova(valuesByGroup:number[][],scope:AnalysisScope):InferentialResult<{fStatistic:number;pValue:number;groups:number}> {
  const groups=valuesByGroup.map(cleanValues).filter(group=>group.length>=MINIMUMS.group),n=groups.reduce((sum,g)=>sum+g.length,0),required=MINIMUMS.group;
  if(groups.length<3)return {...meta(n,"one-way ANOVA",scope),status:"insufficient",required,value:null};
  const result=oneWayAnova(groups,3*required);
  if(result.fStatistic===null||result.pValue===null)return {...meta(n,"one-way ANOVA",scope),status:"insufficient",required,value:null};
  return {...meta(n,"one-way ANOVA",scope,["Exploratory; daily means are recommended for hypothesis tests."]),status:"ok",required,value:{fStatistic:result.fStatistic,pValue:result.pValue,groups:groups.length}};
}

export function dunnPostHoc(valuesByGroup:Array<{label:string;values:number[]}>,scope:AnalysisScope,omnibusPValue:number):InferentialResult<Array<{a:string;b:string;z:number;pValue:number;adjustedPValue:number}>> {
  const groups=valuesByGroup.map(group=>({...group,values:cleanValues(group.values)})).filter(group=>group.values.length>=MINIMUMS.group),n=groups.reduce((sum,g)=>sum+g.values.length,0),required=MINIMUMS.group;
  if(groups.length<3)return {...meta(n,"Dunn post-hoc with Benjamini–Hochberg correction",scope),status:"insufficient",required,value:null};
  if(!numeric(omnibusPValue)||omnibusPValue>=.05)return {...meta(n,"Dunn post-hoc with Benjamini–Hochberg correction",scope,["Pairwise tests are suppressed because the Kruskal–Wallis test was not significant."]),status:"suppressed",required,value:null};
  const all=groups.flatMap(group=>group.values),allRanks=ranks(all),meanRanks:number[]=[];let offset=0;
  for(const group of groups){meanRanks.push(mean(allRanks.slice(offset,offset+group.values.length)));offset+=group.values.length;}
  const ties=new Map<number,number>();for(const value of all)ties.set(value,(ties.get(value)??0)+1);
  const tieCorrection=1-[...ties.values()].reduce((sum,t)=>sum+t**3-t,0)/(n**3-n),pairs:Array<{a:string;b:string;z:number;pValue:number;adjustedPValue:number}> = [];
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){const se=Math.sqrt(n*(n+1)/12*tieCorrection*(1/groups[i].values.length+1/groups[j].values.length)),z=se?(meanRanks[i]-meanRanks[j])/se:0;pairs.push({a:groups[i].label,b:groups[j].label,z,pValue:normalTwoSided(z),adjustedPValue:1});}
  const correction=benjaminiHochberg(pairs.map(pair=>pair.pValue),scope);
  if(correction.status==="ok")pairs.forEach((pair,index)=>pair.adjustedPValue=correction.value.adjusted[index]);
  return {...meta(n,"Dunn post-hoc with Benjamini–Hochberg correction",scope,["Exploratory; run only after a significant Kruskal–Wallis test."]),status:"ok",required,value:pairs};
}

export function randomEffectsMetaAnalysis(estimates:Array<{slope:number;standardError:number}>,scope:AnalysisScope):InferentialResult<{slope:number;ci95:[number,number];tauSquared:number;iSquared:number;q:number}> {
  const valid=estimates.filter(item=>numeric(item.slope)&&numeric(item.standardError)&&item.standardError>0),k=valid.length,required=3;
  if(k<required)return {...meta(k,"DerSimonian–Laird random-effects meta-analysis",scope),status:"insufficient",required,value:null};
  const fixedWeights=valid.map(item=>1/item.standardError**2),fixed=valid.reduce((sum,item,index)=>sum+fixedWeights[index]*item.slope,0)/fixedWeights.reduce((s,w)=>s+w,0);
  const q=valid.reduce((sum,item,index)=>sum+fixedWeights[index]*(item.slope-fixed)**2,0),c=fixedWeights.reduce((s,w)=>s+w,0)-fixedWeights.reduce((s,w)=>s+w*w,0)/fixedWeights.reduce((s,w)=>s+w,0),tauSquared=Math.max(0,(q-(k-1))/c);
  const weights=valid.map(item=>1/(item.standardError**2+tauSquared)),weightSum=weights.reduce((s,w)=>s+w,0),slope=valid.reduce((sum,item,index)=>sum+weights[index]*item.slope,0)/weightSum,se=Math.sqrt(1/weightSum);
  return {...meta(k,"DerSimonian–Laird random-effects meta-analysis",scope),status:"ok",required,value:{slope,ci95:[slope-1.95996398454*se,slope+1.95996398454*se],tauSquared,iSquared:q===0?0:Math.max(0,(q-(k-1))/q*100),q}};
}

export function clusterBootstrapCorrelation(cityPairs:Array<Array<[number,number]>>,scope:AnalysisScope,adjustWithinCity=false,seed=1,repetitions=2000):InferentialResult<{r:number;ci95:[number,number];pValue:number}> {
  const eligible=cityPairs.filter(pairs=>pairs.length>=MINIMUMS.correlation),cityCount=eligible.length,n=eligible.reduce((sum,pairs)=>sum+pairs.length,0),required=MINIMUMS.pooledCities;
  if(cityCount<required)return {...meta(n,"cluster bootstrap Pearson correlation",scope),status:"insufficient",required,value:null};
  const pooled=eligible.flatMap(pairs=>adjustWithinCity?(()=>{const mx=mean(pairs.map(pair=>pair[0])),my=mean(pairs.map(pair=>pair[1]));return pairs.map(([x,y]):[number,number]=>[x-mx,y-my]);})():pairs),observed=pearsonRaw(pooled).r;
  if(observed===null)return {...meta(n,"cluster bootstrap Pearson correlation",scope),status:"insufficient",required,value:null};
  const rng=seededRandom(seed),samples:number[]=[];
  for(let iteration=0;iteration<repetitions;iteration++){const resampled:Array<[number,number]>=[];for(let index=0;index<cityCount;index++){const pairs=eligible[Math.floor(rng()*cityCount)];if(adjustWithinCity){const mx=mean(pairs.map(pair=>pair[0])),my=mean(pairs.map(pair=>pair[1]));resampled.push(...pairs.map(([x,y]):[number,number]=>[x-mx,y-my]));}else resampled.push(...pairs);}const r=pearsonRaw(resampled).r;if(r!==null)samples.push(r);}
  if(!samples.length)return {...meta(n,"cluster bootstrap Pearson correlation",scope),status:"insufficient",required,value:null};
  const sorted=samples.sort((a,b)=>a-b),lower=quantile(sorted,.025),upper=quantile(sorted,.975),tail=Math.min(samples.filter(value=>value<=0).length,samples.filter(value=>value>=0).length),pValue=Math.min(1,2*tail/samples.length);
  return {...meta(n,"cluster bootstrap Pearson correlation",scope,["Cities, rather than individual hours, are resampled.","Association is not causation."]),status:"ok",required,value:{r:observed,ci95:[lower,upper],pValue}};
}

export function cityAdjustedCorrelation(readings:Reading[],xMetric:MetricKey,yMetric:MetricKey,scope:AnalysisScope):InferentialResult<{rawR:number;adjustedR:number;rawCi95:[number,number];adjustedCi95:[number,number];rawP:number;adjustedP:number;cityCount:number;disagrees:boolean}> {
  const scoped=rowsForScope(readings,scope),groups=new Map<string,Reading[]>();
  for(const row of scoped){const city=row.city_id??(scope.kind==="city"?scope.cityId:null);if(!city)continue;const rows=groups.get(city)??[];rows.push(row);groups.set(city,rows);}
  const cityPairs=[...groups.values()].map(rows=>rows.flatMap(row=>{const x=metricValue(row,xMetric),y=metricValue(row,yMetric);return x===null||y===null?[]:[[x,y] as [number,number]];})).filter(pairs=>pairs.length>=MINIMUMS.correlation),n=cityPairs.reduce((sum,pairs)=>sum+pairs.length,0);
  const raw=clusterBootstrapCorrelation(cityPairs,scope,false),adjusted=clusterBootstrapCorrelation(cityPairs,scope,true);
  if(raw.status!=="ok"||adjusted.status!=="ok")return {...meta(n,"raw and city-demeaned Pearson correlation",scope),status:"insufficient",required:MINIMUMS.pooledCities,value:null};
  return {...meta(n,"raw and city-demeaned Pearson correlation with city-cluster bootstrap",scope,["Association is not causation."]),status:"ok",required:MINIMUMS.pooledCities,value:{rawR:raw.value.r,adjustedR:adjusted.value.r,rawCi95:raw.value.ci95,adjustedCi95:adjusted.value.ci95,rawP:raw.value.pValue,adjustedP:adjusted.value.pValue,cityCount:cityPairs.length,disagrees:Math.sign(raw.value.r)!==Math.sign(adjusted.value.r)}};
}

export function citySlopeMetaAnalysis(readings:Reading[],xMetric:MetricKey,yMetric:MetricKey,scope:AnalysisScope):InferentialResult<{cities:Array<{cityId:string;n:number;slope:number;ci95:[number,number]}>&{};pooledSlope:number;pooledCi95:[number,number];iSquared:number;tauSquared:number;q:number}> {
  const scoped=rowsForScope(readings,scope),groups=new Map<string,Reading[]>();for(const row of scoped){const id=row.city_id??(scope.kind==="city"?scope.cityId:null);if(!id)continue;const values=groups.get(id)??[];values.push(row);groups.set(id,values);}
  const cities:Array<{cityId:string;n:number;slope:number;ci95:[number,number];standardError:number}>=[];
  for(const [cityId,rows] of groups){const x:number[]=[],y:number[]=[];for(const row of rows){const xv=metricValue(row,xMetric),yv=metricValue(row,yMetric);if(xv!==null&&yv!==null){x.push(xv);y.push(yv);}}
    const fit=linearRegression(x,y,scope,MINIMUMS.citySlope);if(fit.status!=="ok")continue;
    const critical=jStat.studentt.inv(.975,fit.n-2),se=(fit.value.ci95[1]-fit.value.ci95[0])/(2*critical);
    cities.push({cityId,n:fit.n,slope:fit.value.slope,ci95:fit.value.ci95,standardError:se});
  }
  const n=cities.reduce((sum,city)=>sum+city.n,0),required=3;
  if(cities.length<required)return {...meta(n,"per-city OLS slopes with DerSimonian–Laird meta-analysis",scope),status:"insufficient",required,value:null};
  const pooled=randomEffectsMetaAnalysis(cities.map(city=>({slope:city.slope,standardError:city.standardError})),scope);
  if(pooled.status!=="ok")return {...meta(n,"per-city OLS slopes with DerSimonian–Laird meta-analysis",scope),status:"insufficient",required,value:null};
  return {...meta(n,"per-city OLS slopes with DerSimonian–Laird meta-analysis",scope,["Each city is fitted separately; this reduces between-city confounding."]),status:"ok",required,value:{cities: cities.map(city=>({cityId:city.cityId,n:city.n,slope:city.slope,ci95:city.ci95})),pooledSlope:pooled.value.slope,pooledCi95:pooled.value.ci95,iSquared:pooled.value.iSquared,tauSquared:pooled.value.tauSquared,q:pooled.value.q}};
}

export type GridCell={x:string;y:string;n:number;mean:number|null;median:number|null;suppressed:boolean;cityCount:number;dominanceWarning:boolean};
export function binnedGrid(rows:DerivedReading[],xKey:keyof DerivedReading,yKey:keyof DerivedReading,target:MetricKey,scope:AnalysisScope):InferentialResult<GridCell[]> {
  const scoped=rowsForScope(rows,scope),groups=new Map<string,{x:string;y:string;values:number[];cities:Set<string>}>();
  for(const row of scoped){const x=row[xKey],y=row[yKey],value=metricValue(row,target);if(typeof x!=="string"||typeof y!=="string"||value===null)continue;const key=`${x}\u0000${y}`,cell=groups.get(key)??{x,y,values:[],cities:new Set<string>()};cell.values.push(value);if(row.city_id)cell.cities.add(row.city_id);groups.set(key,cell);}
  const cells=[...groups.values()].map(cell=>{const cityCount=cell.cities.size,n=cell.values.length,dominanceWarning=scope.kind==="global"&&cell.cities.size>0&&Math.max(...[...cell.cities].map(city=>scoped.filter(row=>row.city_id===city&&row[xKey]===cell.x&&row[yKey]===cell.y&&metricValue(row,target)!==null).length))/n>.3;const suppressed=n<5||dominanceWarning;return{x:cell.x,y:cell.y,n,mean:suppressed?null:mean(cell.values),median:suppressed?null:median(cell.values),suppressed,cityCount,dominanceWarning};});
  return {...meta(cells.reduce((sum,cell)=>sum+cell.n,0),"two-factor binned group summaries",scope,["Association is not causation."]),status:"ok",required:5,value:cells};
}

export const WEATHER_SCENARIOS=[
  {key:"hot-sunny-calm",label:"Hot, sunny, calm",test:(row:DerivedReading)=>row.temperature_c!==null&&row.temperature_c*9/5+32>=85&&row.cloud_coverage_pct!==null&&row.cloud_coverage_pct<=25&&row.wind_speed_ms!==null&&row.wind_speed_ms*2.23694<5&&row.is_daytime===true},
  {key:"cold-clear-calm-night",label:"Cold, clear, calm night",test:(row:DerivedReading)=>row.temperature_c!==null&&row.temperature_c*9/5+32<=40&&row.cloud_coverage_pct!==null&&row.cloud_coverage_pct<=25&&row.wind_speed_ms!==null&&row.wind_speed_ms*2.23694<3&&row.is_daytime===false},
  {key:"humid-stagnant",label:"Humid and stagnant",test:(row:DerivedReading)=>row.relative_humidity!==null&&row.relative_humidity>=80&&row.wind_speed_ms!==null&&row.wind_speed_ms*2.23694<5},
  {key:"rainy-windy",label:"Rainy and windy",test:(row:DerivedReading)=>row.precip_flag===true&&row.wind_speed_ms!==null&&row.wind_speed_ms*2.23694>=10},
  {key:"after-rain",label:"Within 24 hours after rain",test:(row:DerivedReading)=>row.hours_since_rain!==null&&row.hours_since_rain>0&&row.hours_since_rain<=24},
  {key:"high-pressure-light-wind",label:"High pressure and light wind",test:(row:DerivedReading)=>row.pressure_bin==="high"&&row.wind_speed_ms!==null&&row.wind_speed_ms*2.23694<5},
] as const;

export function compareCondition(values:number[],conditionFlags:boolean[],scope:AnalysisScope,robust=false):InferentialResult<{inside:{n:number;mean:number;median:number};outside:{n:number;mean:number;median:number};difference:number;ci95:[number,number];effectSize:number;pValue:number;testMethod:string}> {
  const inside:number[]=[],outside:number[]=[];for(let index=0;index<Math.min(values.length,conditionFlags.length);index++){if(!numeric(values[index]))continue;(conditionFlags[index]?inside:outside).push(values[index]);}
  const n=inside.length+outside.length,required=MINIMUMS.group;
  if(inside.length<required||outside.length<required)return {...meta(n,robust?"Mann–Whitney scenario comparison":"Welch scenario comparison",scope),status:"insufficient",required,value:null};
  const test=robust?mannWhitney(inside,outside,scope):welchTTest(inside,outside,scope);
  const boot=bootstrapDifference(inside,outside,scope,20261029,2000);
  if(test.status!=="ok"||boot.status!=="ok")return {...meta(n,"scenario comparison",scope),status:"insufficient",required,value:null};
  return {...meta(n,test.method,scope,["Scenario thresholds are exploratory; association is not cause."]),status:"ok",required,value:{inside:{n:inside.length,mean:mean(inside),median:median(inside)},outside:{n:outside.length,mean:mean(outside),median:median(outside)},difference:mean(inside)-mean(outside),ci95:boot.value.ci95,effectSize:test.value.effectSize,pValue:"pValue" in test.value?test.value.pValue:0,testMethod:test.method}};
}

export function conditionalAqiProbability(rows:Reading[],conditions:boolean[],threshold:number,scope:AnalysisScope):InferentialResult<{condition:{successes:number;n:number;probability:number;ci95:[number,number]};baseline:{successes:number;n:number;probability:number};difference:number}> {
  const n=Math.min(rows.length,conditions.length),condition=rows.slice(0,n).filter((_,index)=>conditions[index]&&numeric(rows[index].aqi)),baselineRows=rows.slice(0,n).filter(row=>numeric(row.aqi)),successes=condition.filter(row=>row.aqi!>threshold).length,baseSuccess=baselineRows.filter(row=>row.aqi!>threshold).length,required=20;
  if(condition.length<5||n<required)return {...meta(condition.length,"conditional AQI probability with Wilson interval",scope),status:"insufficient",required,value:null};
  const interval=wilsonInterval(successes,condition.length,scope);if(interval.status!=="ok")return {...meta(condition.length,"conditional AQI probability with Wilson interval",scope),status:"insufficient",required,value:null};
  const probability=successes/condition.length,baseline=baselineRows.length?baseSuccess/baselineRows.length:0;
  return {...meta(condition.length,"conditional AQI probability with Wilson interval",scope),status:"ok",required,value:{condition:{successes,n:condition.length,probability,ci95:interval.value.ci95},baseline:{successes:baseSuccess,n:baselineRows.length,probability:baseline},difference:probability-baseline}};
}

function invertMatrix(input:number[][]):number[][]|null {
  const n=input.length,matrix=input.map((row,index)=>[...row,...Array.from({length:n},(_,column)=>Number(index===column))]);
  for(let column=0;column<n;column++){let pivot=column;for(let row=column+1;row<n;row++)if(Math.abs(matrix[row][column])>Math.abs(matrix[pivot][column]))pivot=row;if(Math.abs(matrix[pivot][column])<1e-12)return null;[matrix[column],matrix[pivot]]=[matrix[pivot],matrix[column]];const value=matrix[column][column];for(let j=0;j<2*n;j++)matrix[column][j]/=value;for(let row=0;row<n;row++)if(row!==column){const factor=matrix[row][column];for(let j=0;j<2*n;j++)matrix[row][j]-=factor*matrix[column][j];}}
  return matrix.map(row=>row.slice(n));
}
function multiplyMatrixVector(matrix:number[][],vector:number[]){return matrix.map(row=>row.reduce((sum,value,index)=>sum+value*vector[index],0));}
export function multipleWeatherRegression(rows:DerivedReading[],target:MetricKey,scope:AnalysisScope,includeInteractions=true):InferentialResult<{n:number;coefficients:Array<{feature:string;estimate:number;ci95:[number,number];pValue:number;vif:number}>;rSquared:number;adjustedRSquared:number;residualSd:number}> {
  const scoped=rowsForScope(rows,scope),fields:Array<{name:string;get:(row:DerivedReading)=>number|null}>=[
    {name:"temperature",get:row=>row.temperature_c===null?null:(row.temperature_c*9/5+32)},
    {name:"wind_speed",get:row=>row.wind_speed_ms===null?null:row.wind_speed_ms*2.23694},
    {name:"humidity",get:row=>row.relative_humidity},
    {name:"cloud_cover",get:row=>row.cloud_coverage_pct},
    {name:"pressure",get:row=>row.barometric_pressure_pa===null?null:row.barometric_pressure_pa/3386.39},
    {name:"precipitation_flag",get:row=>row.precip_flag===null?null:Number(row.precip_flag)},
    {name:"hour_sin",get:row=>row.local_hour===null?null:Math.sin(2*Math.PI*row.local_hour/24)},
    {name:"hour_cos",get:row=>row.local_hour===null?null:Math.cos(2*Math.PI*row.local_hour/24)},
  ];
  const complete=scoped.map(row=>({row,target:metricValue(row,target),values:fields.map(field=>field.get(row))})).filter((item):item is {row:DerivedReading;target:number;values:number[]}=>item.target!==null&&item.values.every(numeric));
  const n=complete.length,required=MINIMUMS.model;
  if(n<required)return {...meta(n,"standardized multiple linear regression",scope),status:"insufficient",required,value:null};
  const predictors=fields.map((field,index)=>{const values=complete.map(row=>row.values[index]),avg=mean(values),sd=sampleStandardDeviation(values)||1;return{name:field.name,values:values.map(value=>(value-avg)/sd)};});
  if(includeInteractions){for(const [name,left,right] of [["temperature × wind","temperature","wind_speed"],["humidity × wind","humidity","wind_speed"]] as const){const a=predictors.find(item=>item.name===left)!,b=predictors.find(item=>item.name===right)!;predictors.push({name,values:a.values.map((value,index)=>value*b.values[index])});}}
  const y=complete.map(row=>row.target),columns=[Array(n).fill(1),...predictors.map(item=>item.values)],design=Array.from({length:n},(_,row)=>columns.map(column=>column[row])),xtx=Array.from({length:columns.length},(_,i)=>Array.from({length:columns.length},(_,j)=>design.reduce((sum,row)=>sum+row[i]*row[j],0))),inverse=invertMatrix(xtx),parameterCount=columns.length;
  if(!inverse)return {...meta(n,"standardized multiple linear regression",scope),status:"insufficient",required,value:null};
  const xty=columns.map(column=>column.reduce((sum,value,index)=>sum+value*y[index],0)),beta=multiplyMatrixVector(inverse,xty),predicted=design.map(row=>row.reduce((sum,value,index)=>sum+value*beta[index],0)),residuals=y.map((value,index)=>value-predicted[index]),rss=residuals.reduce((sum,value)=>sum+value**2,0),tss=y.reduce((sum,value)=>sum+(value-mean(y))**2,0),rSquared=tss?1-rss/tss:0,adjustedRSquared=1-(1-rSquared)*(n-1)/(n-parameterCount),residualVariance=rss/(n-parameterCount),residualSd=Math.sqrt(residualVariance),critical=jStat.studentt.inv(.975,n-parameterCount);
  const coefficients=predictors.map((predictor,index)=>{const variance=inverse[index+1][index+1]*residualVariance,se=Math.sqrt(Math.max(0,variance)),t=se?beta[index+1]/se:0,pValue=se?2*(1-jStat.studentt.cdf(Math.abs(t),n-parameterCount)):1;
    const others=predictors.filter((_,other)=>other!==index),vif=others.length?(()=>{const otherColumns=[Array(n).fill(1),...others.map(item=>item.values)],otherDesign=Array.from({length:n},(_,row)=>otherColumns.map(column=>column[row])),otherXtx=Array.from({length:otherColumns.length},(_,i)=>Array.from({length:otherColumns.length},(_,j)=>otherDesign.reduce((sum,row)=>sum+row[i]*row[j],0))),otherInverse=invertMatrix(otherXtx);if(!otherInverse)return Infinity;const targetValues=predictor.values,otherXty=otherColumns.map(column=>column.reduce((sum,value,row)=>sum+value*targetValues[row],0)),otherBeta=multiplyMatrixVector(otherInverse,otherXty),otherPredicted=otherDesign.map(row=>row.reduce((sum,value,j)=>sum+value*otherBeta[j],0)),total=targetValues.reduce((sum,value)=>sum+(value-mean(targetValues))**2,0),left=targetValues.reduce((sum,value,row)=>sum+(value-otherPredicted[row])**2,0),r2=total?1-left/total:0;return 1/Math.max(.0001,1-r2);})():1;
    return{feature:predictor.name,estimate:beta[index+1],ci95:[beta[index+1]-critical*se,beta[index+1]+critical*se] as [number,number],pValue,vif};});
  return {...meta(n,"standardized multiple linear regression with local-hour controls",scope,["Predictive association, not cause.",...(coefficients.some(item=>item.vif>5)?["Multicollinearity warning: at least one variance inflation factor exceeds 5."]:[])]),status:"ok",required,value:{n,coefficients,rSquared,adjustedRSquared,residualSd}};
}

export function effectiveSampleSize(values:number[],scope:AnalysisScope):InferentialResult<{rho1:number;effectiveN:number}> {
  const clean=cleanValues(values),n=clean.length,required=MINIMUMS.correlation;
  if(n<required)return {...meta(n,"lag-1 autocorrelation effective sample size",scope),status:"insufficient",required,value:null};
  const avg=mean(clean),denominator=clean.reduce((sum,v)=>sum+(v-avg)**2,0),rho1=denominator===0?0:clean.slice(1).reduce((sum,value,index)=>sum+(value-avg)*(clean[index]-avg),0)/denominator;
  const effectiveN=Math.max(1,Math.min(n,n*(1-rho1)/(1+rho1)));
  return {...meta(n,"lag-1 autocorrelation effective sample size",scope),status:"ok",required,value:{rho1,effectiveN}};
}

export function autocorrelation(values:number[],scope:AnalysisScope,maxLag=48):InferentialResult<Array<{lag:number;r:number}>> {
  const clean=cleanValues(values),n=clean.length,required=MINIMUMS.correlation;
  if(n<required)return {...meta(n,"hourly sample autocorrelation",scope),status:"insufficient",required,value:null};
  const avg=mean(clean),denominator=clean.reduce((sum,value)=>sum+(value-avg)**2,0),lags=Array.from({length:Math.min(maxLag,n-1)},(_,index)=>index+1).map(lag=>({lag,r:denominator?clean.slice(lag).reduce((sum,value,index)=>sum+(value-avg)*(clean[index]-avg),0)/denominator:0}));
  return {...meta(n,"hourly sample autocorrelation",scope,["Irregular timestamps are not interpolated; provide hourly data only."]),status:"ok",required,value:lags};
}

export function dailyMeans(readings:Reading[],cities:CityContext[],metric:MetricKey,scope:AnalysisScope):Array<{cityId:string;localDate:string;mean:number;n:number;method:string}> {
  const scoped=rowsForScope(readings,scope),contexts=new Map(cities.map(city=>[city.id,city])),groups=new Map<string,number[]>();
  for(const row of scoped){const cityId=row.city_id??(scope.kind==="city"?scope.cityId:null),city=cityId?contexts.get(cityId):undefined,value=metricValue(row,metric);if(!cityId||!city||value===null)continue;const parts=localParts(row.recorded_at,city.timezone),date=`${parts.year}-${String(parts.month).padStart(2,"0")}-${String(parts.day).padStart(2,"0")}`,key=`${cityId}|${date}`,values=groups.get(key)??[];values.push(value);groups.set(key,values);}
  return [...groups].map(([key,values])=>{const [cityId,localDate]=key.split("|");return{cityId,localDate,mean:mean(values),n:values.length,method:"mean of observed local-day entries"};}).sort((a,b)=>a.localDate.localeCompare(b.localDate)||a.cityId.localeCompare(b.cityId));
}

export function localTimeProfiles(readings:Reading[],cities:CityContext[],metric:MetricKey,scope:AnalysisScope):InferentialResult<Array<{bin:string;n:number;mean:number|null;median:number|null;suppressed:boolean}>> {
  const scoped=rowsForScope(readings,scope),contexts=new Map(cities.map(city=>[city.id,city])),hours=new Map<string,number[]>();
  for(const row of scoped){const cityId=row.city_id??(scope.kind==="city"?scope.cityId:null),city=cityId?contexts.get(cityId):undefined,value=metricValue(row,metric);if(!city||value===null)continue;const hour=localParts(row.recorded_at,city.timezone).hour,key=scope.kind==="global"?`${cityId}:${hour}`:hour,values=hours.get(key)??[];values.push(value);hours.set(key,values);}
  const profile=Array.from({length:24},(_,hour)=>{const bins=[...hours].filter(([key])=>scope.kind==="global"?key.endsWith(`:${String(hour).padStart(2,"0")}`):key===String(hour)).flatMap(([,values])=>values),n=bins.length,suppressed=n<3;return{bin:String(hour).padStart(2,"0"),n,mean:suppressed?null:mean(bins),median:suppressed?null:median(bins),suppressed};});
  return {...meta(profile.reduce((sum,row)=>sum+row.n,0),"local hour-of-day profile",scope),status:"ok",required:3,value:profile};
}

export function dailyTrend(readings:Reading[],cities:CityContext[],metric:MetricKey,scope:AnalysisScope):InferentialResult<{slopePerWeek:number;ci95:[number,number];pValue:number;mannKendallP:number;dailyN:number}> {
  const daily=dailyMeans(readings,cities,metric,scope).sort((a,b)=>a.localDate.localeCompare(b.localDate)),required=MINIMUMS.correlation;
  if(daily.length<required)return {...meta(daily.length,"daily-mean OLS trend and Mann–Kendall",scope),status:"insufficient",required,value:null};
  const origin=Date.parse(`${daily[0].localDate}T12:00:00Z`),x=daily.map(row=>(Date.parse(`${row.localDate}T12:00:00Z`)-origin)/604800000),y=daily.map(row=>row.mean),fit=linearRegression(x,y,scope,required),mk=mannKendall(y,scope);
  if(fit.status!=="ok"||mk.status!=="ok")return {...meta(daily.length,"daily-mean OLS trend and Mann–Kendall",scope),status:"insufficient",required,value:null};
  return {...meta(daily.length,"daily-mean OLS trend and Mann–Kendall",scope,["OLS confidence interval and p-value are exploratory; Mann–Kendall is robust to distribution shape."]),status:"ok",required,value:{slopePerWeek:fit.value.slope,ci95:fit.value.ci95,pValue:fit.value.pValue,mannKendallP:mk.value.pValue,dailyN:daily.length}};
}

export function exceedanceSummary(readings:Reading[],scope:AnalysisScope):InferentialResult<{thresholds:Array<{threshold:number;hours:number;share:number}>;longestRunAbove100:number;eventsAbove100:number}> {
  const rows=rowsForScope(readings,scope).filter(row=>numeric(row.aqi)&&Number.isFinite(Date.parse(row.recorded_at))).sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at)),n=rows.length,required=1;
  if(!n)return {...meta(0,"AQI exceedance and event summary",scope),status:"insufficient",required,value:null};
  let run=0,longest=0,events=0,inEvent=false,previous=0;
  for(const row of rows){const time=Date.parse(row.recorded_at),above=row.aqi!>100;if(above){run=run&&time-previous<=1.5*3600000?run+1:1;longest=Math.max(longest,run);if(!inEvent||time-previous>1.5*3600000)events++;inEvent=true;}else{run=0;inEvent=false;}previous=time;}
  return {...meta(n,"AQI exceedance and event summary",scope),status:"ok",required,value:{thresholds:[50,100,150].map(threshold=>{const hours=rows.filter(row=>row.aqi!>threshold).length;return{threshold,hours,share:hours/n};}),longestRunAbove100:longest,eventsAbove100:events}};
}

export function anomalies(readings:DerivedReading[],scope:AnalysisScope):InferentialResult<Array<{cityId:string;recordedAt:string;delta:number;weather:string}>> {
  const rows=rowsForScope(readings,scope).filter(row=>numeric(row.aqi_delta_vs_hour_mean)),n=rows.length,required=MINIMUMS.spread;
  if(n<required)return {...meta(n,"hour-adjusted AQI anomaly flags",scope),status:"insufficient",required,value:null};
  const values=rows.map(row=>row.aqi_delta_vs_hour_mean!),sd=sampleStandardDeviation(values),threshold=2*sd;
  const flagged=rows.filter(row=>Math.abs(row.aqi_delta_vs_hour_mean!)>threshold).map(row=>({cityId:row.city_id??"unknown",recordedAt:row.recorded_at,delta:row.aqi_delta_vs_hour_mean!,weather:[row.text_description,temperatureBin(row.temperature_c),windBin(row.wind_speed_ms),row.precipitation_type].filter(Boolean).join(" · ")}));
  return {...meta(n,"hour-adjusted AQI anomaly flags (> ±2 SD)",scope),status:"ok",required,value:flagged};
}

export type CityContext = { id:string; timezone:string; lat:number; lon:number; name?:string; slug?:string; state?:string; population?:number|null; region?:string|null; climateType?:string|null; sizeBand?:string|null };
export type DerivedReading = Reading & {
  local_hour:number|null; day_of_week:number|null; month:number|null; season:string|null; is_daytime:boolean|null;
  precip_flag:boolean|null; hours_since_rain:number|null; rain_last_24h_mm:number|null; wind_dir_sector:string|null;
  temp_bin:string|null; wind_bin:string|null; rh_bin:string|null; cloud_bin:string|null; pressure_bin:string|null;
  pressure_change_3h:number|null; aqi_delta_vs_hour_mean:number|null; pollutant_delta_vs_hour_mean:Record<string,number|null>;
  metric_delta_vs_hour_mean:Partial<Record<MetricKey,number|null>>;
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
    const hours=new Map<number,number[]>(),pollutantHours=new Map<string,Map<number,number[]>>(),allMetricHours=new Map<MetricKey,Map<number,number[]>>();
    for(const row of ordered){const part=localParts(row.recorded_at,city.timezone),hour=Number(part.hour),aqiValues=hours.get(hour)??[];if(numeric(row.aqi))aqiValues.push(row.aqi);hours.set(hour,aqiValues);
      for(const field of ["pm25","pm10","ozone","no2","so2","co"] as const){const byHour=pollutantHours.get(field)??new Map<number,number[]>(),values=byHour.get(hour)??[];if(numeric(row[field]))values.push(row[field]!);byHour.set(hour,values);pollutantHours.set(field,byHour);}}
    for(const row of ordered){const hour=Number(localParts(row.recorded_at,city.timezone).hour);for(const metric of NUMERIC_METRICS){const value=metricValue(row,metric.key),byHour=allMetricHours.get(metric.key)??new Map<number,number[]>(),values=byHour.get(hour)??[];if(value!==null)values.push(value);byHour.set(hour,values);allMetricHours.set(metric.key,byHour);}}
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
      const metricDeltaVsHourMean=Object.fromEntries(NUMERIC_METRICS.map(metric=>{const value=metricValue(row,metric.key),values=allMetricHours.get(metric.key)?.get(hour)??[];return[metric.key,value!==null&&values.length?value-mean(values):null];})) as Partial<Record<MetricKey,number|null>>;
      const sector=row.wind_speed_ms!==null&&row.wind_speed_ms<1?"calm":numeric(row.wind_direction_deg)?(["N","NE","E","SE","S","SW","W","NW"][Math.round(row.wind_direction_deg/45)%8]):null;
      result.push({...row,local_hour:Number.isFinite(hour)?hour:null,day_of_week:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(part.weekday),month,season,
        is_daytime:solar.sunrise===null?false:solar.sunset===null?true:utcMinute>=solar.sunrise&&utcMinute<=solar.sunset,
        precip_flag:precipFlag,hours_since_rain:lastRain===null?null:(timestamp-lastRain)/3600000,rain_last_24h_mm:rainHours>=18?rainSum:null,wind_dir_sector:sector,
        temp_bin:temperatureBin(row.temperature_c),wind_bin:windBin(row.wind_speed_ms),rh_bin:humidityBin(row.relative_humidity),cloud_bin:cloudBin(row.cloud_coverage_pct),
        pressure_bin:!numeric(row.barometric_pressure_pa)||pLow===null||pHigh===null?null:row.barometric_pressure_pa<=pLow?"low":row.barometric_pressure_pa<=pHigh?"medium":"high",
        pressure_change_3h:numeric(prior)&&numeric(row.barometric_pressure_pa)?row.barometric_pressure_pa-prior:null,
        aqi_delta_vs_hour_mean:numeric(row.aqi)&&aqiMean!==null?row.aqi-aqiMean:null,pollutant_delta_vs_hour_mean:pollutantDeltaVsHourMean,metric_delta_vs_hour_mean:metricDeltaVsHourMean,
        city_timezone:city.timezone,city_region:city.region??null,climate_type:city.climateType??null,city_size_band:city.sizeBand??null});
    }
  }
  return result;
}
