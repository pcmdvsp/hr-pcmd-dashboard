-- Run this once in Supabase SQL Editor after supabase_schema.sql.
-- daily_status remains the only source for daily, monthly, quarterly and yearly reporting.

create table if not exists public.work_calendar (
  date date primary key,
  day_type text not null check (day_type in ('working_day', 'weekend', 'holiday', 'special_leave')),
  holiday_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists work_calendar_updated on public.work_calendar;
create trigger work_calendar_updated before update on public.work_calendar for each row execute function public.set_updated_at();

-- Initial normal work calendar. Existing overrides (holiday/special leave) are preserved.
insert into public.work_calendar (date, day_type)
select day::date, case when extract(isodow from day) in (6, 7) then 'weekend' else 'working_day' end
from generate_series(date '2024-01-01', date '2035-12-31', interval '1 day') as day
on conflict (date) do nothing;

alter table public.work_calendar enable row level security;
drop policy if exists "calendar readable" on public.work_calendar;
drop policy if exists "admins manage calendar" on public.work_calendar;
create policy "calendar readable" on public.work_calendar for select to authenticated using (true);
create policy "admins manage calendar" on public.work_calendar for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- One row per employee. A missing daily_status record on a working day counts as working.
create or replace function public.employee_monthly_statistics(p_employee_id uuid, p_month date)
returns table (employee_id uuid, employee_code text, full_name text, department_name text, working_days bigint, business_trip_days bigint, leave_days bigint, sick_days bigint, scheduled_workdays bigint)
language sql stable security invoker set search_path = public as $$
  with bounds as (select date_trunc('month', p_month)::date as start_date, (date_trunc('month', p_month) + interval '1 month')::date as end_date),
  scheduled_days as (select c.date from public.work_calendar c, bounds b where c.date >= b.start_date and c.date < b.end_date and c.day_type = 'working_day'),
  counted_days as (select date from scheduled_days where date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  select p.id, p.employee_code, p.full_name, coalesce(d.name, 'Ban lãnh đạo'),
    count(w.date) - count(s.id) filter (where s.status in ('business_trip', 'leave', 'sick')),
    count(s.id) filter (where s.status = 'business_trip'),
    count(s.id) filter (where s.status = 'leave'),
    count(s.id) filter (where s.status = 'sick'), (select count(*) from scheduled_days)
  from public.profiles p left join public.departments d on d.id = p.department_id
  left join counted_days w on true left join public.daily_status s on s.employee_id = p.id and s.date = w.date
  where p.id = p_employee_id and p.active = true
  group by p.id, p.employee_code, p.full_name, d.name;
$$;

-- Entire organization report; it is calculated each time from work_calendar + daily_status.
create or replace function public.organization_monthly_statistics(p_month date)
returns table (employee_id uuid, employee_code text, full_name text, department_id uuid, department_name text, working_days bigint, business_trip_days bigint, leave_days bigint, sick_days bigint, scheduled_workdays bigint)
language sql stable security invoker set search_path = public as $$
  with bounds as (select date_trunc('month', p_month)::date as start_date, (date_trunc('month', p_month) + interval '1 month')::date as end_date),
  scheduled_days as (select c.date from public.work_calendar c, bounds b where c.date >= b.start_date and c.date < b.end_date and c.day_type = 'working_day'),
  counted_days as (select date from scheduled_days where date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  select p.id, p.employee_code, p.full_name, p.department_id, coalesce(d.name, 'Ban lãnh đạo'),
    count(w.date) - count(s.id) filter (where s.status in ('business_trip', 'leave', 'sick')),
    count(s.id) filter (where s.status = 'business_trip'),
    count(s.id) filter (where s.status = 'leave'),
    count(s.id) filter (where s.status = 'sick'), (select count(*) from scheduled_days)
  from public.profiles p left join public.departments d on d.id = p.department_id
  left join counted_days w on true left join public.daily_status s on s.employee_id = p.id and s.date = w.date
  where p.active = true
  group by p.id, p.employee_code, p.full_name, p.department_id, d.name;
$$;

revoke all on function public.employee_monthly_statistics(uuid, date) from public;
revoke all on function public.organization_monthly_statistics(date) from public;
grant execute on function public.employee_monthly_statistics(uuid, date) to authenticated;
grant execute on function public.organization_monthly_statistics(date) to authenticated;
