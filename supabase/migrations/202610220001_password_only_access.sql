-- User-requested temporary password-only access (22 October 2026).
-- Keeps the single authorized owner, Auth and every existing RLS policy.
begin;

create or replace function public.has_app_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_app_owner();
$$;

create or replace function private.require_access() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_app_access() then
    raise exception 'Acceso no autorizado. Verificá tu sesión y tu cuenta.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

revoke all on function public.has_app_access() from public, anon;
grant execute on function public.has_app_access() to authenticated;
revoke all on function private.require_access() from public, anon, authenticated;

commit;
