-- Run this once in Supabase SQL Editor after supabase_schema.sql.
-- Meetings are daily_status records with status = 'meeting'.

alter table public.daily_status add column if not exists content text;
alter table public.daily_status add column if not exists location text;
alter table public.daily_status add column if not exists start_time time;
alter table public.daily_status add column if not exists end_time time;

alter table public.daily_status drop constraint if exists daily_status_status_check;
alter table public.daily_status add constraint daily_status_status_check
  check (status in ('business_trip', 'leave', 'sick', 'meeting'));

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
      raise exception 'The meeting room has been reserved for the selected time';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_status_knt_meeting_room_check on public.daily_status;
create trigger daily_status_knt_meeting_room_check
before insert or update of status, date, location, start_time, end_time on public.daily_status
for each row execute function public.validate_knt_meeting_room_reservation();
