-- Existing negative measurements are invalid; preserve their readings and other fields,
-- but mark the affected concentration as unavailable.
update public.readings
set
  pm25 = case when pm25 < 0 then null else pm25 end,
  pm10 = case when pm10 < 0 then null else pm10 end,
  ozone = case when ozone < 0 then null else ozone end,
  no2 = case when no2 < 0 then null else no2 end,
  so2 = case when so2 < 0 then null else so2 end,
  co = case when co < 0 then null else co end
where pm25 < 0 or pm10 < 0 or ozone < 0 or no2 < 0 or so2 < 0 or co < 0;

alter table public.readings
  add constraint readings_pm25_nonnegative check (pm25 is null or pm25 >= 0),
  add constraint readings_pm10_nonnegative check (pm10 is null or pm10 >= 0),
  add constraint readings_ozone_nonnegative check (ozone is null or ozone >= 0),
  add constraint readings_no2_nonnegative check (no2 is null or no2 >= 0),
  add constraint readings_so2_nonnegative check (so2 is null or so2 >= 0),
  add constraint readings_co_nonnegative check (co is null or co >= 0);
