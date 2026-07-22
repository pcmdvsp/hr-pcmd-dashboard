# AGENTS.md — Working Status Dashboard

This file defines project conventions for contributors and coding agents working in this repository.

## Project overview

Internal employee working-status and meeting-management dashboard for PCMD – Vietsovpetro JV.

- Frontend-only application; there is no custom Node.js backend.
- Supabase provides Auth, PostgreSQL, Row Level Security (RLS), and persistence.
- UI language is English.
- User-facing documentation may be Vietnamese when requested.

## Technology stack

- React 19
- Vite 7
- React Router
- Supabase JavaScript client v2
- PostgreSQL / Supabase RLS
- Lucide React icons
- Plain CSS files; no Tailwind or CSS-in-JS framework

## Local development

### Requirements

- Node.js `>=20 <27` as declared in `package.json`.
- Node 22 LTS is recommended for stable Windows development.
- Node 26 may work, but native `esbuild` can occasionally fail with `spawn EPERM` / `failed to load config` on Windows.

### Environment variables

Create `.env.local` from `.env.example`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Never put a Supabase `service_role` key in frontend environment files or client code.

### Commands

```powershell
npm ci
npm run dev
npm run build
npm run preview
```

Use `npm ci` when installing from scratch or repairing dependencies. Do not copy `node_modules` between machines.

If Vite cannot load `vite.config.js` despite a valid config, close Node/Vite terminals and reinstall:

```powershell
Remove-Item -Recurse -Force node_modules
npm ci
npm run dev
```

Always run `npm run build` after code changes unless the task is documentation-only.

## Source layout

- `src/main.jsx` — application entry point and page routing/state switching.
- `src/pages/` — top-level screens: Dashboard, My Status, Meeting Info, Monthly Statistics, Admin, Work Calendar.
- `src/components/` — reusable UI components and feature-specific dialogs.
- `src/hooks/` — Supabase-backed data hooks, especially `useDashboard` and monthly statistics hooks.
- `src/utils/` — date/status helpers, participant availability, Outlook `.ics` generation.
- `src/lib/supabaseClient.js` — Supabase client initialization.
- `src/styles.css`, `src/dashboard.css`, `src/monthly.css` — global styles; feature CSS may sit beside its component/page.

## UI conventions

- Keep UI labels and messages in English unless a request explicitly asks for another language.
- Use existing button classes: `primary-button`, `secondary-button`, and `text-button`.
- Use Lucide icons through `lucide-react`; do not introduce a second icon library.
- Prefer a modal/popup for consequential actions such as cancelling a meeting; avoid dropdown menus that can be clipped by tables.
- Use the existing notification, success, and room-reservation alert patterns rather than browser alerts when practical.
- Preserve responsive layout at 100% browser zoom.

## Supabase setup and migrations

Run SQL files in this order for a new project:

1. `supabase_schema.sql`
2. `supabase_monthly_statistics.sql`
3. `supabase_meeting_info.sql`
4. `supabase_status_notifications.sql`

Optional repair scripts:

- `supabase_fix_departments_rls.sql`
- `supabase_fix_password_change.sql`

When adding a database field/table/policy used by frontend code, append an idempotent migration to the relevant SQL file using `add column if not exists`, `create table if not exists`, and `drop policy if exists` where appropriate. Document any required SQL rerun in the final handoff.

Do not rely on frontend-only authorization. New data access must be protected by Supabase RLS policies.

## Data model conventions

### Profiles and departments

- `profiles.id` matches the Supabase Auth user UUID.
- `profiles.role` determines admin vs normal-user privileges.
- `profiles.department_id` is the source of department membership.
- Never create fake Auth users to represent a department. Use department selections and expand them into individual attendees.

### Daily status and calendar

- `daily_status` is the source of truth for status history and monthly statistics.
- A missing `daily_status` row on a `working_day` means `Working`.
- Do not delete historical rows simply because a new day/month begins.
- Monthly statistics are calculated from `daily_status` + `work_calendar`; do not create or store monthly aggregate tables.
- Only `work_calendar.day_type = 'working_day'` counts toward monthly workday statistics.
- Business trip can span weekends; it is visible in the daily dashboard/schedule but is not counted in monthly scheduled working days.
- Weekend Working/Meeting requires explicit overtime confirmation. Overtime is stored with `is_overtime = true`.

### Meetings

- Meetings are stored in `employee_meetings`.
- Meeting participants are stored individually in `employee_meeting_attendees`.
- One employee may have multiple meetings on the same day.
- The organizer is not inferred from a department; use `organizer_id`.
- Meeting participants with `business_trip`, `leave`, or `sick` on the meeting date are unavailable and must not be selectable. Recheck availability immediately before saving.
- `KNT meeting room` reservations must reject overlapping times.
- `online_link` is optional and is opened with the `Go online` link in Meeting Info.
- Cancelling a meeting removes its attendee rows and meeting row. Before deletion, create cancellation notifications in `employee_meeting_cancellations` for every attendee.

### Notifications and meeting views

- `employee_meeting_views` has two separate concepts:
  - `notification_meeting_updated_at`: notification was read from the bell.
  - `seen_meeting_updated_at`: meeting was opened in My Status.
- Reading a bell notification must not remove the `New` badge in My Status.
- Opening the relevant meeting day in My Status marks the schedule entry as read.
- Only assigned attendees receive meeting and cancellation notifications.
- Cancellation notifications persist in `employee_meeting_cancellations` until read.

## Security

- Use the Supabase anon key only in the browser.
- Keep RLS enabled on all application tables.
- Admin-only controls must be backed by policies, not merely hidden in the UI.
- Password reset/admin Auth management requiring privileged access belongs in Supabase Dashboard or a protected Edge Function, never in browser code using a service role key.

## Deployment

- GitHub Pages workflow: `.github/workflows/deploy.yml`.
- It uses Node 22, `npm ci`, and `npm run build`.
- Configure GitHub Actions secrets: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- If the GitHub repository name changes, update `base` in `vite.config.js`.

## Change checklist

Before handing off implementation work:

1. Preserve existing unrelated user changes.
2. Update SQL migrations if the Supabase schema changed.
3. Run `npm run build`.
4. State any Supabase SQL action the user must perform.
5. Keep README updated for material setup or architecture changes.
