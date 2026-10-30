import Link from "next/link";
import { CityInsights } from "@/components/CityInsights";
import { getAllReadings } from "@/lib/data";

export const revalidate = 300;

export default async function InsightsPage() {
  const { readings, error, localFallback } = await getAllReadings();
  if (error) return <main id="main-content" className="page-main"><div className="page-container"><div className="error-panel" role="alert"><div><strong>Archive data could not load.</strong><span>{error}</span></div><Link className="button secondary" href="/insights">Try again</Link></div></div></main>;

  return <main id="main-content" className="page-main"><div className="page-container all-insights-page">
    <Link className="back-link" href="/">← <span>All cities</span></Link>
    <header className="all-insights-heading"><p className="page-kicker">Cross-city analysis</p><h1>Air quality across cities</h1><p>Compare AQI and pollutant concentrations with weather conditions across every city and archived reading. Use the metric relationship, scatter, and group comparison controls to explore combinations.</p></header>
    {localFallback && <div className="notice-panel"><span>Showing the available manual seed readings. Apply migrations and ingest observations to analyze the full city archive.</span></div>}
    <CityInsights readings={readings} timezone="UTC" now={Date.now()} title="All-city statistics and archive insights" showSampleControl />
  </div></main>;
}
