-- Weekly series and single-occurrence replacements. Apply after admin_users.
begin;
create table public.appointment_series (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 patient_id uuid not null,
 weekday integer not null check(weekday between 0 and 6),
 local_time time not null check(local_time < time '24:00' and extract(second from local_time)=0),
 timezone text not null default 'America/Argentina/Buenos_Aires' check(timezone='America/Argentina/Buenos_Aires'),
 starts_on date not null check(isfinite(starts_on)),
 ends_on date check(isfinite(ends_on) and ends_on >= starts_on-1),
 duration_minutes integer not null check(duration_minutes between 5 and 240),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(owner_id,patient_id) references public.patients(owner_id,id) on delete restrict,
 unique(owner_id,patient_id,id)
);
create unique index one_open_series_per_patient on public.appointment_series(owner_id,patient_id) where ends_on is null;
create index series_patient_dates on public.appointment_series(owner_id,patient_id,starts_on);
alter table public.appointment_series enable row level security;
create policy series_read on public.appointment_series for select to authenticated
 using(owner_id=auth.uid() and public.has_app_access());
revoke all on public.appointment_series from public,anon,authenticated;
grant select on public.appointment_series to authenticated;
alter table public.sessions add column series_id uuid, add column original_date date;
alter table public.sessions add constraint session_series_occurrence check((series_id is null)=(original_date is null));
alter table public.sessions add constraint session_series_owner foreign key(owner_id,patient_id,series_id)
 references public.appointment_series(owner_id,patient_id,id) on delete restrict;
create unique index session_one_occurrence on public.sessions(series_id,original_date) where series_id is not null;
-- Preserve existing balance views and their grants. Expose recurrence identity separately.
create view public.agenda_session_balances with(security_invoker=true) as
 select b.*,s.series_id,s.original_date from public.session_balances b join public.sessions s on s.id=b.id;
revoke all on public.agenda_session_balances from public,anon,authenticated;
grant select on public.agenda_session_balances to authenticated;

-- One transaction for patient details and an optional schedule change.
create function public.save_patient_schedule(p_data jsonb,p_id uuid default null,p_schedule jsonb default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid := private.require_access();
 v_id uuid := coalesce(p_id,gen_random_uuid());
 v_previous public.appointment_series%rowtype;
 v_new_series uuid; v_effective date; v_first date; v_action text; v_weekday integer; v_time time;
 v_price numeric := (p_data->>'default_session_price')::numeric;
 v_duration integer := (p_data->>'default_duration_minutes')::integer;
begin
 if jsonb_typeof(p_data) is distinct from 'object' or v_price is null or v_price < 0 or v_price > 999999999999.99
  or v_price<>round(v_price,2) or v_duration is null or v_duration not between 5 and 240 then
  raise exception 'Revisá los datos del paciente.';
 end if;
 if p_id is null then
  insert into public.patients(id,owner_id,first_name,last_name,email,phone,default_session_price,default_duration_minutes)
   values(v_id,v_owner,trim(p_data->>'first_name'),trim(p_data->>'last_name'),coalesce(p_data->>'email',''),
    coalesce(p_data->>'phone',''),v_price,v_duration);
 else
  perform 1 from public.patients where id=v_id and owner_id=v_owner for update;
  if not found then raise exception 'Paciente no disponible.'; end if;
  update public.patients set first_name=trim(p_data->>'first_name'),last_name=trim(p_data->>'last_name'),
   email=coalesce(p_data->>'email',''),phone=coalesce(p_data->>'phone',''),
   default_session_price=v_price,default_duration_minutes=v_duration where id=v_id;
 end if;
 if p_schedule is null then return v_id; end if;
 if jsonb_typeof(p_schedule) is distinct from 'object' then raise exception 'Revisá el horario fijo.'; end if;
 v_action := p_schedule->>'action';
 v_effective := (p_schedule->>'effective_from')::date;
 if v_action is null or v_action not in ('set','stop') or v_effective is null or not isfinite(v_effective)
  or v_effective < (now() at time zone 'America/Argentina/Buenos_Aires')::date then
  raise exception 'Elegí una fecha de cambio desde hoy en adelante.';
 end if;
 if not exists(select 1 from public.patients where id=v_id and active) then
  raise exception 'Reactivá al paciente antes de modificar su horario fijo.';
 end if;
 select * into v_previous from public.appointment_series where owner_id=v_owner and patient_id=v_id
  order by starts_on desc,created_at desc,id desc limit 1 for update;
 if v_previous.id is distinct from (p_schedule->>'expected_series_id')::uuid
  or v_previous.updated_at is distinct from (p_schedule->>'expected_updated_at')::timestamptz then
  raise exception 'El horario fijo cambió en otra ventana. Actualizá antes de continuar.';
 end if;
 if v_previous.id is not null and v_effective < v_previous.starts_on then
  raise exception 'Ya hay un cambio futuro. Usá una fecha igual o posterior a su inicio.';
 end if;
 if v_action='set' then
  v_first := coalesce((p_schedule->>'starts_on')::date,v_effective);
  v_duration := coalesce((p_schedule->>'duration_minutes')::integer,v_duration);
  if not isfinite(v_first) or v_first<v_effective or v_duration not between 5 and 240 then raise exception 'Revisá la fecha y duración del horario fijo.'; end if;
  v_weekday := (p_schedule->>'weekday')::integer;
  v_time := (p_schedule->>'local_time')::time;
  if v_weekday is null or v_weekday not between 0 and 6 or v_time is null
   or v_time>=time '24:00' or extract(second from v_time)<>0 then raise exception 'Revisá el día y horario fijo.'; end if;
 end if;
 -- Do not silently duplicate or discard individually edited/paid future occurrences.
 if exists(select 1 from public.sessions s join public.appointment_series r on r.id=s.series_id
  where s.owner_id=v_owner and s.patient_id=v_id and s.original_date>=v_effective
  and (r.ends_on is null or r.ends_on>=v_effective)) then
  raise exception 'Hay turnos individuales desde esa fecha. Revisalos o elegí una fecha posterior antes de cambiar la serie.';
 end if;
 update public.appointment_series set ends_on=v_effective-1,updated_at=clock_timestamp()
  where owner_id=v_owner and patient_id=v_id and (ends_on is null or ends_on>=v_effective);
 if v_action='set' then
  insert into public.appointment_series(owner_id,patient_id,weekday,local_time,starts_on,duration_minutes)
   values(v_owner,v_id,v_weekday,v_time,v_first,v_duration) returning id into v_new_series;
  -- Adopt matching existing manual bookings without changing their financial data.
  if exists(select 1 from public.sessions where owner_id=v_owner and patient_id=v_id and series_id is null
   and (starts_at at time zone 'America/Argentina/Buenos_Aires')::date>=v_first
   and extract(dow from starts_at at time zone 'America/Argentina/Buenos_Aires')::integer=v_weekday
   and (starts_at at time zone 'America/Argentina/Buenos_Aires')::time=v_time
   group by (starts_at at time zone 'America/Argentina/Buenos_Aires')::date having count(*)>1) then
   raise exception 'Hay turnos manuales duplicados en ese horario. Revisá la agenda antes de crear la serie.';
  end if;
  update public.sessions set series_id=v_new_series,original_date=(starts_at at time zone 'America/Argentina/Buenos_Aires')::date
   where owner_id=v_owner and patient_id=v_id and series_id is null
   and (starts_at at time zone 'America/Argentina/Buenos_Aires')::date>=v_first
   and extract(dow from starts_at at time zone 'America/Argentina/Buenos_Aires')::integer=v_weekday
   and (starts_at at time zone 'America/Argentina/Buenos_Aires')::time=v_time;
 end if;
 insert into public.audit_log(owner_id,action,entity_id,details)
  values(v_owner,'schedule.'||v_action,v_id,jsonb_build_object('effective_from',v_effective));
 return v_id;
end;
$$;

create function public.change_patient_schedule(p_patient_id uuid,p_schedule jsonb) returns uuid
language plpgsql security definer set search_path='' as $
declare v_owner uuid := private.require_access(); v_patient public.patients%rowtype;
begin
 select * into v_patient from public.patients where id=p_patient_id and owner_id=v_owner for update;
 if not found then raise exception 'Paciente no disponible.'; end if;
 return public.save_patient_schedule(to_jsonb(v_patient),p_patient_id,p_schedule);
end;
$;
revoke all on function public.change_patient_schedule(uuid,jsonb) from public,anon;
grant execute on function public.change_patient_schedule(uuid,jsonb) to authenticated;

-- Archiving stops projections; reactivation does not restart an old series.
create function private.close_archived_patient_series() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active then
  update public.appointment_series set ends_on=greatest(starts_on-1,(now() at time zone 'America/Argentina/Buenos_Aires')::date-1),updated_at=clock_timestamp()
   where owner_id=new.owner_id and patient_id=new.id and (ends_on is null or ends_on >= (now() at time zone 'America/Argentina/Buenos_Aires')::date);
 end if;
 return new;
end;
$$;
create trigger patient_close_series after update of active on public.patients
 for each row execute function private.close_archived_patient_series();
revoke all on function private.close_archived_patient_series() from public,anon,authenticated;

-- Record the exception/session atomically. Its original key never follows its new date.
create function public.save_recurring_occurrence(p_series_id uuid,p_original_date date,p_data jsonb,p_expected_updated_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid := private.require_access();
 v_rule public.appointment_series%rowtype;
 v_patient uuid; v_id uuid;
begin
 select patient_id into v_patient from public.appointment_series where id=p_series_id and owner_id=v_owner;
 if not found then raise exception 'Horario fijo no disponible.'; end if;
 -- Match the lock order of save_session, record_payment and schedule edits.
 perform 1 from public.patients where id=v_patient and owner_id=v_owner for update;
 select * into v_rule from public.appointment_series where id=p_series_id and owner_id=v_owner for update;
 if p_original_date is null or not isfinite(p_original_date) or p_original_date<v_rule.starts_on
  or (v_rule.ends_on is not null and p_original_date>v_rule.ends_on)
  or extract(dow from p_original_date)::integer<>v_rule.weekday then
  raise exception 'Este turno ya no pertenece al horario fijo. Actualizá la agenda.';
 end if;
 if v_rule.updated_at is distinct from p_expected_updated_at then raise exception 'El horario fijo cambió. Actualizá la agenda.'; end if;
 if exists(select 1 from public.sessions where series_id=p_series_id and original_date=p_original_date) then
  raise exception 'Este turno ya fue registrado o modificado. Actualizá la agenda antes de editarlo.';
 end if;
 if (p_data->>'patient_id')::uuid is distinct from v_patient then raise exception 'Paciente no disponible.'; end if;
 v_id := public.save_session(p_data,null);
 update public.sessions set series_id=p_series_id,original_date=p_original_date where id=v_id;
 return v_id;
end;
$$;

-- A single authoritative agenda for Inicio, calendar, and a future Apple feed.
-- The replacement lookup has NO date-range filter: a Monday moved to a later
-- week must still suppress the Monday, even when only Monday is being viewed.
create function public.agenda_occurrences(p_from date,p_to date,p_offset integer default 0) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid := private.require_access();
begin
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
  or p_to<p_from or p_to-p_from>366 or p_offset is null or p_offset<0 or p_offset>1000000 then
  raise exception 'Elegí un período de hasta un año.';
 end if;
 return query
 with projected as (
  select r.*,d.day::date as original_day,
   (d.day::date+r.local_time) at time zone r.timezone as occurrence_start,
   p.default_session_price
  from public.appointment_series r join public.patients p on p.id=r.patient_id and p.owner_id=r.owner_id
  cross join lateral generate_series(greatest(p_from-1,r.starts_on)::timestamp,
    least(p_to,coalesce(r.ends_on,p_to))::timestamp,interval '1 day') d(day)
  where r.owner_id=v_owner and extract(dow from d.day)::integer=r.weekday
   and not exists(select 1 from public.sessions s where s.series_id=r.id and s.original_date=d.day::date)
 ), entries as (
  select b.starts_at as sort_start,b.id::text as sort_id,to_jsonb(b)||jsonb_build_object('virtual',false) as value
   from public.agenda_session_balances b where b.owner_id=v_owner
    and b.starts_at < ((p_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and b.ends_at > (p_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
  union all
  select occurrence_start,id::text||':'||original_day::text,
   jsonb_build_object('id',id::text||':'||original_day::text,'patient_id',patient_id,
    'series_id',id,'original_date',original_day,'virtual',true,
    'starts_at',occurrence_start,'ends_at',occurrence_start+make_interval(mins=>duration_minutes),
    'status','programada','price',default_session_price::text,'cancellation_fee','0.00','cancellation_reason','',
    'eligible_charge','0.00','paid_amount','0.00','balance','0.00','payment_status','sin_cargo','updated_at',updated_at)
   from projected where occurrence_start+make_interval(mins=>duration_minutes) > (p_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
 )
 select value from entries order by sort_start,sort_id offset p_offset limit 500;
end;
$$;
revoke all on function public.save_patient_schedule(jsonb,uuid,jsonb),public.save_recurring_occurrence(uuid,date,jsonb,timestamptz),public.agenda_occurrences(date,date,integer) from public,anon;
grant execute on function public.save_patient_schedule(jsonb,uuid,jsonb),public.save_recurring_occurrence(uuid,date,jsonb,timestamptz),public.agenda_occurrences(date,date,integer) to authenticated;
commit;