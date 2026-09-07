-- Supabase pg_cron expressions use UTC.
-- 15:00 VN = 08:00 UTC; 08:00 VN = 01:00 UTC; 11:45 VN = 04:45 UTC.
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'vsp-meetings-tomorrow-at-18-vn',
  'vsp-meetings-today-at-11-vn',
  'vsp-meetings-tomorrow-at-15-vn',
  'vsp-meetings-in2days-at-15-vn',
  'vsp-meetings-in3days-at-15-vn',
  'vsp-meetings-today-at-08-vn',
  'vsp-meetings-today-at-1145-vn'
);

select cron.schedule('vsp-meetings-tomorrow-at-15-vn', '0 8 * * *', $$
  select net.http_post(
    url := 'https://kqifgovkyjkzgzbvuecc.supabase.co/functions/v1/sync-vsp-meetings',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='vsp_meeting_sync_cron_secret')),
    body := '{"mode":"tomorrow"}'::jsonb
  );
$$);

select cron.schedule('vsp-meetings-in2days-at-15-vn', '0 8 * * *', $$
  select net.http_post(
    url := 'https://kqifgovkyjkzgzbvuecc.supabase.co/functions/v1/sync-vsp-meetings',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='vsp_meeting_sync_cron_secret')),
    body := '{"mode":"in2days"}'::jsonb
  );
$$);

select cron.schedule('vsp-meetings-in3days-at-15-vn', '0 8 * * *', $$
  select net.http_post(
    url := 'https://kqifgovkyjkzgzbvuecc.supabase.co/functions/v1/sync-vsp-meetings',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='vsp_meeting_sync_cron_secret')),
    body := '{"mode":"in3days"}'::jsonb
  );
$$);

select cron.schedule('vsp-meetings-today-at-08-vn', '0 1 * * *', $$
  select net.http_post(
    url := 'https://kqifgovkyjkzgzbvuecc.supabase.co/functions/v1/sync-vsp-meetings',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='vsp_meeting_sync_cron_secret')),
    body := '{"mode":"today"}'::jsonb
  );
$$);

select cron.schedule('vsp-meetings-today-at-1145-vn', '45 4 * * *', $$
  select net.http_post(
    url := 'https://kqifgovkyjkzgzbvuecc.supabase.co/functions/v1/sync-vsp-meetings',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='vsp_meeting_sync_cron_secret')),
    body := '{"mode":"today"}'::jsonb
  );
$$);
