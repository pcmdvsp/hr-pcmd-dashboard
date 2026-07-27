# Browser Push Notification setup

This pilot adds a **Send test notification** button on the Admin page. The test is delivered only to the currently signed-in admin's registered browser/device.

## 1. Apply the database migration

In Supabase Dashboard, open **SQL Editor** and run the updated file:

```text
supabase_status_notifications.sql
```

It creates `push_subscriptions` with RLS. Browser users can create and manage only their own subscription. The Edge Function reads subscriptions with the service role.

## 2. Generate VAPID keys on Windows CMD

Open **Command Prompt (CMD)** in the project folder and run:

```cmd
npx web-push generate-vapid-keys
```

Keep the output private. It contains:

- `Public Key`
- `Private Key`

Use the public key in the frontend. Never commit or publish the private key.

## 3. Configure local frontend

Add the public key to `.env.local`:

```env
VITE_VAPID_PUBLIC_KEY=PASTE_THE_VAPID_PUBLIC_KEY
```

Restart `npm run dev` after changing `.env.local`.

## 4. Configure GitHub Pages build

In GitHub repository **Settings → Secrets and variables → Actions**, create this repository secret:

```text
VITE_VAPID_PUBLIC_KEY
```

Set its value to the VAPID public key. The deployment workflow already passes this secret to `npm run build`.

## 5. Set Edge Function secrets

Log in and link the Supabase CLI, then set these secrets. Replace all placeholders.

```cmd
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set VAPID_PUBLIC_KEY="PASTE_THE_VAPID_PUBLIC_KEY"
supabase secrets set VAPID_PRIVATE_KEY="PASTE_THE_VAPID_PRIVATE_KEY"
supabase secrets set VAPID_SUBJECT="mailto:your-admin-email@vietsov.com.vn"
```

`VAPID_SUBJECT` must be a valid `mailto:` address or HTTPS contact URL.

## 6. Deploy the Edge Function

```cmd
supabase functions deploy send-push-notification
supabase functions deploy meeting-push-notification
supabase functions deploy send-meeting-reminders
```

The repository config sets `verify_jwt = true`. Do not disable JWT verification; the function also checks that the caller is an active admin.

## 7. Test on Windows Chrome or Edge

1. Deploy GitHub Pages and open the HTTPS dashboard in Chrome or Edge.
2. Sign in as an admin.
3. Open **Admin**.
4. Click **Enable notifications** and choose **Allow** in the browser permission prompt.
5. Click **Send test notification**.
6. A native Windows notification should appear: `PCMD test notification`.

If Windows notifications are disabled, enable notifications for Chrome/Edge in **Windows Settings → System → Notifications**. Browser push does not work from an insecure HTTP site, except `localhost` during local testing.

## Current pilot scope

- Test notifications are sent only to the current admin's device.
- Assigned attendees receive a browser push when a meeting is created, updated, or cancelled.
- Existing in-app notifications remain unchanged.

## 8. Enable the 15-minute meeting reminder

Create a strong random secret and save it in Supabase Edge Function secrets:

```cmd
supabase secrets set CRON_SECRET="PASTE_A_LONG_RANDOM_SECRET"
```

In Supabase SQL Editor, enable `pg_cron`, `pg_net`, and Vault if they are not enabled, then store the same secret in Vault and schedule the function every five minutes. Replace the two placeholders.

```sql
select vault.create_secret('PASTE_A_LONG_RANDOM_SECRET', 'meeting_reminder_cron_secret');

select cron.schedule(
  'send-meeting-reminders-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-meeting-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meeting_reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

The reminder function checks meetings in the next 10–15 minutes (Asia/Ho_Chi_Minh), sends a push to assigned attendees with registered devices, and records a delivery row so a person is not reminded twice.
