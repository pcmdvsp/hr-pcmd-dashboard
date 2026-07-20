-- Run once in Supabase SQL Editor.
-- Swaps the dashboard display order of Block 09-3/12 and Block 16-1/15.

with current_order as (
  select name, sort_order
  from public.departments
  where name in ('Block 09-3/12', 'Block 16-1/15')
)
update public.departments as department
set sort_order = case department.name
  when 'Block 09-3/12' then (select sort_order from current_order where name = 'Block 16-1/15')
  when 'Block 16-1/15' then (select sort_order from current_order where name = 'Block 09-3/12')
end
where department.name in ('Block 09-3/12', 'Block 16-1/15');
