-- Run once in Supabase SQL Editor for existing projects.
-- Allows signed-in employees to read department names used by the Dashboard.
alter table public.departments enable row level security;

drop policy if exists "departments readable" on public.departments;
create policy "departments readable"
on public.departments
for select
to authenticated
using (true);
