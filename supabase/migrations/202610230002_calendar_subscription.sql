-- Private, revocable, read-only Apple/iCalendar subscriptions.
-- Apply after 202610230001_recurring_appointments.sql.
begin;
create table private.calendar_subscriptions (
 owner_id uuid primary key references auth.users(id) on delete restrict,
 token_hash text unique check(token_hash ~ '^[a-f0-9]{64}$'),
 include_names boolean not null default false,
 revision integer not null default 1 check(revision>0),
 changed_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
revoke all on private.calendar_subscriptions from public,anon,authenticated;

create function public.calendar_subscription_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid := private.require_access();
begin
 return coalesce((select jsonb_build_object('enabled',token_hash is not null,'include_names',include_names,'updated_at',updated_at)
  from private.calendar_subscriptions where owner_id=v_owner),
  jsonb_build_object('enabled',false,'include_names',false,'updated_at',null));
end;
$$;

-- The clear token is returned only when creating/rotating, never stored.
create function public.configure_calendar_subscription(p_action text,p_include_names boolean default false,p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid := private.require_access(); v_previous private.calendar_subscriptions%rowtype;
 v_token text; v_hash text; v_updated timestamptz := clock_timestamp();
begin
 if p_action is null or p_action not in ('create','rotate','update','revoke') or p_include_names is null then
  raise exception 'Revisá la configuración del calendario.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('calendar:'||v_owner::text,0));
 select * into v_previous from private.calendar_subscriptions where owner_id=v_owner for update;
 if v_previous.updated_at is distinct from p_expected_updated_at then
  raise exception 'La conexión cambió en otra ventana. Actualizá la configuración.';
 end if;
 if p_action='create' and v_previous.token_hash is not null then
  raise exception 'Ya hay un enlace activo. Para reemplazarlo, generá uno nuevo desde la configuración.';
 end if;
 if p_action in ('rotate','update','revoke') and v_previous.token_hash is null then
  raise exception 'No hay una suscripción activa. Creá un enlace privado.';
 end if;
 if p_action in ('create','rotate') then
  v_token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  v_hash := encode(sha256(convert_to(v_token,'UTF8')),'hex');
 elsif p_action='update' then v_hash := v_previous.token_hash;
 else v_hash := null;
 end if;
 v_updated := clock_timestamp();
 insert into private.calendar_subscriptions as stored(owner_id,token_hash,include_names,updated_at,changed_at)
  values(v_owner,v_hash,p_include_names,v_updated,v_updated)
  on conflict(owner_id) do update set token_hash=excluded.token_hash,include_names=excluded.include_names,
   updated_at=excluded.updated_at,changed_at=excluded.changed_at,revision=stored.revision+1;
 insert into public.audit_log(owner_id,action,entity_id,details)
  values(v_owner,'calendar_subscription.'||p_action,v_owner,jsonb_build_object('include_names',p_include_names));
 return jsonb_build_object('enabled',v_hash is not null,'include_names',p_include_names,'updated_at',v_updated,'token',v_token);
end;
$$;

-- Monotonic iCalendar SEQUENCE also covers patient renames and sub-second edits.
-- Clinical changes do not invalidate the management dialog's updated_at version.
create function private.bump_calendar_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
 if tg_op='DELETE' then v_owner := old.owner_id; else v_owner := new.owner_id; end if;
 update private.calendar_subscriptions set revision=revision+1,changed_at=clock_timestamp()
  where owner_id=v_owner and token_hash is not null;
 return null;
end;
$$;
create trigger calendar_patient_revision after insert or update or delete on public.patients
 for each row execute function private.bump_calendar_revision();
create trigger calendar_series_revision after insert or update or delete on public.appointment_series
 for each row execute function private.bump_calendar_revision();
create trigger calendar_session_revision after insert or update or delete on public.sessions
 for each row execute function private.bump_calendar_revision();
revoke all on function private.bump_calendar_revision() from public,anon,authenticated;

-- One JSON snapshot avoids API row caps and inconsistent paginated recurrence data.
-- The Edge Function is the only caller. No token lookup or cross-owner RPC for clients.
create function public.calendar_feed_snapshot(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_subscription private.calendar_subscriptions%rowtype; v_series jsonb; v_sessions jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select s.* into v_subscription from private.calendar_subscriptions s
  join private.app_accounts a on a.user_id=s.owner_id and a.active and a.role='professional'
  where s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'weekday',r.weekday,'local_time',r.local_time::text,'starts_on',r.starts_on,'ends_on',r.ends_on,
  'duration_minutes',r.duration_minutes,'first_on',r.starts_on+((r.weekday-extract(dow from r.starts_on)::integer+7)%7),
  'until_at',case when r.ends_on is not null then ((r.ends_on+1)::timestamp at time zone r.timezone)-interval '1 second' end,
  'label',case when v_subscription.include_names then p.first_name||' '||p.last_name
   else upper(left(trim(p.first_name),1))||'. '||upper(left(trim(p.last_name),1))||'.' end
 ) order by r.starts_on,r.id),'[]'::jsonb) into v_series
 from public.appointment_series r join public.patients p on p.id=r.patient_id and p.owner_id=r.owner_id
 where r.owner_id=v_subscription.owner_id;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.id,'series_id',s.series_id,'original_date',s.original_date,
  'starts_at',s.starts_at,'ends_at',s.ends_at,'status',s.status,
  'label',case when v_subscription.include_names then p.first_name||' '||p.last_name
   else upper(left(trim(p.first_name),1))||'. '||upper(left(trim(p.last_name),1))||'.' end
 ) order by s.starts_at,s.id),'[]'::jsonb) into v_sessions
 from public.sessions s join public.patients p on p.id=s.patient_id and p.owner_id=s.owner_id
 where s.owner_id=v_subscription.owner_id;
 return jsonb_build_object('revision',v_subscription.revision,'changed_at',v_subscription.changed_at,
  'series',v_series,'sessions',v_sessions);
end;
$$;
revoke all on function public.calendar_subscription_status(),public.configure_calendar_subscription(text,boolean,timestamptz) from public,anon;
grant execute on function public.calendar_subscription_status(),public.configure_calendar_subscription(text,boolean,timestamptz) to authenticated;
revoke all on function public.calendar_feed_snapshot(text) from public,anon,authenticated;
grant execute on function public.calendar_feed_snapshot(text) to service_role;
commit;