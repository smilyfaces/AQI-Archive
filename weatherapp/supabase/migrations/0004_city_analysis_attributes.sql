alter table public.cities
  add column if not exists region text,
  add column if not exists climate_type text,
  add column if not exists population integer,
  add column if not exists size_band text;

update public.cities
set region = case
  when state in ('AK','HI') then 'Non-contiguous'
  when state in ('CT','ME','MA','NH','RI','VT','NJ','NY','PA') then 'Northeast'
  when state in ('DE','MD','DC','VA','WV','KY','NC','SC','GA','FL','AL','MS','TN','AR','LA') then 'Southeast'
  when state in ('IL','IN','MI','OH','WI','IA','KS','MN','MO','NE','ND','SD') then 'Midwest'
  when state in ('AZ','NM','OK','TX') then 'Southwest'
  when state in ('CA','OR','WA') then 'Pacific'
  when state in ('CO','ID','MT','NV','UT','WY') then 'West'
  else region
end
where region is null;
