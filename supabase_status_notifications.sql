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
alter table public.status_update_notifications add column if not exists participant_ids uuid[];
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

-- A normal user may register one Business trip for themselves and selected active
-- colleagues without granting broad write access to daily_status through RLS.
create or replace function public.create_group_business_trip(
  p_employee_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_content text,
  p_location text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'Invalid business trip date range'; end if;
  if coalesce(trim(p_content), '') = '' or coalesce(trim(p_location), '') = '' then raise exception 'Content and location are required'; end if;

  select array_agg(id order by ordinality)
    into target_ids
  from (
    select id, min(ordinality) as ordinality
    from (
      select auth.uid() as id, 0 as ordinality
      union all
      select participant_id as id, ordinality
      from unnest(coalesce(p_employee_ids, '{}')::uuid[]) with ordinality as participants(participant_id, ordinality)
      where participant_id is not null
        and participant_id <> auth.uid()
    ) supplied_ids
    group by id
  ) normalized;

  if exists (select 1 from unnest(target_ids) as target_id where not exists (select 1 from profiles where id = target_id and active = true)) then
    raise exception 'One or more selected employees are inactive';
  end if;

  insert into daily_status (employee_id, date, status, is_overtime, note, content, location, start_time, end_time)
  select target_id, day::date, 'business_trip', false, null, trim(p_content), trim(p_location), null, null
  from unnest(target_ids) as target_id
  cross join generate_series(p_start_date, p_end_date, interval '1 day') as day
  on conflict (employee_id, date) do update set
    status = excluded.status, is_overtime = false, note = null, content = excluded.content,
    location = excluded.location, start_time = null, end_time = null;

  insert into status_update_notifications (employee_id, participant_ids, status, start_date, end_date, content, location)
  values (auth.uid(), target_ids, 'business_trip', p_start_date, p_end_date, trim(p_content), trim(p_location));
end;
$$;

grant execute on function public.create_group_business_trip(uuid[], date, date, text, text) to authenticated;
