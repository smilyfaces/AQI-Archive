import Link from "next/link";
import { CityInsights } from "@/components/CityInsights";
import { getAllReadings } from "@/lib/data";
import { rankCitiesByAqi } from "@/lib/statistics";

export const revalidate = 300;

export default async function InsightsPage() {
  const { readings, cities, error, localFallback, asOf } = await getAllReadings();
  if (error) return <main id="main-content" className="page-main"><div className="page-container"><div className="error-panel" role="alert"><div><strong>Archive data could not load.</strong><span>{error}</span></div><Link className="button secondary" href="/insights">Try again</Link></div></div></main>;
  const ranking=rankCitiesByAqi(readings,cities,{kind:"global"});
  const eligible=ranking.status==="ok"?ranking.value.filter(city=>city.eligible):[];
  const insufficient=ranking.status==="ok"?ranking.value.filter(city=>!city.eligible):[];

  return <main id="main-content" className="page-main"><div className="page-container all-insights-page">
    <Link className="back-link" href="/">← <span>All cities</span></Link>
    <header className="all-insights-heading"><p className="page-kicker">Cross-city analysis</p><h1>Air quality across cities</h1><p>Compare AQI and pollutant concentrations with weather conditions across every city and archived reading. Use the metric relationship, scatter, and group comparison controls to explore combinations.</p></header>
    {localFallback && <div className="notice-panel"><span>Showing the available manual seed readings. Apply migrations and ingest observations to analyze the full city archive.</span></div>}
    <section className="insight-section" aria-labelledby="city-ranking-heading"><div className="insight-heading"><h2 id="city-ranking-heading">City AQI ranking</h2><p>Each city contributes one mean AQI to the ranking. Cities need at least 10 AQI readings; lower coverage is listed separately. Rankings are descriptive, not causal.</p></div>
      {eligible.length?<div className="table-scroll"><table className="stats-table"><thead><tr><th scope="col">Rank</th><th scope="col">City</th><th scope="col">n</th><th scope="col">Mean AQI</th><th scope="col">Median AQI</th><th scope="col">95th percentile</th><th scope="col">Readings above 100</th></tr></thead><tbody>{eligible.map((city,index)=><tr key={city.cityId}><td>{index+1}</td><th scope="row"><Link href={`/city/${city.slug}`}>{city.name}, {city.state}</Link></th><td>{city.n}</td><td>{city.mean?.toFixed(1)}</td><td>{city.median?.toFixed(1)}</td><td>{city.p95?.toFixed(1)}</td><td>{city.above100Percent?.toFixed(1)}%</td></tr>)}</tbody></table></div>:<div className="empty-panel small-empty">No city currently meets the 10-reading minimum.</div>}
      {insufficient.length>0&&<details className="ranking-list"><summary>Not enough data to rank ({insufficient.length} cities)</summary><ul>{insufficient.map(city=><li key={city.cityId}><span>{city.name}, {city.state}</span><strong>n = {city.n} (need 10)</strong></li>)}</ul></details>}
    </section>
    <CityInsights readings={readings} timezone="UTC" now={asOf} title="All-city statistics and archive insights" showSampleControl />
  </div></main>;
}
