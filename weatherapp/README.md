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

Install the Supabase CLI, link this project, then run the SQL migrations and seed:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
npm run seed
```

The seed requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It upserts the 61 tracked cities and exactly 69 manual readings; repeating it is safe. Manual timestamps are interpreted in `America/New_York` as specified in `FUNCTIONALITY.md`.

### Ingestion schedule and deploy

In Supabase Dashboard → Database → Extensions, enable `pg_cron`, `pg_net`, and Vault (`supabase_vault`). Set Edge Function secrets:

```sh
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... AIRNOW_API_KEY=... OPENAQ_API_KEY=... NWS_USER_AGENT='AQITracker (you@example.com)' INGEST_SECRET=...
supabase functions deploy ingest
```

`SUPABASE_URL` is provided to hosted Supabase functions. The cron migration calls the deployed function at minute 35 of each hour. Before applying `0002_hourly_cron.sql`, create Vault secrets named `project_url` (your project URL) and `ingest_secret` (the same value configured for the function). Apply it with `supabase db push` after the function is deployed. Monitor run records in `ingest_runs` and cron history in the Dashboard.

To trigger ingestion manually:

```sh
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/ingest' -H 'Authorization: Bearer YOUR_INGEST_SECRET' -H 'Content-Type: application/json' -d '{}'
```

The function stores the previous completed UTC hour, retries transient source failures, and upserts by `(city_id, recorded_at)`. It records partial success when only NWS or AQI data are available. Current NWS nearby stations are resolved dynamically through `/points`; readings keep the actual station identifier. AirNow hourly monitoring-site observations are used for AQI and concentrations, with OpenAQ v3 as a concentration fallback. Missing values remain SQL `NULL`.

### Development and verification

```sh
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

### Data source and interpretation notes

NWS keeps recent observations for seven days, and AirNow identifies its web-service data as preliminary. The manual seed is historical user-provided data and is never weather-backfilled. Automated records use hourly station data; coverage depends on the nearby sources. A missing API value is `NULL` and displays as `N/A`.
