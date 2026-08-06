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
alter table public.status_update_notifications add column if not exists action text not null default 'updated';
alter table public.status_update_notifications drop constraint if exists status_update_notifications_action_check;
alter table public.status_update_notifications add constraint status_update_notifications_action_check
  check (action in ('updated', 'removed'));
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

-- Hybrid refresh: publish only the application tables that the frontend
-- subscribes to. Existing RLS select policies continue to govern delivery.
do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'daily_status',
    'employee_meetings',
    'employee_meeting_attendees',
    'employee_meeting_cancellations',
    'status_update_notifications'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        realtime_table
      );
    end if;
  end loop;
end $$;

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

  -- Never replace an existing unavailable status for a colleague. The person
  -- creating the trip may update their own trip, but selected colleagues must
  -- be available on every requested date.
  if exists (
    select 1
    from daily_status existing_status
    where existing_status.employee_id = any(target_ids)
      and existing_status.employee_id <> auth.uid()
      and existing_status.date between p_start_date and p_end_date
      and existing_status.status in ('business_trip', 'leave', 'sick')
  ) then
    raise exception 'One or more selected employees are unavailable during the selected date range';
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

-- Edit one continuous status block from the monthly timeline. Normal users can
-- change only their own records from today onward; admins retain history access.
-- Deleting the explicit rows makes each date fall back to work_calendar
-- automatically (Working on weekdays, weekend/holiday otherwise).
create or replace function public.edit_timeline_status(
  p_employee_id uuid,
  p_status text,
  p_original_start_date date,
  p_original_end_date date,
  p_apply_from_date date,
  p_to_date date,
  p_content text,
  p_location text,
  p_note text,
  p_revert_future boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_status not in ('business_trip', 'leave', 'sick') then raise exception 'This status cannot be edited here'; end if;
  if p_employee_id is null or p_original_start_date is null or p_original_end_date is null or p_apply_from_date is null then raise exception 'Missing status period'; end if;
  if p_original_end_date < p_original_start_date or p_apply_from_date < p_original_start_date then raise exception 'Invalid status period'; end if;
  if not public.is_admin() and p_employee_id <> auth.uid() then raise exception 'You can edit only your own status'; end if;
  if not public.is_admin() and p_apply_from_date < current_date then raise exception 'Normal users can edit from today onward only'; end if;
  if not coalesce(p_revert_future, false) and (p_to_date is null or p_to_date < p_apply_from_date) then raise exception 'To date must be on or after the first editable date'; end if;
  if not coalesce(p_revert_future, false) and p_status = 'business_trip' and (coalesce(trim(p_content), '') = '' or coalesce(trim(p_location), '') = '') then raise exception 'Content and location are required'; end if;
  if not coalesce(p_revert_future, false) and p_status in ('leave', 'sick') and coalesce(trim(p_note), '') = '' then raise exception 'Status detail is required'; end if;

  if coalesce(p_revert_future, false) then
    delete from public.daily_status
    where employee_id = p_employee_id
      and date between p_apply_from_date and p_original_end_date
      and status = p_status;
    insert into public.status_update_notifications (employee_id, status, start_date, end_date, content, location, action)
    values (p_employee_id, p_status, p_apply_from_date, p_original_end_date, null, null, 'removed');
    return;
  end if;

  -- Update only the part that is permitted to change. Historical rows remain
  -- untouched for normal users even when the original status began earlier.
  update public.daily_status
  set content = case when p_status = 'business_trip' then trim(p_content) else null end,
      location = case when p_status = 'business_trip' then trim(p_location) else null end,
      note = case when p_status = 'business_trip' then null else trim(p_note) end,
      is_overtime = false
  where employee_id = p_employee_id
    and date between p_apply_from_date and least(p_original_end_date, p_to_date)
    and status = p_status;

  -- An unavailable employee cannot remain an attendee of a meeting on the
  -- newly updated dates. Reverting does not recreate attendance automatically.
  delete from public.employee_meeting_attendees attendee
  using public.employee_meetings meeting
  where attendee.meeting_id = meeting.id
    and attendee.employee_id = p_employee_id
    and meeting.date between p_apply_from_date and p_to_date;

  -- Shortening removes every explicit row after the new end, including
  -- weekends. With no row, the frontend derives the calendar default.
  if p_to_date < p_original_end_date then
    delete from public.daily_status
    where employee_id = p_employee_id
      and date > p_to_date and date <= p_original_end_date
      and status = p_status;
  elsif p_to_date > p_original_end_date then
    insert into public.daily_status (employee_id, date, status, is_overtime, note, content, location, start_time, end_time)
    select p_employee_id, day::date, p_status, false,
      case when p_status = 'business_trip' then null else trim(p_note) end,
      case when p_status = 'business_trip' then trim(p_content) else null end,
      case when p_status = 'business_trip' then trim(p_location) else null end,
      null, null
    from generate_series(greatest(p_original_end_date + 1, p_apply_from_date), p_to_date, interval '1 day') as day
    on conflict (employee_id, date) do update set
      status = excluded.status, is_overtime = false, note = excluded.note,
      content = excluded.content, location = excluded.location,
      start_time = null, end_time = null;
  end if;

  insert into public.status_update_notifications (employee_id, status, start_date, end_date, content, location, action)
  values (
    p_employee_id,
    p_status,
    p_apply_from_date,
    p_to_date,
    case when p_status = 'business_trip' then trim(p_content) else null end,
    case when p_status in ('business_trip', 'leave') then coalesce(trim(p_location), trim(p_note)) else null end,
    'updated'
  );
end;
$$;
grant execute on function public.edit_timeline_status(uuid, text, date, date, date, date, text, text, text, boolean) to authenticated;

-- Browser push subscriptions. A user can manage only subscriptions created by
-- their own authenticated account; the Edge Function uses the service role to send.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "users read own push subscriptions" on public.push_subscriptions;
drop policy if exists "users insert own push subscriptions" on public.push_subscriptions;
drop policy if exists "users update own push subscriptions" on public.push_subscriptions;
drop policy if exists "users delete own push subscriptions" on public.push_subscriptions;
create policy "users read own push subscriptions" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "users insert own push subscriptions" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "users update own push subscriptions" on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own push subscriptions" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
