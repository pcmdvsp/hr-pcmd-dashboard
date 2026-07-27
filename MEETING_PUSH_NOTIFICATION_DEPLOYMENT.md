# Meeting browser push notifications — deployment guide (Windows CMD)

This guide activates browser/Windows notifications for meeting attendees when a meeting is created, updated, cancelled, or starts in about 15 minutes.

## What the implementation sends

| Event | Recipient | Sender |
| --- | --- | --- |
| Meeting created | Assigned attendees with an enabled browser subscription | `meeting-push-notification` |
| Meeting updated | Current assigned attendees with an enabled browser subscription | `meeting-push-notification` |
| Meeting cancelled | Attendees before the meeting is deleted | `meeting-push-notification` |
| Starts in 15 minutes | Assigned attendees with an enabled browser subscription | `send-meeting-reminders` via Supabase Cron |

An attendee must open the dashboard, click the bell icon, and select **Enable browser notifications** once on each browser/device that should receive pushes.

## 1. Prerequisites

- GitHub Pages has deployed the latest frontend.
- The site is opened over HTTPS. GitHub Pages is HTTPS by default.
- Node.js and Supabase CLI are installed.
- You are in the project directory in **Command Prompt (CMD)**.

```cmd
cd /d "D:\Data\Python\Company Website"
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Find `YOUR_PROJECT_REF` in Supabase Dashboard → **Settings → General → Reference ID**.

## 2. Run the SQL migrations

Open Supabase Dashboard → **SQL Editor**, then run these two updated files in this order:

1. `supabase_status_notifications.sql` — creates `push_subscriptions` and its RLS policies.
2. `supabase_meeting_info.sql` — creates `meeting_push_deliveries` to prevent duplicate 15-minute reminders and `meeting_reminder_preferences` for Snooze/Stop actions.

Do not skip either file. Both are written to be safe to rerun for the relevant additions.

## 3. Create VAPID keys

VAPID identifies this application to Chrome/Edge push services. Generate the pair once:

```cmd
npx web-push generate-vapid-keys
```

Copy the values labelled **Public Key** and **Private Key**. Keep the private key secret permanently. Do not paste it into GitHub, `.env.local`, frontend code, or screenshots.

Add only the public key to local `.env.local`:

```env
VITE_VAPID_PUBLIC_KEY=PASTE_VAPID_PUBLIC_KEY
```

In GitHub repository → **Settings → Secrets and variables → Actions**, create/update:

```text
VITE_VAPID_PUBLIC_KEY
```

Set it to the same public key, then redeploy GitHub Pages.

## 4. Create a long random cron secret in CMD

Run this command in CMD. It uses Node.js crypto and prints a 43-character URL-safe random secret:

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copy the output and store it in a password manager. In the examples below call it `YOUR_CRON_SECRET`.

## 5. Set Supabase Edge Function secrets

Run each command in CMD, replacing placeholders:

```cmd
supabase secrets set VAPID_PUBLIC_KEY="PASTE_VAPID_PUBLIC_KEY"
supabase secrets set VAPID_PRIVATE_KEY="PASTE_VAPID_PRIVATE_KEY"
supabase secrets set VAPID_SUBJECT="mailto:admin@vietsov.com.vn"
supabase secrets set CRON_SECRET="YOUR_CRON_SECRET"
```

`VAPID_SUBJECT` must be a real contact URI, normally `mailto:` followed by an admin mailbox.

## 6. Deploy Edge Functions

```cmd
supabase functions deploy send-push-notification
supabase functions deploy meeting-push-notification
supabase functions deploy send-meeting-reminders
supabase functions deploy meeting-reminder-action
```

Check deployment logs in Supabase Dashboard → **Edge Functions → Logs**.

## 7. `verify_jwt` — required configuration

Do **not** set all functions to the same value.

The project already declares the correct split in `supabase/config.toml`:

```toml
[functions.send-push-notification]
verify_jwt = true

[functions.meeting-push-notification]
verify_jwt = true

[functions.send-meeting-reminders]
verify_jwt = false

[functions.meeting-reminder-action]
verify_jwt = false
```

- Keep `verify_jwt = true` for `send-push-notification` and `meeting-push-notification`. They are invoked from a signed-in browser and must receive a valid user JWT. The code also verifies the caller's role/meeting ownership.
- Keep `verify_jwt = false` for `send-meeting-reminders`. Supabase Cron is not a signed-in user and cannot provide a user JWT. This function is protected by the private `x-cron-secret` header, checked before any database work.
- Keep `verify_jwt = false` for `meeting-reminder-action`. It receives an opaque, per-recipient action token from the browser Service Worker; this token can only snooze or stop that recipient's reminder and does not expose a session or service key.

Do not deploy either user-invoked function with `--no-verify-jwt`.

## 8. Enable `pg_cron`, `pg_net`, and Vault

In Supabase Dashboard:

1. Open **Database → Extensions**.
2. Search for and enable `pg_cron`.
3. Search for and enable `pg_net`.
4. Search for and enable `supabase_vault` if it is not already enabled. On many Supabase projects Vault is already available.

You can confirm from SQL Editor:

```sql
select extname
from pg_extension
where extname in ('pg_cron', 'pg_net', 'supabase_vault');
```

The result should list all three extensions. If an extension cannot be enabled, contact the project owner or Supabase support for the project plan/permissions.

## 9. Store cron values in Vault and create the schedule

In SQL Editor, replace the project reference and cron secret, then run:

```sql
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'meeting_reminder_project_url'
);

select vault.create_secret(
  'YOUR_CRON_SECRET',
  'meeting_reminder_cron_secret'
);

select cron.schedule(
  'send-meeting-reminders-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'meeting_reminder_project_url') || '/functions/v1/send-meeting-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meeting_reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

The function checks meetings starting in the next 10–15 minutes in `Asia/Ho_Chi_Minh`. The five-minute interval gives the scheduler a practical delivery window without repeated reminders.

If you rerun the schedule command, first remove the old job:

```sql
select cron.unschedule('send-meeting-reminders-every-5-minutes');
```

## 10. Test checklist

1. Deploy the frontend to GitHub Pages.
2. Sign in as an admin and use **Admin → Enable notifications → Send test notification**.
3. Sign in as a normal user in Chrome/Edge, open the bell, click **Enable browser notifications**, and allow the prompt.
4. Create a meeting and assign that normal user. The user should receive **New meeting assigned**.
5. Edit the meeting. The attendee should receive **Meeting updated**.
6. Cancel it. The attendee should receive **Meeting cancelled**.
7. Create a test meeting 12–14 minutes in the future, wait for the cron cycle, and check for **Meeting starts in 15 minutes**.

If no notification appears, check Windows Settings → **System → Notifications** for Chrome/Edge, then inspect Supabase Edge Function logs. A user who has not enabled browser notifications, blocked the permission prompt, or changed browser/device will not have a valid subscription.
