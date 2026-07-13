-- Run once in Supabase SQL Editor for existing projects.
-- A normal user may only clear their own temporary-password flag through this function.
create or replace function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set must_change_password = false
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.complete_password_change() from public;
grant execute on function public.complete_password_change() to authenticated;
