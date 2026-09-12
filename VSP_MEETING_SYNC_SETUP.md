# Automatic VSP meeting sync

The Admin **Test VSP meeting info** button remains available. Scheduled calls
use `sync-vsp-meetings` and must send the protected `x-cron-secret` header.

## Deploy

Apply the latest `supabase_meeting_info.sql`, then deploy:

```cmd
supabase functions deploy test-vsp-meeting-info --project-ref kqifgovkyjkzgzbvuecc
supabase functions deploy sync-vsp-meetings --project-ref kqifgovkyjkzgzbvuecc
```

The scheduler reuses `CRON_SECRET`, `VSP_EOFFICE_USERNAME`,
`VSP_EOFFICE_PASSWORD`, `VSP_EOFFICE_X_HD_TYPE`, and optional
`VSP_EOFFICE_DEVICE_JSON` from Edge Function Secrets.

Enable `pg_cron`, `pg_net`, and Vault. Store the same `CRON_SECRET` value in
Vault once:

```sql
select vault.create_secret(
  'PASTE_THE_SAME_CRON_SECRET_VALUE',
  'vsp_meeting_sync_cron_secret'
);
```

## Schedule

Run [VSP_MEETING_CRON_UPDATE.sql](VSP_MEETING_CRON_UPDATE.sql) in the Supabase
SQL Editor. It removes the previous meeting jobs and creates these jobs:

- Every day at 15:00 Vietnam time: scan tomorrow, two days ahead, and three days ahead.
- Every day at 08:00 Vietnam time: scan today.
- Every day at 11:45 Vietnam time: scan today again.

For example, a Thursday meeting is scanned on Monday (`in3days`), Tuesday
(`in2days`), Wednesday (`tomorrow`), then Thursday at 08:00 and 11:45 (`today`).

Existing eOffice `recID` records are not replaced, so attendees manually added
in the dashboard remain unchanged. A booking whose eOffice start and end dates
span multiple Vietnam calendar days is expanded into one dashboard meeting per
day. Every occurrence repeats the source start/end clock times and is identified
by `recID` plus its occurrence date, so later scans do not create duplicates.
Each authorized run writes both matched-booking and generated-occurrence counts
to `vsp_meeting_sync_logs`; credentials and secrets are never logged.
