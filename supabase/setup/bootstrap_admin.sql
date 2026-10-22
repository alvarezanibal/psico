-- Create an Auth user first: admin@accounts.consultorio.invalid
-- Choose its password and mark Auto Confirm User. No real mailbox is needed.
-- Execute after the admin_users migration as postgres in the SQL Editor.
begin;
do $$
declare v_user uuid;
begin
 select id into v_user from auth.users where lower(email)='admin@accounts.consultorio.invalid';
 if v_user is null then raise exception 'Primero creá admin@accounts.consultorio.invalid en Authentication con una contraseña y confirmación automática.'; end if;
 if exists(select 1 from private.app_accounts where user_id=v_user and role<>'admin') then
  raise exception 'Usá una cuenta separada para el administrador.';
 end if;
 insert into private.app_accounts(user_id,username,display_name,role,managed_login)
  values(v_user,'admin','Administrador','admin',true) on conflict(user_id) do nothing;
 insert into public.profiles(user_id,display_name) values(v_user,'Administrador') on conflict(user_id) do nothing;
end;
$$;
commit;
