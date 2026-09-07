# Partner leave API

`partner-leave-api` is a read-only Supabase Edge Function for approved
server-to-server integrations. It returns active employees' `leave` rows only.
It does not expose notes, email addresses, Supabase user IDs, or write methods.

## Configure and deploy

Generate a 256-bit token in PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLower()
```

Store the resulting value in Supabase Edge Function Secrets as
`PARTNER_LEAVE_API_TOKEN`, without adding quote characters in the Dashboard.
Alternatively, from Windows CMD:

```cmd
supabase secrets set PARTNER_LEAVE_API_TOKEN="PASTE_TOKEN_HERE" --project-ref kqifgovkyjkzgzbvuecc
supabase functions deploy partner-leave-api --project-ref kqifgovkyjkzgzbvuecc
```

No Table Editor or SQL migration is required. Supabase supplies `SUPABASE_URL`
and the server credential to the deployed function. Never send that server
credential to a partner.

## Request

Both dates are required. Each request may cover at most 31 calendar days.

```cmd
curl.exe -i "https://kqifgovkyjkzgzbvuecc.supabase.co/functions/v1/partner-leave-api?fromDate=2026-08-01&toDate=2026-08-31" -H "Authorization: Bearer PARTNER_TOKEN" -H "Accept: application/json"
```

The token must be stored and used by the partner's backend. Do not put it in a
browser application, URL, log, or source repository.

Successful responses contain `employeeCode`, `fullName`, `department`, `date`,
`startTime`, `endTime`, and `updatedAt`. Missing/invalid tokens return HTTP 401;
invalid date ranges return HTTP 400.

## Acceptance checks

- A request without a token returns HTTP 401.
- A request with the wrong token returns HTTP 401.
- A valid request for 1–31 days returns HTTP 200.
- A range longer than 31 days returns HTTP 400.
- Results contain only active employees with `daily_status.status = 'leave'`.
- POST, PUT, PATCH, and DELETE return HTTP 405.
