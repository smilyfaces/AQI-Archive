# US City AQI & Weather Tracker

The app tracks air quality and weather across 60 US cities. It combines hourly station observations with 69 manually recorded historical readings. Users can browse current conditions, filter archives, export PDFs, and compare cities. Saved cities are stored in the browser under `savedCities` and require no account.

## Run locally

The Next.js app, npm lockfile, and Supabase configuration live in `weatherapp/`. Run commands from that directory using Node.js 20 or later.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. For live data, use `.env.example` as a template for `weatherapp/.env.local` and follow the setup in [README.md](README.md). The data layer can use the bundled catalog and manual readings when Supabase is unavailable. `npm run env:check` makes live requests to verify configured services. For code changes, the available checks are `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Browse tracked cities and see the best and worst current AQI. |
| `/city/[slug]` | See current conditions and city statistics. |
| `/city/[slug]/archive` | Browse historical readings with shareable date, local-time, and pollutant filters. |
| `/api/city/[slug]/archive.pdf` | Export matching archive rows, up to 20,000 per export. |
| `/saved` | Manage saved cities and compare them over a shared time range. |
| `/insights` | Explore cross-city rankings and historical statistics. |

## Code map

- `app/` holds Next.js App Router pages and API handlers. `components/` holds the dashboards, shared header, saved-city state, and statistics UI.
- `lib/data.ts` handles Supabase reads and local fallback data. `lib/catalog.ts` holds the city catalog, and `lib/manual-data.ts` holds the historical seed readings. `scripts/seed.ts` upserts both datasets.
- `lib/statistics.ts` computes analysis metrics. `lib/statistics-aggregates.ts` combines daily rollups, and `app/api/statistics/route.ts` serves aggregate statistics. `components/CityInsights.tsx` renders analysis views.
- `supabase/migrations/` defines the Postgres schema, row-level security, scheduled ingestion, and statistics aggregates. `supabase/functions/ingest/index.ts` collects and stores hourly observations.
- `app/globals.css` defines the shared visual styles. The stack includes Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts, React PDF, and Vitest.

## Data and deployment

- Supabase cron calls the `ingest` Edge Function at minute 35 each hour. It records the previous completed UTC hour and upserts by `(city_id, recorded_at)`. The password-protected **Record now** action calls the same function through `/api/force-record`.
- NWS supplies weather observations. AirNow supplies AQI and pollutant readings, and OpenAQ provides fallback concentrations. Missing measurements remain `NULL` and display as `N/A`. The historical manual timestamps are interpreted in `America/New_York`, while archives display times in the city's local timezone.
- Vercel hosts the Next.js app with `weatherapp` as the root directory. Supabase hosts Postgres and runs ingestion independently. Keep service-role credentials, provider keys, `PASSWORD`, and `INGEST_SECRET` server-side and out of version control.

## Project references

- [README.md](README.md) covers environment setup, Supabase migrations, seeding, and deployment.
- [FUNCTIONALITY.md](FUNCTIONALITY.md) describes product behavior, data requirements, and acceptance criteria.
- [STYLES.md](STYLES.md) documents the design system and layouts.
- [STATISTICS.md](STATISTICS.md) specifies statistical methods and sample thresholds. Check the implementation when confirming which analyses are available.
- [AGENTS.md](AGENTS.md) contains repository guidance for coding agents.
