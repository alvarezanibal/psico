-- User administration: a separate admin and isolated professional accounts.
begin;
create table private.app_accounts (
 user_id uuid primary key references auth.users(id) on delete restrict,
 username text not null unique check(username=lower(username) and username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
 display_name text not null check(length(trim(display_name)) between 1 and 100),
 role text not null check(role in ('admin','professional')),
 active boolean not null default true,
 managed_login boolean not null default true,
 creation_request_id uuid unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table private.account_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references auth.users(id) on delete restrict,
 target_id uuid not null references auth.users(id) on delete restrict,
 action text not null, created_at timestamptz not null default now()
);
revoke all on private.app_accounts,private.account_audit from public,anon,authenticated;
-- Preserve the existing professional's UUID and historical owner_id links.
insert into private.app_accounts(user_id,username,display_name,role,managed_login)
 select o.user_id,'profesional',coalesce(p.display_name,'Mi consultorio'),'professional',false
 from private.app_owner o left join public.profiles p on p.user_id=o.user_id;

create function public.current_app_account() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('user_id',user_id,'username',username,'display_name',display_name,
 'role',role,'active',active,'managed_login',managed_login)
 from private.app_accounts where user_id=auth.uid();
$$;
create function public.has_account_access() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.app_accounts where user_id=auth.uid() and active);
$$;
create function public.is_app_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.app_accounts where user_id=auth.uid() and active and role='admin');
$$;
create or replace function public.has_app_access() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.app_accounts where user_id=auth.uid() and active and role='professional');
$$;
create or replace function public.is_app_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select public.has_app_access();
$$;
drop policy profiles_read on public.profiles;
drop policy profiles_update on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
 using(user_id=auth.uid() and public.has_account_access());
create policy profiles_update on public.profiles for update to authenticated
 using(user_id=auth.uid() and public.has_account_access())
 with check(user_id=auth.uid() and public.has_account_access());
-- All clinical/financial policies still require has_app_access() AND owner_id.
-- An admin is not a professional and cannot access those tables.

create function private.require_admin(p_actor uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from private.app_accounts where user_id=p_actor and active and role='admin') then
  raise exception 'Acceso de administrador requerido.' using errcode='42501';
 end if;
end;
$$;
create function public.admin_list_accounts(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_admin(p_actor);
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'username',username,
 'display_name',display_name,'active',active,'managed_login',managed_login,'created_at',created_at)
 order by created_at desc) from private.app_accounts where role='professional'),'[]'::jsonb);
end;
$$;
-- Recover an ambiguous Auth creation using trusted app_metadata and request id.
create function public.admin_find_creation(p_actor uuid,p_username text,p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a private.app_accounts%rowtype; u auth.users%rowtype;
begin
 perform private.require_admin(p_actor);
 if p_username is null or p_username !~ '^[a-z0-9][a-z0-9_.-]{2,31}$' or p_request_id is null then
  raise exception 'Revisá el nombre de usuario.';
 end if;
 select * into a from private.app_accounts where username=p_username;
 if found then
  if a.role<>'professional' or a.creation_request_id is distinct from p_request_id then
   raise exception 'Ese nombre de usuario ya está en uso.';
  end if;
  return jsonb_build_object('user_id',a.user_id,'registered',true);
 end if;
 select * into u from auth.users where lower(email)=p_username||'@accounts.consultorio.invalid';
 if found then
  if u.raw_app_meta_data->>'managed_by' is distinct from 'consultorio'
   or u.raw_app_meta_data->>'creation_request_id' is distinct from p_request_id::text then
   raise exception 'Ese nombre de usuario ya está en uso.';
  end if;
  return jsonb_build_object('user_id',u.id,'registered',false);
 end if;
 return null;
end;
$$;
create function public.admin_register_account(p_actor uuid,p_user_id uuid,p_username text,p_display_name text,p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a private.app_accounts%rowtype;
begin
 perform private.require_admin(p_actor);
 if p_username is null or p_username !~ '^[a-z0-9][a-z0-9_.-]{2,31}$'
  or p_display_name is null or length(trim(p_display_name)) not between 1 and 100 or p_request_id is null then
  raise exception 'Revisá el nombre de usuario y el nombre para mostrar.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_username,0));
 select * into a from private.app_accounts where user_id=p_user_id;
 if found then
  if a.role='professional' and a.username=p_username and a.creation_request_id=p_request_id then return; end if;
  raise exception 'Esta cuenta ya está registrada.';
 end if;
 if not exists(select 1 from auth.users where id=p_user_id
  and lower(email)=p_username||'@accounts.consultorio.invalid'
  and raw_app_meta_data->>'managed_by'='consultorio'
  and raw_app_meta_data->>'creation_request_id'=p_request_id::text) then
  raise exception 'No se pudo validar la cuenta creada.';
 end if;
 insert into private.app_accounts(user_id,username,display_name,role,creation_request_id)
  values(p_user_id,p_username,trim(p_display_name),'professional',p_request_id);
 insert into public.profiles(user_id,display_name) values(p_user_id,trim(p_display_name));
 insert into private.account_audit(actor_id,target_id,action) values(p_actor,p_user_id,'account.created');
end;
$$;
create function public.admin_set_account_active(p_actor uuid,p_user_id uuid,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare a private.app_accounts%rowtype;
begin
 perform private.require_admin(p_actor);
 if p_active is null or p_user_id=p_actor then raise exception 'No se puede modificar este acceso.'; end if;
 select * into a from private.app_accounts where user_id=p_user_id and role='professional' for update;
 if not found then raise exception 'Usuario no disponible.'; end if;
 if a.active=p_active then return; end if;
 update private.app_accounts set active=p_active,updated_at=now() where user_id=p_user_id;
 insert into private.account_audit(actor_id,target_id,action)
  values(p_actor,p_user_id,case when p_active then 'account.enabled' else 'account.disabled' end);
end;
$$;
create function public.admin_note_password_reset(p_actor uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin(p_actor);
 update private.app_accounts set managed_login=true,updated_at=now() where user_id=p_user_id and role='professional';
 if not found then raise exception 'Usuario no disponible.'; end if;
 insert into private.account_audit(actor_id,target_id,action) values(p_actor,p_user_id,'account.password_reset');
end;
$$;
revoke all on function public.current_app_account(),public.has_account_access(),public.is_app_admin(),public.has_app_access(),public.is_app_owner() from public,anon;
grant execute on function public.current_app_account(),public.has_account_access(),public.is_app_admin(),public.has_app_access(),public.is_app_owner() to authenticated;
revoke all on function private.require_admin(uuid) from public,anon,authenticated;
revoke all on function public.admin_list_accounts(uuid),public.admin_find_creation(uuid,text,uuid),public.admin_register_account(uuid,uuid,text,text,uuid),public.admin_set_account_active(uuid,uuid,boolean),public.admin_note_password_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_list_accounts(uuid),public.admin_find_creation(uuid,text,uuid),public.admin_register_account(uuid,uuid,text,text,uuid),public.admin_set_account_active(uuid,uuid,boolean),public.admin_note_password_reset(uuid,uuid) to service_role;
commit;
