create extension if not exists pgcrypto;

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  state text not null,
  lat double precision not null,
  lon double precision not null,
  timezone text not null,
  nws_station_id text,
  airnow_area text,
  openaq_location_ids integer[] not null default '{}',
  data_source_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.readings (
  id bigserial primary key,
  city_id uuid not null references public.cities(id) on delete cascade,
  recorded_at timestamptz not null,
  source text not null check (source in ('automated', 'manual')),
  aqi integer check (aqi between 0 and 500),
  aqi_category text,
  primary_pollutant text,
  pm25 numeric,
  pm10 numeric,
  ozone numeric,
  no2 numeric,
  so2 numeric,
  co numeric,
  aqi_pm25 integer,
  aqi_pm10 integer,
  aqi_ozone integer,
  aqi_no2 integer,
  aqi_so2 integer,
  aqi_co integer,
  temperature_c numeric,
  dewpoint_c numeric,
  relative_humidity numeric,
  cloud_coverage_pct numeric,
  cloud_coverage_label text,
  cloud_layers jsonb,
  precipitation_last_hour_mm numeric,
  precipitation_3h_mm numeric,
  precipitation_6h_mm numeric,
  precipitation_type text,
  text_description text,
  wind_speed_ms numeric,
  wind_direction_deg numeric,
  wind_gust_ms numeric,
  barometric_pressure_pa numeric,
  sea_level_pressure_pa numeric,
  visibility_m numeric,
  heat_index_c numeric,
  wind_chill_c numeric,
  present_weather jsonb,
  raw_metar text,
  weather_station_id text,
  weather_observed_at timestamptz,
  aqi_source_site text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (city_id, recorded_at),
  check (aqi is not null or pm25 is not null or pm10 is not null or ozone is not null or no2 is not null or so2 is not null or co is not null or temperature_c is not null or text_description is not null)
);

create index if not exists readings_city_recorded_idx on public.readings (city_id, recorded_at desc);
create index if not exists readings_recorded_idx on public.readings (recorded_at desc);

create table if not exists public.ingest_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cities_ok integer not null default 0,
  cities_partial integer not null default 0,
  cities_failed integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

alter table public.cities enable row level security;
alter table public.readings enable row level security;
alter table public.ingest_runs enable row level security;

drop policy if exists "cities are readable by everyone" on public.cities;
create policy "cities are readable by everyone" on public.cities for select to anon, authenticated using (true);
drop policy if exists "readings are readable by everyone" on public.readings;
create policy "readings are readable by everyone" on public.readings for select to anon, authenticated using (true);

revoke insert, update, delete, truncate, references, trigger on public.cities from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.readings from anon, authenticated;
revoke all on public.ingest_runs from anon, authenticated;
grant select on public.cities, public.readings to anon, authenticated;

create or replace view public.latest_readings with (security_invoker = true) as
select distinct on (r.city_id)
  r.*, c.slug, c.name as city_name, c.state, c.timezone, c.data_source_note
from public.readings r
join public.cities c on c.id = r.city_id
where c.is_active
order by r.city_id, r.recorded_at desc;

grant select on public.latest_readings to anon, authenticated;

