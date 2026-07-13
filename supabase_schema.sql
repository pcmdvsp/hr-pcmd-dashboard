-- HR daily-status dashboard. Execute in Supabase SQL Editor as project owner.
create extension if not exists "pgcrypto";
create table if not exists departments (id uuid primary key default gen_random_uuid(), name text not null unique, sort_order integer not null default 0);
create table if not exists profiles (id uuid primary key references auth.users(id) on delete cascade, email text not null unique, employee_code text not null unique, full_name text not null, department_id uuid references departments(id) on delete set null, role text not null default 'normal' check (role in ('admin','normal')), position text, active boolean not null default true, must_change_password boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists daily_status (id uuid primary key default gen_random_uuid(), employee_id uuid not null references profiles(id) on delete cascade, date date not null, status text not null check (status in ('business_trip','leave','sick')), note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(employee_id,date));
create index if not exists profiles_department_active_idx on profiles(department_id,active); create index if not exists daily_status_date_idx on daily_status(date); create index if not exists daily_status_employee_date_idx on daily_status(employee_id,date);
create or replace function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger profiles_updated before update on profiles for each row execute function set_updated_at(); create trigger daily_status_updated before update on daily_status for each row execute function set_updated_at();
-- Security-definer avoids recursive RLS checks. Do not grant this function directly.
create or replace function is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin' and active=true) $$;
create or replace function complete_password_change() returns void language plpgsql security definer set search_path=public as $$ begin update profiles set must_change_password=false where id=auth.uid(); if not found then raise exception 'Profile not found'; end if; end; $$;
revoke all on function complete_password_change() from public;
grant execute on function complete_password_change() to authenticated;
alter table departments enable row level security; alter table profiles enable row level security; alter table daily_status enable row level security;
create policy "departments readable" on departments for select to authenticated using (true);
create policy "active profiles readable" on profiles for select to authenticated using (active=true or id=auth.uid() or is_admin());
create policy "admins manage profiles" on profiles for all to authenticated using (is_admin()) with check (is_admin());
create policy "statuses readable" on daily_status for select to authenticated using (true);
create policy "own status insert" on daily_status for insert to authenticated with check (employee_id=auth.uid() or is_admin());
create policy "own status update" on daily_status for update to authenticated using (employee_id=auth.uid() or is_admin()) with check (employee_id=auth.uid() or is_admin());
create policy "own status delete" on daily_status for delete to authenticated using (employee_id=auth.uid() or is_admin());
-- Sample organization. Create corresponding Auth users in Authentication > Users, then replace UUIDs below with their ids.
insert into departments(name,sort_order) values ('Phòng Kế hoạch',1),('Phòng Tổ chức',2),('Phòng Tài chính',3),('Phòng Công nghệ',4) on conflict(name) do nothing;
-- Example profile, after creating an Auth user:
-- insert into profiles(id,email,employee_code,full_name,department_id,role,position,must_change_password) values
-- ('AUTH-USER-UUID','admin@congty.vn','LD001','Nguyễn Văn A',null,'admin','Trưởng ban',true);
-- Add 2 more leaders and several staff per department in the same way. Passwords are stored only in Supabase Auth, never here.
