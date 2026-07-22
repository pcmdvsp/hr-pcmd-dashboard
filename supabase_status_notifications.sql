-- Run once in Supabase SQL Editor after supabase_schema.sql.
-- Stores one event whenever an employee updates to Business trip, Annual leave,
-- or Sick leave. Read state remains private to each recipient.

create table if not exists public.status_update_notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('business_trip', 'leave', 'sick')),
  start_date date not null,
  end_date date not null,
  content text,
  location text,
  created_at timestamptz not null default now()
);
-- Supports projects where the notification table was created before these
-- detail fields were introduced.
alter table public.status_update_notifications add column if not exists start_date date;
alter table public.status_update_notifications add column if not exists end_date date;
alter table public.status_update_notifications add column if not exists content text;
alter table public.status_update_notifications add column if not exists location text;
create index if not exists status_update_notifications_created_idx
  on public.status_update_notifications(created_at desc);

create table if not exists public.status_update_notification_reads (
  notification_id uuid not null references public.status_update_notifications(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, employee_id)
);
create index if not exists status_update_notification_reads_employee_idx
  on public.status_update_notification_reads(employee_id, read_at desc);

alter table public.status_update_notifications enable row level security;
alter table public.status_update_notification_reads enable row level security;

drop policy if exists "status update notifications readable" on public.status_update_notifications;
drop policy if exists "employees create own status notifications" on public.status_update_notifications;
create policy "status update notifications readable"
  on public.status_update_notifications for select to authenticated using (true);
create policy "employees create own status notifications"
  on public.status_update_notifications for insert to authenticated
  with check (employee_id = auth.uid() or public.is_admin());

drop policy if exists "users read own status notification reads" on public.status_update_notification_reads;
drop policy if exists "users manage own status notification reads" on public.status_update_notification_reads;
create policy "users read own status notification reads"
  on public.status_update_notification_reads for select to authenticated
  using (employee_id = auth.uid() or public.is_admin());
create policy "users manage own status notification reads"
  on public.status_update_notification_reads for all to authenticated
  using (employee_id = auth.uid() or public.is_admin())
  with check (employee_id = auth.uid() or public.is_admin());
