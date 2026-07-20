-- Run this once in Supabase SQL Editor after supabase_schema.sql.
-- Meetings are daily_status records with status = 'meeting'.

alter table public.daily_status add column if not exists content text;
alter table public.daily_status add column if not exists location text;
alter table public.daily_status add column if not exists start_time time;
alter table public.daily_status add column if not exists end_time time;

alter table public.daily_status drop constraint if exists daily_status_status_check;
alter table public.daily_status add constraint daily_status_status_check
  check (status in ('working', 'business_trip', 'leave', 'sick', 'meeting'));

alter table public.daily_status drop constraint if exists daily_status_meeting_time_check;
alter table public.daily_status add constraint daily_status_meeting_time_check
  check (end_time is null or start_time is null or end_time >= start_time);

create table if not exists public.daily_status_attendees (
  daily_status_id uuid not null references public.daily_status(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (daily_status_id, employee_id)
);

create index if not exists daily_status_attendees_employee_idx on public.daily_status_attendees(employee_id);

alter table public.daily_status_attendees enable row level security;
drop policy if exists "status attendees readable" on public.daily_status_attendees;
drop policy if exists "owners manage status attendees" on public.daily_status_attendees;
create policy "status attendees readable" on public.daily_status_attendees for select to authenticated using (true);
create policy "owners manage status attendees" on public.daily_status_attendees for all to authenticated
  using (public.is_admin() or exists (select 1 from public.daily_status s where s.id = daily_status_id and s.employee_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.daily_status s where s.id = daily_status_id and s.employee_id = auth.uid()));

-- Prevent overlapping reservations of the internal KNT meeting room.
create or replace function public.validate_knt_meeting_room_reservation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'meeting' and new.location = 'KNT meeting room' then
    if new.start_time is null or new.end_time is null then
      raise exception 'Start time and end time are required for the KNT meeting room';
    end if;
    perform pg_advisory_xact_lock(hashtext(new.date::text || new.location));
    if exists (
      select 1 from public.daily_status s
      where s.id is distinct from new.id
        and s.date = new.date
        and s.status = 'meeting'
        and s.location = 'KNT meeting room'
        and s.start_time < new.end_time
        and s.end_time > new.start_time
    ) then
      raise exception 'The meeting room has been reserved for the selected time. Please choose different time!';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_status_knt_meeting_room_check on public.daily_status;
create trigger daily_status_knt_meeting_room_check
before insert or update of status, date, location, start_time, end_time on public.daily_status
for each row execute function public.validate_knt_meeting_room_reservation();

-- Multiple meetings can occur on the same day, so they are stored separately
-- from daily_status (which has one row per employee/day).
create table if not exists public.employee_meetings (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  content text not null,
  location text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time >= start_time)
);

alter table public.employee_meetings add column if not exists online_link text;

-- Overtime records are explicit exceptions on weekends. A normal working day
-- continues to have no daily_status row unless another status is registered.
alter table public.daily_status add column if not exists is_overtime boolean not null default false;
alter table public.daily_status drop constraint if exists daily_status_status_check;
alter table public.daily_status add constraint daily_status_status_check
  check (status in ('working', 'business_trip', 'leave', 'sick', 'meeting'));
alter table public.employee_meetings add column if not exists is_overtime boolean not null default false;

-- Notification reading is independent from opening the Meeting in My Status.
alter table public.employee_meeting_views add column if not exists notification_meeting_updated_at timestamptz;

-- Keeps a cancellation notice after the meeting and its attendee records are removed.
create table if not exists public.employee_meeting_cancellations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  meeting_id uuid not null,
  content text not null,
  meeting_date date not null,
  start_time time,
  end_time time,
  location text,
  cancelled_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists employee_meeting_cancellations_employee_idx on public.employee_meeting_cancellations(employee_id, cancelled_at desc);
alter table public.employee_meeting_cancellations enable row level security;
drop policy if exists "users read own meeting cancellations" on public.employee_meeting_cancellations;
drop policy if exists "organizers create meeting cancellations" on public.employee_meeting_cancellations;
drop policy if exists "users mark own meeting cancellations read" on public.employee_meeting_cancellations;
create policy "users read own meeting cancellations" on public.employee_meeting_cancellations for select to authenticated using (employee_id = auth.uid() or public.is_admin());
create policy "organizers create meeting cancellations" on public.employee_meeting_cancellations for insert to authenticated with check (public.is_admin() or exists (select 1 from public.employee_meetings m where m.id = meeting_id and m.organizer_id = auth.uid()));
create policy "users mark own meeting cancellations read" on public.employee_meeting_cancellations for update to authenticated using (employee_id = auth.uid() or public.is_admin()) with check (employee_id = auth.uid() or public.is_admin());

create table if not exists public.employee_meeting_attendees (
  meeting_id uuid not null references public.employee_meetings(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, employee_id)
);

create index if not exists employee_meetings_organizer_date_idx on public.employee_meetings(organizer_id, date);
create index if not exists employee_meetings_date_idx on public.employee_meetings(date);

drop trigger if exists employee_meetings_updated on public.employee_meetings;
create trigger employee_meetings_updated before update on public.employee_meetings for each row execute function public.set_updated_at();

alter table public.employee_meetings enable row level security;
alter table public.employee_meeting_attendees enable row level security;
drop policy if exists "employee meetings readable" on public.employee_meetings;
drop policy if exists "organizers manage employee meetings" on public.employee_meetings;
create policy "employee meetings readable" on public.employee_meetings for select to authenticated using (true);
create policy "organizers manage employee meetings" on public.employee_meetings for all to authenticated
  using (public.is_admin() or organizer_id = auth.uid())
  with check (public.is_admin() or organizer_id = auth.uid());
drop policy if exists "employee meeting attendees readable" on public.employee_meeting_attendees;
drop policy if exists "organizers manage employee meeting attendees" on public.employee_meeting_attendees;
create policy "employee meeting attendees readable" on public.employee_meeting_attendees for select to authenticated using (true);
create policy "organizers manage employee meeting attendees" on public.employee_meeting_attendees for all to authenticated
  using (public.is_admin() or exists (select 1 from public.employee_meetings m where m.id = meeting_id and m.organizer_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.employee_meetings m where m.id = meeting_id and m.organizer_id = auth.uid()));
-- A participant may remove only their own attendance when another status
-- (business trip, annual leave, or sick leave) replaces their Meeting.
drop policy if exists "participants leave employee meetings" on public.employee_meeting_attendees;
create policy "participants leave employee meetings" on public.employee_meeting_attendees for delete to authenticated
  using (employee_id = auth.uid() or public.is_admin());

-- Database-level protection: an employee on business trip, annual leave, or
-- sick leave can organize a meeting but cannot be inserted as its attendee.
-- This protects their existing daily_status even if a stale browser submits an
-- outdated participant selection.
create or replace function public.validate_employee_meeting_attendee_availability()
returns trigger language plpgsql set search_path = public as $$
declare
  meeting_date date;
begin
  select date into meeting_date from public.employee_meetings where id = new.meeting_id;
  if exists (
    select 1 from public.daily_status s
    where s.employee_id = new.employee_id
      and s.date = meeting_date
      and s.status in ('business_trip', 'leave', 'sick')
  ) then
    raise exception 'This participant is unavailable on the meeting date.';
  end if;
  return new;
end;
$$;
drop trigger if exists employee_meeting_attendee_availability_check on public.employee_meeting_attendees;
create trigger employee_meeting_attendee_availability_check
before insert or update of meeting_id, employee_id on public.employee_meeting_attendees
for each row execute function public.validate_employee_meeting_attendee_availability();

-- Tracks whether each organizer/participant has seen the latest Meeting version.
create table if not exists public.employee_meeting_views (
  meeting_id uuid not null references public.employee_meetings(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now(),
  seen_meeting_updated_at timestamptz not null,
  primary key (meeting_id, employee_id)
);
alter table public.employee_meeting_views enable row level security;
drop policy if exists "users read own meeting views" on public.employee_meeting_views;
drop policy if exists "users manage own meeting views" on public.employee_meeting_views;
create policy "users read own meeting views" on public.employee_meeting_views for select to authenticated
  using (employee_id = auth.uid() or public.is_admin());
create policy "users manage own meeting views" on public.employee_meeting_views for all to authenticated
  using (employee_id = auth.uid() or public.is_admin())
  with check (employee_id = auth.uid() or public.is_admin());

create or replace function public.validate_knt_employee_meeting_room_reservation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.location = 'KNT meeting room' then
    perform pg_advisory_xact_lock(hashtext(new.date::text || new.location));
    if exists (select 1 from public.employee_meetings m where m.id is distinct from new.id and m.date = new.date and m.location = 'KNT meeting room' and m.start_time < new.end_time and m.end_time > new.start_time) then
      raise exception 'The meeting room has been reserved for the selected time. Please choose different time!';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists employee_meetings_knt_room_check on public.employee_meetings;
create trigger employee_meetings_knt_room_check before insert or update of date, location, start_time, end_time on public.employee_meetings for each row execute function public.validate_knt_employee_meeting_room_reservation();

-- Migrate existing Meeting records created before this change, then remove them
-- from daily_status so each new meeting is independent.
insert into public.employee_meetings(id, organizer_id, date, content, location, start_time, end_time, created_at, updated_at)
select id, employee_id, date, coalesce(content, 'Meeting'), coalesce(location, 'Not specified'), coalesce(start_time, time '00:00'), coalesce(end_time, time '00:00'), created_at, updated_at
from public.daily_status where status = 'meeting'
on conflict (id) do nothing;
insert into public.employee_meeting_attendees(meeting_id, employee_id, created_at)
select a.daily_status_id, a.employee_id, a.created_at from public.daily_status_attendees a join public.daily_status s on s.id = a.daily_status_id where s.status = 'meeting'
on conflict do nothing;
delete from public.daily_status where status = 'meeting';
