-- Enable pg_cron and pg_net in the Supabase Dashboard before applying this migration.
-- Store project URL and INGEST_SECRET in Supabase Vault as project_url and ingest_secret.
-- The function verifies INGEST_SECRET from the Authorization header.
select cron.schedule(
  'hourly-aqi-ingest',
  '35 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_secret')
      ),
      body := jsonb_build_object('triggered_at', now())
    );
  $$
);
