# Automatic VSP leave sync

`sync-vsp-leave` supports authenticated Admin calls and scheduled calls protected
by `CRON_SECRET`. Store the same secret value in Vault once:

```sql
select vault.create_secret(
  'PASTE_THE_SAME_CRON_SECRET_VALUE',
  'vsp_leave_sync_cron_secret'
);
```

Supabase cron uses UTC. These jobs run at 10:00, 16:30, and 06:40 Vietnam time.
The first two scan only today; the last scans only yesterday.

Apply the latest `supabase_status_notifications.sql` before deploying the
Function. Scheduled runs write safe operational counts and error summaries to
`vsp_leave_sync_logs`; manual Admin Get/Test requests are not logged. Admins can
view the latest 20 runs in **VSP LEAVE SYNC HISTORY**.

```sql
select cron.unschedule(jobid)
from cron.job
where jobname in ('vsp-leave-today-at-10-vn', 'vsp-leave-today-at-1630-vn', 'vsp-leave-yesterday-at-0640-vn');

select cron.schedule('vsp-leave-today-at-10-vn', '0 3 * * *', $$
  select net.http_post(
    url := 'https://kqifgovkyjkzgzbvuecc.supabase.co/functions/v1/sync-vsp-leave',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='vsp_leave_sync_cron_secret')),
    body := '{"mode":"today"}'::jsonb
  );
$$);

select cron.schedule('vsp-leave-today-at-1630-vn', '30 9 * * *', $$
  select net.http_post(
    url := 'https://kqifgovkyjkzgzbvuecc.supabase.co/functions/v1/sync-vsp-leave',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='vsp_leave_sync_cron_secret')),
    body := '{"mode":"today"}'::jsonb
  );
$$);

select cron.schedule('vsp-leave-yesterday-at-0640-vn', '40 23 * * *', $$
  select net.http_post(
    url := 'https://kqifgovkyjkzgzbvuecc.supabase.co/functions/v1/sync-vsp-leave',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='vsp_leave_sync_cron_secret')),
    body := '{"mode":"yesterday"}'::jsonb
  );
$$);
```

Deploy after changing `verify_jwt`:

```cmd
supabase functions deploy sync-vsp-leave --project-ref kqifgovkyjkzgzbvuecc --no-verify-jwt
```

The sync only creates a notification when at least one `daily_status` day was
created or changed, so repeated scans do not create duplicate notifications.
