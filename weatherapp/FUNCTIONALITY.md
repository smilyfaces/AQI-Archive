# FUNCTIONALITY.md — US City AQI & Weather Tracker

This file defines **what the website does**. Visual design lives in `STYLES.md`. Where the two conflict on behavior, this file wins; on appearance, `STYLES.md` wins.

> **Agent instructions:** Verify every external API (endpoints, field names, rate limits, auth) against its current official docs before coding. Anything marked **(verify)** was not confirmed when this spec was written. Do not guess field names.

---

## 1. Product summary

A website that records **air quality and weather conditions every hour** for ~60 major US cities, stores them permanently in a database (the **archive**), and presents:

1. A home page of **city cards** showing current conditions.
2. A **city page** with current conditions plus statistical analysis of that city's archive, and access to the full archive (viewable and downloadable as a formatted PDF).
3. A **saved cities** page that shows saved cities and, most importantly, **comparisons between them**.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Next.js (App Router) + React + TypeScript** | Server Components for data pages; Client Components for interactive charts/filters |
| Styling | **Tailwind CSS** + CSS variables from `STYLES.md` | |
| Database | **Supabase (PostgreSQL)** | Public read via RLS; writes only via service role |
| Scheduler | **Supabase `pg_cron` + `pg_net` → Supabase Edge Function** | **Do not use Vercel Cron** — Hobby plan only allows once-per-day schedules. Fallback: GitHub Actions cron hitting a secured route |
| Weather API | **National Weather Service API — `https://api.weather.gov`** | Free, **no API key**, official US source, required `User-Agent` header with contact info. Matches the "weather conditions provided by NWS" requirement |
| AQI API | **EPA AirNow API** (`https://www.airnowapi.org`) | Free key. Official AQI + dominant pollutant. 500 requests/hour/key. (verify) |
| Pollutant concentrations | **OpenAQ API v3** (free key) as primary supplement; EPA AirNow hourly file products as alternative **(verify which gives usable concentrations per city)** | AirNow's observation endpoint returns AQI values per pollutant, **not raw concentrations** (verify) |
| Charts | **Recharts** (+ small custom SVG for heatmaps/box plots) | |
| Statistics | **simple-statistics** + **jstat** (p-values, t-tests) | Compute server-side; cache results |
| Validation | **Zod** | Validate every API response before insert |
| Dates / timezones | **date-fns** + **date-fns-tz** | Store UTC, display in each city's local timezone |
| PDF export | **@react-pdf/renderer** (server route) — or **pdfmake** | Must render tables, headers, page numbers, and charts-as-images |
| Data fetching (client) | **TanStack Query** | |
| Hosting | **Vercel** (frontend) + **Supabase** (DB, cron, Edge Functions) | |

### Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server/Edge Function only, never exposed to the browser
AIRNOW_API_KEY=
OPENAQ_API_KEY=
NWS_USER_AGENT="AQITracker (contact@yourdomain.com)"
INGEST_SECRET=                  # shared secret authenticating the cron → function call
```

---

## 3. Tracked cities

### 3.1 Required (always tracked)
| City | State | NWS station (verify) | Notes |
|---|---|---|---|
| Columbia | SC | KCAE | Timezone `America/New_York` |
| Oakland | CA | KOAK | Timezone `America/Los_Angeles` |
| Lamont | OK | none in town | Tiny town with no public monitor/station. **Use nearest surrounding sources** (candidate NWS stations: Ponca City KPNC, Enid KEND, Stillwater KSWO; resolve nearest-with-data via the NWS `points` endpoint). Timezone `America/Chicago`. Display a note: *"Data from nearby station: {name} ({distance} mi)"* |

### 3.2 Additional cities (most major US cities)
New York NY · Los Angeles CA · Chicago IL · Houston TX · Phoenix AZ · Philadelphia PA · San Antonio TX · San Diego CA · Dallas TX · Jacksonville FL · Fort Worth TX · San Jose CA · Austin TX · Charlotte NC · Columbus OH · Indianapolis IN · San Francisco CA · Seattle WA · Denver CO · Washington DC · Nashville TN · Oklahoma City OK · El Paso TX · Boston MA · Portland OR · Las Vegas NV · Detroit MI · Memphis TN · Louisville KY · Baltimore MD · Milwaukee WI · Albuquerque NM · Tucson AZ · Fresno CA · Sacramento CA · Mesa AZ · Atlanta GA · Kansas City MO · Colorado Springs CO · Omaha NE · Raleigh NC · Miami FL · Virginia Beach VA · Long Beach CA · Minneapolis MN · Tampa FL · New Orleans LA · Cleveland OH · Honolulu HI · Anchorage AK · Pittsburgh PA · St. Louis MO · Cincinnati OH · Salt Lake City UT · Boise ID · Birmingham AL · Charleston SC

### 3.3 City setup rules
- Store cities in a `cities` table (slug, name, state, lat, lon, IANA timezone, nws_station_id, airnow reporting area / zip, openaq location ids, `data_source_note`).
- Geocode lat/lon once at seed time; resolve the nearest NWS observation station via `GET /points/{lat},{lon}` → `observationStations`, ordered nearest-first.
- **Fallback rule (applies to any city):** if the nearest station/monitor has no data or a stale observation (> 2 h old), try the next nearest (up to 5). Record which station was actually used on each reading (`weather_station_id`, `aqi_source_site`).
- Slugs: `columbia-sc`, `oakland-ca`, `lamont-ok`, etc. City page URL: `/city/[slug]`.
- Admin can add cities by inserting a row — no code change required.

---

## 4. Data collection (hourly recording)

### 4.1 Schedule
- Run **every hour at :35** (AirNow says the previous hour's observations are generally available 10–30 minutes past the hour).
- `recorded_at` = the **top of the hour** (UTC) the reading represents.
- The job fetches all cities, with concurrency limit (~5) and per-request timeout (10 s), and **upserts** on `(city_id, recorded_at)` so reruns never create duplicates.
- Partial success is valid: if weather succeeds but AQI fails (or vice versa), insert what exists and leave the rest `NULL`. Never skip a city because one source failed.
- Retries: 3 attempts with exponential backoff per request. Respect `429` and `Retry-After`.
- Log every run to `ingest_runs` (started_at, finished_at, cities_ok, cities_partial, cities_failed, error summary).
- Request budget: ≈ 61 cities × (1 AirNow + 1–2 NWS + 1 OpenAQ) per hour — well inside the AirNow 500/hr cap.
- **Backfill:** if a run is missed, on the next run attempt to fill gaps from the last 24 h where the sources allow (AirNow historical endpoint; NWS keeps recent observations only). Never fabricate or interpolate values.

### 4.2 What each hourly record contains

**Air quality**
- `aqi` (overall, US EPA scale 0–500)
- `aqi_category` (Good / Moderate / Unhealthy for Sensitive Groups / Unhealthy / Very Unhealthy / Hazardous — derive from `aqi`)
- `primary_pollutant` (the pollutant with the highest sub-index: PM2.5, PM10, Ozone, NO2, SO2, CO)
- **Concentration for every pollutant available**: `pm25`, `pm10`, `ozone`, `no2`, `so2`, `co`
- Optionally the per-pollutant AQI sub-index (`aqi_pm25`, `aqi_ozone`, …)

**Weather (everything NWS provides in an observation)**
- `temperature` · `dewpoint` · `relative_humidity`
- `cloud_coverage` (derived: see 4.4) and raw `cloud_layers` (JSON)
- `precipitation_last_hour` (and 3 h / 6 h if present) and `precipitation_type` (derived: see 4.4)
- `text_description` (e.g. "Mostly Cloudy") — this is the "last weather condition" shown on cards
- `wind_speed`, `wind_direction`, `wind_gust`
- `barometric_pressure`, `sea_level_pressure`
- `visibility`
- `heat_index`, `wind_chill`
- `present_weather` (raw METAR phenomena, JSON), `raw_metar` (text)
- `weather_station_id`, `weather_observed_at` (the NWS observation timestamp actually used)

### 4.3 Units (canonical storage)
| Quantity | Stored unit |
|---|---|
| PM2.5, PM10, Ozone, NO2, SO2 | **µg/m³** |
| CO | mg/m³ |
| Temperature, dewpoint, heat index, wind chill | °C (display °F by default, user toggle) |
| Wind | m/s (display mph) |
| Pressure | Pa (display inHg) |
| Visibility | m (display miles) |
| Precipitation | mm (display inches) |
| Relative humidity, cloud coverage | % |

Convert ppb → µg/m³ at 25 °C, 1 atm: **O3 ×1.96, NO2 ×1.88, SO2 ×2.62**; CO ppm → mg/m³ ×1.146. Keep the original value/unit in a `raw` JSON column for audit.

### 4.4 Derivations
- **Cloud coverage:** take the highest-coverage layer from `cloudLayers`. CLR/SKC = 0 %, FEW ≈ 18 %, SCT ≈ 44 %, BKN ≈ 75 %, OVC/VV = 100 %. Store both the percent and the label (Clear / Few / Scattered / Broken / Overcast). Many AWOS stations return empty `cloudLayers` → fall back to next nearest station (see 3.3); if still none, `NULL`.
- **Precipitation type:** map `presentWeather` codes → `none | rain | drizzle | snow | freezing_rain | sleet | hail | mixed`. No precip phenomenon with a valid observation = `none`; no observation = `NULL`.
- **Primary pollutant / AQI fallback:** if the source returns concentrations but no AQI, compute AQI from concentrations using the current EPA breakpoint table (verify the 2024 PM2.5 revision).

### 4.5 NULL vs zero
`NULL` means **not recorded**; `0` means measured zero. The UI renders `NULL` as **"N/A"**. Statistics must **exclude** `NULL`s (pairwise-complete for correlations) and show the sample size `n` used.

---

## 5. Database schema (Supabase / Postgres)

```sql
cities (
  id uuid pk, slug text unique, name text, state text,
  lat double precision, lon double precision, timezone text,
  nws_station_id text, airnow_area text, openaq_location_ids int[],
  data_source_note text, is_active boolean default true
)

readings (
  id bigserial pk,
  city_id uuid references cities,
  recorded_at timestamptz not null,           -- top of hour, UTC (manual rows: exact time)
  source text not null,                       -- 'automated' | 'manual'
  -- air quality
  aqi int, aqi_category text, primary_pollutant text,
  pm25 numeric, pm10 numeric, ozone numeric, no2 numeric, so2 numeric, co numeric,
  aqi_pm25 int, aqi_pm10 int, aqi_ozone int, aqi_no2 int, aqi_so2 int, aqi_co int,
  -- weather
  temperature_c numeric, dewpoint_c numeric, relative_humidity numeric,
  cloud_coverage_pct numeric, cloud_coverage_label text, cloud_layers jsonb,
  precipitation_last_hour_mm numeric, precipitation_type text,
  text_description text,
  wind_speed_ms numeric, wind_direction_deg numeric, wind_gust_ms numeric,
  barometric_pressure_pa numeric, sea_level_pressure_pa numeric,
  visibility_m numeric, heat_index_c numeric, wind_chill_c numeric,
  present_weather jsonb, raw_metar text,
  weather_station_id text, weather_observed_at timestamptz, aqi_source_site text,
  raw jsonb,
  unique (city_id, recorded_at)
)
index on readings (city_id, recorded_at desc)

ingest_runs (id, started_at, finished_at, cities_ok, cities_partial, cities_failed, errors jsonb)

latest_readings  -- view/materialized view: newest reading per city (powers home page cards)
```

- **RLS:** `SELECT` allowed for anon on `cities`, `readings`, views. No anon `INSERT/UPDATE/DELETE`. Ingestion uses the service role.
- Expected volume ≈ 61 cities × 24 × 365 ≈ 535k rows/year — fine for Supabase free tier for the first year; monitor size.
- Supabase free-tier projects pause after about a week of inactivity — keep the project active (regular traffic or a paid plan).

---

## 6. Seed data — personal recordings (Columbia, Oakland, Lamont)

Import these as `source = 'manual'` rows **before** automated collection begins. These are the user's own recordings from the last ~2 months.

**Rules for manual rows**
- Weather fields are **all `NULL`** (display "N/A"). Do not backfill weather.
- Only the **primary pollutant's** concentration is stored; all other pollutant concentrations are `NULL` ("N/A").
- A concentration of "N/A" below means `NULL` for the primary pollutant too.
- Timestamps were identical across all three cities, so they are treated as the recorder's local time: **`America/New_York` (EDT)** — configurable constant `MANUAL_ENTRY_TIMEZONE`. Convert to UTC for storage. (Confirm with user — see §14.)
- Units were entered as µg/m³ for all pollutants including Ozone and NO2 (store as given). Typos "µg/m" and "µg/m3" mean µg/m³.
- Manual timestamps are **irregular** (not hourly). Stats/charts must use real timestamps and never assume uniform intervals.
- Compute `aqi_category` from `aqi`. Leave sub-indices `NULL`.

**Shared timestamps (local, 24 h)**

| # | Local time | # | Local time | # | Local time |
|---|---|---|---|---|---|
| 1 | 2026-08-18 22:00 | 9 | 2026-09-14 20:17 | 17 | 2026-10-06 10:07 |
| 2 | 2026-08-27 21:25 | 10 | 2026-09-16 14:57 | 18 | 2026-10-08 15:35 |
| 3 | 2026-08-29 21:52 | 11 | 2026-09-19 16:32 | 19 | 2026-10-13 10:33 |
| 4 | 2026-09-03 10:16 | 12 | 2026-09-21 14:39 | 20 | 2026-10-14 11:22 |
| 5 | 2026-09-04 22:25 | 13 | 2026-09-24 13:24 | 21 | 2026-10-16 22:21 |
| 6 | 2026-09-05 21:15 | 14 | 2026-09-27 15:37 | 22 | 2026-10-20 10:07 |
| 7 | 2026-09-10 23:33 | 15 | 2026-09-29 12:10 | 23 | 2026-10-22 09:57 |
| 8 | 2026-09-11 15:48 | 16 | 2026-10-04 15:13 | | |

**Oakland, CA** (`oakland-ca`) — format: `# | primary pollutant | concentration (µg/m³) | AQI`

| # | PP | Conc. | AQI | # | PP | Conc. | AQI |
|---|---|---|---|---|---|---|---|
| 1 | PM2.5 | N/A | 25 | 13 | PM2.5 | 8.9 | 49 |
| 2 | PM2.5 | N/A | 20 | 14 | Ozone | 56 | 26 |
| 3 | PM2.5 | N/A | 34 | 15 | PM2.5 | 4.3 | 24 |
| 4 | Ozone | N/A | 21 | 16 | PM2.5 | 8.5 | 47 |
| 5 | Ozone | N/A | 32 | 17 | PM2.5 | 6.3 | 34 |
| 6 | Ozone | N/A | 32 | 18 | PM2.5 | 7.6 | 42 |
| 7 | PM2.5 | 7.7 | 42 | 19 | NO2 | 37.8 | 19 |
| 8 | PM2.5 | 6.0 | 33 | 20 | PM2.5 | 3.6 | 20 |
| 9 | PM2.5 | 5.1 | 28 | 21 | Ozone | 103 | 48 |
| 10 | Ozone | 60 | 28 | 22 | Ozone | 32 | 32 |
| 11 | PM2.5 | 6.3 | 35 | 23 | PM2.5 | 7.3 | 41 |
| 12 | Ozone | 48 | 35 | | | | |

**Columbia, SC** (`columbia-sc`)

| # | PP | Conc. | AQI | # | PP | Conc. | AQI |
|---|---|---|---|---|---|---|---|
| 1 | PM2.5 | N/A | 53 | 13 | PM2.5 | 2.9 | 16 |
| 2 | PM2.5 | N/A | 54 | 14 | Ozone | 86 | 40 |
| 3 | PM2.5 | N/A | 55 | 15 | PM2.5 | 6.6 | 37 |
| 4 | PM2.5 | N/A | 56 | 16 | PM2.5 | 10.6 | 54 |
| 5 | PM2.5 | N/A | 32 | 17 | PM2.5 | 6.4 | 35 |
| 6 | PM2.5 | N/A | 42 | 18 | PM2.5 | 8.3 | 46 |
| 7 | PM2.5 | 4.2 | 23 | 19 | PM2.5 | 7.2 | 39 |
| 8 | PM2.5 | 3.5 | 19 | 20 | PM2.5 | 17 | 66 |
| 9 | Ozone | 122 | 75 | 21 | PM2.5 | 21.3 | 74 |
| 10 | PM2.5 | 9.1 | 52 | 22 | PM2.5 | 4.3 | 23 |
| 11 | PM2.5 | 11.2 | 55 | 23 | PM2.5 | 6.6 | 36 |
| 12 | PM2.5 | 11.2 | 55 | | | | |

**Lamont, OK** (`lamont-ok`)

| # | PP | Conc. | AQI | # | PP | Conc. | AQI |
|---|---|---|---|---|---|---|---|
| 1 | PM2.5 | N/A | 56 | 13 | PM2.5 | 12.9 | 58 |
| 2 | PM2.5 | N/A | 65 | 14 | PM2.5 | 18.98 | 72 |
| 3 | Ozone | N/A | 93 | 15 | PM2.5 | 14.67 | 64 |
| 4 | PM2.5 | N/A | 37 | 16 | PM2.5 | 5.01 | 37 |
| 5 | Ozone | N/A | 54 | 17 | PM2.5 | 5.36 | 26 |
| 6 | Ozone | N/A | 54 | 18 | PM2.5 | 7.49 | 50 |
| 7 | Ozone | 68.03 | 42 | 19 | PM2.5 | 5.87 | 29 |
| 8 | PM2.5 | 9.01 | 53 | 20 | PM2.5 | 2.7 | 15 |
| 9 | PM2.5 | 6.6 | 37 | 21 | Ozone | 56.76 | 25 |
| 10 | PM2.5 | 10.2 | 52 | 22 | PM2.5 | 8.7 | 46 |
| 11 | PM2.5 | 9.63 | 54 | 23 | PM2.5 | 10.54 | 56 |
| 12 | PM2.5 | 9.63 | 54 | | | | |

*Seed as given: Columbia #11/#12 and Lamont #11/#12 have identical values (possible duplicate entries) — do not alter; flagged to user.*

Archive rows from the manual set display a small **"Manual entry"** tag.

---

## 7. Pages & routes

| Route | Page |
|---|---|
| `/` | Home — city cards |
| `/city/[slug]` | City page — current conditions + statistics |
| `/city/[slug]/archive` | City archive — browse/filter/download |
| `/saved` | Saved cities — per-city stats + comparisons |
| `/api/city/[slug]/archive.pdf` | PDF export (honors the same filters as the archive view) |
| `/api/ingest` (or Edge Function) | Hourly ingestion, secured by `INGEST_SECRET` |

### 7.1 Global header (all pages)
- **Logo** (placeholder, links to `/`)
- **Home** button → `/`
- **Search bar** — type-ahead over city name/state (debounced, keyboard navigable, ↑/↓/Enter, Esc). Selecting a result opens the city page. "No cities match" empty state.
- **Saved** button → `/saved`, with a badge showing the saved count
- Sticky on scroll; collapses to icon buttons + expandable search on mobile.

### 7.2 Home page (`/`)
Per the wireframe:
- **Worst air quality** section: cities with highest current AQI. Shows 4 cards, **Load more** adds 4.
- **Best air quality** section: cities with lowest current AQI. Same behavior.
- **All cities** section: full grid with sort (Worst AQI · Best AQI · A–Z · Saved first) and a state filter.
- Cities with no recent reading (> 3 h old) show a "Last updated {time}" stale warning; cities with no data at all show an empty state card, and are excluded from Worst/Best rankings.

### 7.3 City card (reused on home, saved page, search results)
Shows:
- City name + state
- **Save toggle** (star/bookmark; stops click-through)
- **Current AQI** (large number) + category label + color indicator
- **Current primary pollutant**
- **Primary pollutant concentration** (with unit)
- **Last weather condition recording**: text description, temperature, and an icon; plus "Updated {relative time}"
- Whole card is a link to `/city/[slug]` (keyboard focusable; Save button is a separate control)
- Missing values render "N/A"

### 7.4 City page (`/city/[slug]`)
**Top section:** everything on the city card, larger, plus extra current conditions (humidity, cloud coverage, precipitation, wind, etc. when available), the Save button, a "Data source" note (esp. Lamont), and a **View archive** button.

**Body — statistics** (all computed from the city's archive; include a time-range selector: *24 h · 7 days · 30 days · All time* and show `n` for every calculation):

1. **Summary table** for every numeric metric (AQI, each pollutant concentration, temperature, RH, cloud coverage, precipitation): `n`, mean, median, min, max, standard deviation, variance, IQR, 5th/95th percentile, mode (for categorical).
2. **Distributions** for **all** metrics: histogram (+ optional KDE) and box plot, with mean/median markers. Categorical distributions: AQI category share, primary pollutant share, precipitation type share, cloud coverage label share.
3. **Time series**: AQI over time (bands colored by AQI category), pollutant concentrations, temperature/humidity; hover tooltips; irregular timestamps handled (no interpolation across gaps — show gaps).
4. **Patterns**: average AQI by hour of day and by day of week; AQI trend (linear slope with 95 % CI); rolling 24 h/7 d averages.
5. **Correlation analysis** between all metric pairs:
   - Correlation matrix heatmap (Pearson default, Spearman toggle), pairwise-complete observations.
   - **Scatter plots with regression line** for selectable pairs, showing `r`, `R²`, p-value, `n`, slope. Suggested defaults: AQI vs temperature, AQI vs RH, AQI vs cloud coverage, ozone vs temperature, PM2.5 vs RH, PM2.5 vs precipitation.
   - **Group comparisons**: AQI by precipitation type, by cloud coverage label, by primary pollutant (box plots + ANOVA/Kruskal–Wallis p-value when n permits).
6. **Data-quality panel**: records count, % N/A per field, date range, manual vs automated record counts.
7. **Insufficient data rule:** if a statistic needs more observations than exist (suggest `n < 10` for correlations/tests, `n < 5` for distributions), show *"Not enough data yet (n = X, need Y)"* instead of a misleading result. Never show a p-value or r from fewer than 3 pairs.

### 7.5 City archive (`/city/[slug]/archive`)
Per the wireframe:
- Header + **Back** button (to city page), **Filter** dropdown, **Download** button.
- Default view: **grouped by day**, newest first; each row collapses to `Day — Primary pollutant — AQI` (use the day's max AQI/dominant pollutant) and **expands** to the hourly records for that day (time + all recorded fields).
- Toggle to a flat table view with sortable columns and pagination or virtual scrolling (50–100 rows/page).
- **Filter dropdown:**
  - **Date** → calendar with range selection
  - **Time** → time-of-day range
  - **Pollutant** → checkbox list (primary pollutant)
  - **Concentration** → min/max range (applies to the primary pollutant's concentration)
  - Filters are reflected in the URL query string (shareable), have a "Clear all" and an active-filter chip row, and a "{n} records match" count.
- Times displayed in the **city's local timezone** with a label.
- **Download = formatted PDF of all filtered results** (not just the visible page).

### 7.6 PDF export
- Generated server-side from the **same filter params** as the on-screen view.
- Contents: title (city, state), generated date, applied filters, record count, date range, data-source note, **summary statistics** (mean/median/min/max/SD for AQI and pollutants), optional AQI chart image, and a **full table** of records with repeating header row, zebra striping, page numbers ("Page X of Y"), and "N/A" for blanks. Landscape orientation for wide tables.
- Styled per `STYLES.md §PDF`. Filename: `aqi-archive_{slug}_{startdate}_{enddate}.pdf`.
- Safeguards: cap at 20,000 rows per export (show message beyond that suggesting narrower filters); show a loading state; handle errors with a retry message.
- Include source attribution footer (NWS, EPA AirNow, OpenAQ) and note that AirNow data are preliminary.

### 7.7 Saved cities (`/saved`)
- Persistence: **localStorage by default** (no login), key `savedCities` (array of slugs), synced across tabs via the `storage` event. Saved-state must be reflected instantly on every card and city page. *(Optional upgrade: Supabase anonymous/auth-based sync across devices.)*
- Empty state: explains how to save a city with a link back to Home.
- **Saved city list**: card grid (same city card, with Remove).
- **Per-city statistics**: for each saved city, the same stats as the city page, in a collapsible section per city (default: summary table + AQI distribution).
- **Comparisons between cities (primary focus)** — time-range selector and metric selector; support up to **10** cities at once:
  1. **Side-by-side stats table** (metrics × cities) with best/worst highlighting.
  2. **Overlaid time series** (one line per city; toggle cities via legend).
  3. **Grouped bar chart** of mean AQI (± SD error bars) per city; ranking list (cleanest → most polluted).
  4. **Side-by-side box plots / violin plots** per metric.
  5. **Distribution overlays** (histograms/KDE per city).
  6. **AQI category breakdown** per city (stacked 100 % bars).
  7. **Primary pollutant mix** per city.
  8. **Cross-city correlation matrix** of AQI over time (aligned on shared timestamps) and **scatter plot** of city A vs city B AQI with `r`.
  9. **Pairwise difference tests** (Welch's t-test / Mann–Whitney) for mean AQI, with effect size and plain-language verdict ("Columbia's AQI is on average 12 points higher than Oakland's").
  10. **Compare the same relationship across cities** (e.g., AQI-vs-temperature slope per city).
  11. **Weather comparison** (avg temp, RH, cloud cover, precip frequency).
- Comparisons use only **overlapping observation windows** by default (with a toggle for "all available data") and display `n` per city.

### 7.9 Cross-city insights (`/insights`)
- The main navigation links to this archive-wide statistics page.
- Users can choose a 24-hour, 7-day, 30-day, 90-day, or all-time window, automated readings or readings including manual entries, and (for the pooled view) a random sample size.
- AQI city rankings use one summary per city and require at least 10 valid AQI observations. Cities below that minimum remain visible in a separate insufficient-coverage list.
- The page also provides pooled numeric summaries, distributions, time patterns, metric relationships, and weather-group summaries. Statistical relationships describe association and do not establish cause.

### 7.8 States every page must handle
Loading (skeletons), empty, partial data ("N/A"), stale data, error with retry, 404 for unknown city slug, offline/slow network.

---

## 8. Performance & caching
- Home page: ISR / `revalidate` ≈ 5 min, reading from `latest_readings`.
- City stats: compute in SQL or server code, cache per `(city, range)` for ~15 min; invalidate after each ingest.
- Archive: server-side pagination; `(city_id, recorded_at)` index; never load the full table to the client.
- Charts render client-side but receive pre-aggregated data (downsample long ranges, e.g., daily means beyond 90 days, with min/max band).

## 9. Security
- Service-role key and API keys only in server/Edge environments.
- Ingestion endpoint requires `Authorization: Bearer $INGEST_SECRET`.
- Validate all query params (Zod); parameterized queries only; rate-limit PDF endpoint.
- RLS enforced; no anon writes.

## 10. Accessibility & responsiveness
- WCAG 2.2 AA; color is never the only AQI signal (always show category text).
- Fully keyboard navigable (search combobox, filters, expandable archive rows, chart alternatives).
- Charts have text summaries / data table fallback.
- Responsive: 1-column mobile, 2-column tablet, 3–4-column desktop for cards.

## 11. Attribution & disclaimers (footer)
- Weather: National Weather Service. AQI: U.S. EPA AirNow (data are preliminary). Concentrations: OpenAQ (if used).
- Note that readings come from the nearest monitoring location and may differ from conditions at a specific address.
- Not medical advice.

## 12. Testing / acceptance criteria
1. Seed script inserts exactly **69** manual rows (23 per city) with correct UTC timestamps, N/A fields as `NULL`, and no weather data.
2. Running the ingest function twice in the same hour creates **no duplicates**.
3. A city with a failed weather call still gets an AQI record (and vice versa).
4. Lamont resolves to a nearby station and shows the source note.
5. Home cards show AQI, primary pollutant, concentration, and last weather condition; "N/A" appears for missing values.
6. Saving a card updates the header badge instantly and persists after reload.
7. City page statistics match an independent calculation (spot-check mean/SD for Columbia AQI from the seed data).
8. Correlations/tests are suppressed when `n` is too small.
9. Archive filters (date, time, pollutant, concentration) combine correctly; the PDF contains **only** filtered rows.
10. Saved page compares ≥ 3 cities and handles cities with different data coverage.
11. Lighthouse accessibility ≥ 95; no horizontal scroll at 360 px.

## 13. Build order for the agent
1. Supabase schema, RLS, seed cities, seed manual readings.
2. Ingestion function + cron + `ingest_runs`; verify a full hourly cycle.
3. Header + Home + city card + save (localStorage).
4. City page + statistics module (unit-test the stats functions).
5. Archive + filters + PDF export.
6. Saved page + comparisons.
7. Polish: loading/empty/error states, accessibility, performance.

## 14. Assumptions & open questions to confirm with the user
1. **Manual timestamps' timezone** — assumed `America/New_York` for all three cities because the timestamps are identical across cities.
2. **Ozone/NO2 units** — stored as given (µg/m³); standard reporting is ppb, handled via conversion factors in §4.3.
3. **Duplicate-looking rows** — Columbia #11/#12 and Lamont #11/#12 are identical; seeded as provided.
4. **Saved cities** — localStorage (device-only) unless the user wants accounts.
5. **Home layout** — keeps the wireframe's Worst/Best sections and adds an All cities grid.
6. **Concentration source** — AirNow may not provide raw concentrations; OpenAQ or AirNow files will supplement (verify during build).
7. **Hosting plan** — Vercel Hobby is fine because scheduling happens in Supabase.
