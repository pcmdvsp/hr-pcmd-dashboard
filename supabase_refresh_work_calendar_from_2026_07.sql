-- Run once in Supabase SQL Editor.
-- Rebuilds the standard calendar from 01/07/2026 through 31/12/2035:
-- Monday–Friday = working_day; Saturday/Sunday = weekend.
-- Existing holidays and special-leave days are preserved.

begin;

with generated_calendar as (
  select
    day::date as date,
    case when extract(isodow from day) in (6, 7) then 'weekend' else 'working_day' end as day_type
  from generate_series(date '2026-07-01', date '2035-12-31', interval '1 day') as day
)
insert into public.work_calendar (date, day_type)
select date, day_type
from generated_calendar
on conflict (date) do nothing;

with generated_calendar as (
  select
    day::date as date,
    case when extract(isodow from day) in (6, 7) then 'weekend' else 'working_day' end as day_type
  from generate_series(date '2026-07-01', date '2035-12-31', interval '1 day') as day
)
update public.work_calendar as calendar
set day_type = generated_calendar.day_type,
    holiday_name = null
from generated_calendar
where calendar.date = generated_calendar.date
  and calendar.day_type in ('working_day', 'weekend')
  and calendar.day_type is distinct from generated_calendar.day_type;

commit;
