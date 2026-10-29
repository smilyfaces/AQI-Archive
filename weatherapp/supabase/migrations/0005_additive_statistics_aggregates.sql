-- Additive analytics storage. This migration does not update or delete cities/readings.
-- New aggregates are maintained alongside the existing immutable reading history.
create table if not exists public.city_daily_metric_aggregates (
  city_id uuid not null references public.cities(id) on delete cascade,
  local_date date not null,
  source text not null check (source in ('automated', 'manual')),
  metric_key text not null,
  record_count bigint not null default 0 check (record_count >= 0),
  value_count bigint not null default 0 check (value_count >= 0),
  value_sum double precision not null default 0,
  value_sum_squares double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (city_id, local_date, source, metric_key),
  check (value_count <= record_count)
);

create index if not exists city_daily_metric_aggregates_date_idx
  on public.city_daily_metric_aggregates (local_date desc, metric_key, source);
create index if not exists city_daily_metric_aggregates_city_metric_idx
  on public.city_daily_metric_aggregates (city_id, metric_key, local_date desc);
comment on table public.city_daily_metric_aggregates is
  'Additive city-local daily sufficient statistics. Reading records remain the source of truth.';

alter table public.city_daily_metric_aggregates enable row level security;
drop policy if exists "statistics aggregates are readable by everyone" on public.city_daily_metric_aggregates;
create policy "statistics aggregates are readable by everyone"
  on public.city_daily_metric_aggregates for select to anon, authenticated
  using (exists (select 1 from public.cities c where c.id = city_id and c.is_active));
revoke insert, update, delete, truncate, references, trigger on public.city_daily_metric_aggregates from anon, authenticated;
grant select on public.city_daily_metric_aggregates to anon, authenticated;

create or replace function public.apply_city_daily_metric_aggregates(
  p_city_id uuid,
  p_recorded_at timestamptz,
  p_source text,
  p_payload jsonb,
  p_weight integer
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_local_date date;
  v_metric record;
  v_value double precision;
begin
  p_payload := p_payload || jsonb_build_object('cloud_coverage_eighths',
    case p_payload->>'cloud_coverage_label'
      when 'Clear' then 0 when 'Few' then 1 when 'Scattered' then 4 when 'Broken' then 6 when 'Overcast' then 8
      else case when p_payload->>'cloud_coverage_pct' is null then null else (p_payload->>'cloud_coverage_pct')::double precision / 12.5 end
    end);
  select (p_recorded_at at time zone c.timezone)::date into v_local_date
  from public.cities c where c.id = p_city_id;
  if v_local_date is null then return; end if;

  for v_metric in
    select key, value
    from jsonb_each(p_payload)
    where key = any(array[
      'aqi','pm25','pm10','ozone','no2','so2','co','temperature_c','dewpoint_c',
      'relative_humidity','cloud_coverage_pct','cloud_coverage_eighths',
      'precipitation_last_hour_mm','precipitation_3h_mm','precipitation_6h_mm',
      'wind_speed_ms','wind_direction_deg','wind_gust_ms','barometric_pressure_pa',
      'sea_level_pressure_pa','visibility_m','heat_index_c','wind_chill_c'
    ])
  loop
    v_value := case
      when v_metric.key = 'cloud_coverage_eighths' then
        case p_payload->>'cloud_coverage_label'
          when 'Clear' then 0 when 'Few' then 1 when 'Scattered' then 4 when 'Broken' then 6 when 'Overcast' then 8
          else nullif(p_payload->>'cloud_coverage_pct','')::double precision / 12.5
        end
      else nullif(v_metric.value #>> '{}','null')::double precision
    end;

    insert into public.city_daily_metric_aggregates as existing_row (
      city_id, local_date, source, metric_key, record_count, value_count, value_sum, value_sum_squares, updated_at
    ) values (
      p_city_id, v_local_date, p_source, v_metric.key, p_weight,
      case when v_value is null then 0 else p_weight end,
      case when v_value is null then 0 else p_weight * v_value end,
      case when v_value is null then 0 else p_weight * v_value * v_value end,
      now()
    ) on conflict (city_id, local_date, source, metric_key) do update set
      record_count = existing_row.record_count + excluded.record_count,
      value_count = existing_row.value_count + excluded.value_count,
      value_sum = existing_row.value_sum + excluded.value_sum,
      value_sum_squares = existing_row.value_sum_squares + excluded.value_sum_squares,
      updated_at = now();
  end loop;
end;
$$;

create or replace function public.maintain_city_daily_metric_aggregates()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.apply_city_daily_metric_aggregates(old.city_id, old.recorded_at, old.source, to_jsonb(old), -1);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.apply_city_daily_metric_aggregates(new.city_id, new.recorded_at, new.source,
      to_jsonb(new) || jsonb_build_object('cloud_coverage_eighths',
        case new.cloud_coverage_label
          when 'Clear' then 0 when 'Few' then 1 when 'Scattered' then 4 when 'Broken' then 6 when 'Overcast' then 8
          else case when new.cloud_coverage_pct is null then null else new.cloud_coverage_pct / 12.5 end
        end), 1);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.apply_city_daily_metric_aggregates(uuid, timestamptz, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.maintain_city_daily_metric_aggregates() from public, anon, authenticated;

-- Keep the initial snapshot consistent with concurrent hourly ingestion.
lock table public.readings in share row exclusive mode;
drop trigger if exists readings_statistics_aggregate_trigger on public.readings;
create trigger readings_statistics_aggregate_trigger
  after insert or update or delete on public.readings
  for each row execute function public.maintain_city_daily_metric_aggregates();

insert into public.city_daily_metric_aggregates (
  city_id, local_date, source, metric_key, record_count, value_count, value_sum, value_sum_squares
)
select r.city_id,
       (r.recorded_at at time zone c.timezone)::date,
       r.source,
       metric.metric_key,
       count(*)::bigint,
       count(metric.value)::bigint,
       coalesce(sum(metric.value), 0)::double precision,
       coalesce(sum(metric.value * metric.value), 0)::double precision
from public.readings r
join public.cities c on c.id = r.city_id
cross join lateral (values
  ('aqi', r.aqi::double precision), ('pm25', r.pm25::double precision), ('pm10', r.pm10::double precision),
  ('ozone', r.ozone::double precision), ('no2', r.no2::double precision), ('so2', r.so2::double precision),
  ('co', r.co::double precision), ('temperature_c', r.temperature_c::double precision),
  ('dewpoint_c', r.dewpoint_c::double precision), ('relative_humidity', r.relative_humidity::double precision),
  ('cloud_coverage_pct', r.cloud_coverage_pct::double precision),
  ('cloud_coverage_eighths', case r.cloud_coverage_label when 'Clear' then 0 when 'Few' then 1 when 'Scattered' then 4 when 'Broken' then 6 when 'Overcast' then 8 else r.cloud_coverage_pct::double precision / 12.5 end),
  ('precipitation_last_hour_mm', r.precipitation_last_hour_mm::double precision),
  ('precipitation_3h_mm', r.precipitation_3h_mm::double precision), ('precipitation_6h_mm', r.precipitation_6h_mm::double precision),
  ('wind_speed_ms', r.wind_speed_ms::double precision), ('wind_direction_deg', r.wind_direction_deg::double precision),
  ('wind_gust_ms', r.wind_gust_ms::double precision), ('barometric_pressure_pa', r.barometric_pressure_pa::double precision),
  ('sea_level_pressure_pa', r.sea_level_pressure_pa::double precision), ('visibility_m', r.visibility_m::double precision),
  ('heat_index_c', r.heat_index_c::double precision), ('wind_chill_c', r.wind_chill_c::double precision)
) as metric(metric_key, value)
group by r.city_id, (r.recorded_at at time zone c.timezone)::date, r.source, metric.metric_key;

create or replace function public.get_statistics_rollups(
  p_since date default null,
  p_sources text[] default null,
  p_city_ids uuid[] default null
) returns table (
  city_id uuid,
  source text,
  metric_key text,
  record_count bigint,
  value_count bigint,
  value_sum double precision,
  value_sum_squares double precision,
  first_local_date date,
  last_local_date date,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select a.city_id,
         a.source,
         a.metric_key,
         sum(a.record_count)::bigint,
         sum(a.value_count)::bigint,
         sum(a.value_sum)::double precision,
         sum(a.value_sum_squares)::double precision,
         min(a.local_date),
         max(a.local_date),
         max(a.updated_at)
  from public.city_daily_metric_aggregates a
  where (p_since is null or a.local_date >= p_since)
    and (p_sources is null or a.source = any(p_sources))
    and (p_city_ids is null or a.city_id = any(p_city_ids))
  group by a.city_id, a.source, a.metric_key;
$$;

revoke all on function public.get_statistics_rollups(date, text[], uuid[]) from public;
grant execute on function public.get_statistics_rollups(date, text[], uuid[]) to anon, authenticated;
