This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## AQI tracker setup

The tracker uses Next.js for the site and Supabase for Postgres, RLS, the hourly job, and the ingestion Edge Function. Keep the starter notes above alongside the project setup below.

### Environment variables

Copy `.env.example` to `.env.local` in this directory and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Dashboard → Project Settings → API.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Project Settings → API → service role/secret key. Use only in local server scripts and Supabase Edge Function secrets. Never prefix it with `NEXT_PUBLIC_`.
- `AIRNOW_API_KEY`: request an API account/key at [AirNow API](https://docs.airnowapi.org/account/request/).
- `OPENAQ_API_KEY`: sign in at [OpenAQ Explorer](https://explore.openaq.org/), then find the key under account settings.
- `NWS_USER_AGENT`: identify the app and include a working contact address, for example `AQITracker (you@example.com)`.
- `INGEST_SECRET`: generate a long random secret shared between the Edge Function and the Supabase Vault cron call.

Do not commit `.env.local` or put server-only keys in client code.

### Database and seed

Run these commands from the `weatherapp` directory. The Supabase CLI is project-local, so install it once and invoke it with `npx` (Node.js 20 or later is required):

```sh
npm install --save-dev supabase
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npm run seed
```

The seed requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It upserts the 61 tracked cities and exactly 69 manual readings; repeating it is safe. Manual timestamps are interpreted in `America/New_York` as specified in `FUNCTIONALITY.md`.

### Ingestion schedule and deploy

In Supabase Dashboard → Database → Extensions, enable `pg_cron`, `pg_net`, and Vault (`supabase_vault`). Set the Edge Function's custom secrets (Supabase reserves the `SUPABASE_` prefix and injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into hosted functions):

```sh
npx supabase secrets set AIRNOW_API_KEY=... OPENAQ_API_KEY=... NWS_USER_AGENT='AQITracker (you@example.com)' INGEST_SECRET=...
npx supabase functions deploy ingest
```

Before applying `0002_hourly_cron.sql`, add two secrets in Supabase Dashboard → **Vault** (or via `vault.create_secret`): `project_url` with `https://YOUR_PROJECT_REF.supabase.co`, and `ingest_secret` with the exact same value you set for the Edge Function. Apply migrations with `npx supabase db push`, then run `npm run seed`. The cron migration calls the deployed function at minute 35 of each hour. Monitor run records in `ingest_runs` and cron history in the Dashboard. The `SUPABASE_SERVICE_ROLE_KEY` is only needed by the local seed script; keep it in `weatherapp/.env.local` and never set it in Vercel.

To trigger ingestion manually:

```sh
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/ingest' -H 'Authorization: Bearer YOUR_INGEST_SECRET' -H 'Content-Type: application/json' -d '{}'
```

The function stores the previous completed UTC hour, retries transient source failures, and upserts by `(city_id, recorded_at)`. It records partial success when only NWS or AQI data are available. Current NWS nearby stations are resolved dynamically through `/points`; readings keep the actual station identifier. AirNow hourly monitoring-site observations are used for AQI and concentrations, with OpenAQ v3 as a concentration fallback. Missing values remain SQL `NULL`.

### Development and verification

```sh
npm install
npm run dev
npm run env:check
npm run lint
npm run typecheck
npm test
npm run build
```

### Deploy the website to Vercel

Push the project branch to GitHub and import the repository in Vercel. Set the Vercel **Root Directory** to `weatherapp` because the Next.js app is nested in the repository. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Vercel Production and Preview environments, then deploy. These are the only Supabase environment values the website needs; service-role and data-provider keys stay in local seed/Edge Function environments. Supabase runs the ingestion function and hourly cron independently of Vercel.

### Data source and interpretation notes

NWS keeps recent observations for seven days, and AirNow identifies its web-service data as preliminary. The manual seed is historical user-provided data and is never weather-backfilled. Automated records use hourly station data; coverage depends on the nearby sources. A missing API value is `NULL` and displays as `N/A`.

### Routes

- `/` shows worst, best, and all tracked cities. Saved state is shared across tabs through the `savedCities` local-storage key.
- `/city/[slug]` shows current conditions, archive access, and statistics. Correlations and significance tests are suppressed for small samples.
- `/city/[slug]/archive` supports date, local-time, primary-pollutant, and primary-concentration filters. Filters are shareable in the URL; the PDF endpoint exports matching rows across pages and caps exports at 20,000 rows.
- `/saved` lets you remove or compare saved cities side by side. Saved cities are device-local and do not require an account.

The initial archive view groups rows under their local calendar day. Saved comparisons support a shared time range, a selectable numeric metric, sample sizes, means, medians, standard deviations, overlaid readings, and rankings. Each saved city can also expand into its own analysis.
