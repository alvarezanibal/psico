-- Core release only: single professional, local appointments and collections.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict
);
-- Provision this one row manually as postgres; never through the browser.

create function public.is_app_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_owner where user_id = auth.uid());
$$;
create function public.has_app_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_app_owner() and coalesce(auth.jwt()->>'aal' = 'aal2', false);
$$;
create function private.require_access() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_app_access() then
    raise exception 'Acceso no autorizado. Verificá tu cuenta y el segundo factor.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default 'Mi consultorio' check (length(trim(display_name)) between 1 and 100)
);
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  email text not null default '' check (length(email) <= 254),
  phone text not null default '' check (length(phone) <= 40),
  default_session_price numeric(14,2) not null default 30000 check (default_session_price between 0 and 999999999999.99),
  default_duration_minutes integer not null default 50 check (default_duration_minutes between 5 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  patient_id uuid not null,
  starts_at timestamptz not null check (isfinite(starts_at)),
  ends_at timestamptz not null check (isfinite(ends_at) and ends_at > starts_at and ends_at <= starts_at + interval '4 hours'),
  origin text not null default 'manual' check (origin = 'manual'),
  status text not null default 'programada' check (status in ('programada','realizada','cancelada','ausente')),
  price numeric(14,2) not null check (price between 0 and 999999999999.99),
  cancellation_fee numeric(14,2) not null default 0 check (cancellation_fee between 0 and 999999999999.99),
  cancellation_reason text not null default '' check (length(cancellation_reason) <= 300),
  chargeable_amount numeric(14,2) generated always as (
    case when status = 'realizada' then price
      when status in ('cancelada','ausente') then cancellation_fee else 0 end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, patient_id) references public.patients(owner_id, id) on delete restrict,
  unique (owner_id, patient_id, id),
  check (cancellation_fee = 0 or (status in ('cancelada','ausente') and length(trim(cancellation_reason)) > 0))
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  patient_id uuid not null,
  paid_at timestamptz not null check (isfinite(paid_at)),
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999.99),
  method text not null check (method in ('efectivo','transferencia','otro')),
  reference text not null default '' check (length(reference) <= 200),
  idempotency_key uuid not null,
  request_payload jsonb not null,
  reversed_at timestamptz,
  reversal_reason text check (length(reversal_reason) between 1 and 300),
  created_at timestamptz not null default now(),
  foreign key (owner_id, patient_id) references public.patients(owner_id, id) on delete restrict,
  unique (owner_id, idempotency_key),
  unique (owner_id, patient_id, id),
  check ((reversed_at is null) = (reversal_reason is null))
);
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  patient_id uuid not null,
  payment_id uuid not null,
  session_id uuid not null,
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999.99),
  foreign key (owner_id, patient_id, payment_id) references public.payments(owner_id, patient_id, id) on delete restrict,
  foreign key (owner_id, patient_id, session_id) references public.sessions(owner_id, patient_id, id) on delete restrict,
  unique (payment_id, session_id)
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index patients_owner_name on public.patients(owner_id, last_name, first_name);
create index sessions_owner_date on public.sessions(owner_id, starts_at);
create index sessions_owner_status on public.sessions(owner_id, status, starts_at);
create index sessions_patient_date on public.sessions(owner_id, patient_id, starts_at);
create index payments_owner_date on public.payments(owner_id, paid_at);
create index payments_patient_date on public.payments(owner_id, patient_id, paid_at);
create index allocations_session on public.payment_allocations(owner_id, session_id);
create index audit_owner_date on public.audit_log(owner_id, created_at);

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.sessions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (user_id = auth.uid() and public.has_app_access());
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid() and public.has_app_access()) with check (user_id = auth.uid() and public.has_app_access());
create policy patients_read on public.patients for select to authenticated using (owner_id = auth.uid() and public.has_app_access());
create policy patients_insert on public.patients for insert to authenticated with check (owner_id = auth.uid() and public.has_app_access());
create policy patients_update on public.patients for update to authenticated using (owner_id = auth.uid() and public.has_app_access()) with check (owner_id = auth.uid() and public.has_app_access());
create policy sessions_read on public.sessions for select to authenticated using (owner_id = auth.uid() and public.has_app_access());
create policy payments_read on public.payments for select to authenticated using (owner_id = auth.uid() and public.has_app_access());
create policy allocations_read on public.payment_allocations for select to authenticated using (owner_id = auth.uid() and public.has_app_access());
create policy audit_read on public.audit_log for select to authenticated using (owner_id = auth.uid() and public.has_app_access());

-- Explicit grants: clients cannot bypass the transaction functions.
revoke all on public.profiles, public.patients, public.sessions, public.payments, public.payment_allocations, public.audit_log from public, anon, authenticated;
grant select on public.profiles, public.patients, public.sessions, public.payments, public.payment_allocations, public.audit_log to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant insert(first_name,last_name,email,phone,default_session_price,default_duration_minutes,active) on public.patients to authenticated;
grant update(first_name,last_name,email,phone,default_session_price,default_duration_minutes,active) on public.patients to authenticated;

-- Text money at API boundaries avoids rounding JSON numeric values in JavaScript.
create view public.session_balances with (security_invoker = true) as
with allocated as (
  select a.session_id, sum(a.amount) as paid
  from public.payment_allocations a join public.payments p on p.id = a.payment_id
  where p.reversed_at is null group by a.session_id
), balances as (
  select s.*, coalesce(a.paid,0) as paid,
    case when (s.status = 'realizada' and s.ends_at <= now())
      or (s.status in ('cancelada','ausente') and s.starts_at <= now())
      then s.chargeable_amount else 0 end as eligible_charge
  from public.sessions s left join allocated a on a.session_id = s.id
)
select id, owner_id, patient_id, starts_at, ends_at, origin, status,
  price::text, cancellation_fee::text, cancellation_reason,
  chargeable_amount::text, eligible_charge::text, paid::text as paid_amount,
  greatest(eligible_charge - paid,0)::text as balance,
  case when eligible_charge = 0 then 'sin_cargo'
    when paid >= eligible_charge then 'pagada' when paid > 0 then 'parcial' else 'pendiente' end as payment_status,
  created_at, updated_at
from balances;

create view public.patient_balances with (security_invoker = true) as
select p.id, p.owner_id, p.first_name, p.last_name, p.email, p.phone, p.active, p.created_at,
  p.default_session_price::text, p.default_duration_minutes,
  coalesce(sum(s.balance::numeric),0)::text as balance,
  count(s.id) filter (where s.balance::numeric > 0)::integer as pending_sessions,
  max(s.starts_at) filter (where s.starts_at <= now()) as last_session_at,
  min(s.starts_at) filter (where s.balance::numeric > 0) as oldest_debt_at
from public.patients p left join public.session_balances s on s.patient_id = p.id and s.owner_id = p.owner_id
group by p.id;

create view public.payment_history with (security_invoker = true) as
select id,owner_id,patient_id,paid_at,amount::text,method,reference,reversed_at,reversal_reason,created_at
from public.payments;
revoke all on public.session_balances, public.patient_balances, public.payment_history from anon, authenticated;
grant select on public.session_balances, public.patient_balances, public.payment_history to authenticated;

create function public.save_session(p_data jsonb, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := private.require_access();
  v_patient uuid := (p_data->>'patient_id')::uuid;
  v_start timestamptz := (p_data->>'starts_at')::timestamptz;
  v_end timestamptz := (p_data->>'ends_at')::timestamptz;
  v_status text := p_data->>'status';
  v_price numeric := (p_data->>'price')::numeric;
  v_fee numeric := coalesce((p_data->>'cancellation_fee')::numeric,0);
  v_reason text := coalesce(trim(p_data->>'cancellation_reason'),'');
  v_old public.sessions%rowtype;
  v_id uuid := coalesce(p_id,gen_random_uuid());
begin
  if jsonb_typeof(p_data) is distinct from 'object' or v_start is null or v_end is null or v_price is null
    or not isfinite(v_start) or not isfinite(v_end)
    or v_status is null or v_price < 0 or v_fee < 0 or v_price > 999999999999.99 or v_fee > 999999999999.99 or v_price <> round(v_price,2) or v_fee <> round(v_fee,2)
    or v_end <= v_start or v_end > v_start + interval '4 hours' or v_status not in ('programada','realizada','cancelada','ausente') then
    raise exception 'Revisá los datos de la sesión.';
  end if;
  perform 1 from public.patients where id = v_patient and owner_id = v_owner for update;
  if not found then raise exception 'Paciente no disponible.'; end if;
  if v_status = 'realizada' and v_end > now() then raise exception 'La sesión todavía no terminó.'; end if;
  if p_id is not null then
    select * into v_old from public.sessions where id = p_id and owner_id = v_owner for update;
    if not found then raise exception 'Sesión no disponible.'; end if;
    if p_data->>'expected_updated_at' is null or (p_data->>'expected_updated_at')::timestamptz <> v_old.updated_at then
      raise exception 'La sesión cambió en otra ventana. Actualizá los datos antes de editarla.';
    end if;
    if v_old.patient_id <> v_patient then raise exception 'No se puede cambiar el paciente de una sesión existente.'; end if;
    if exists (select 1 from public.payment_allocations a join public.payments p on p.id=a.payment_id
      where a.session_id=p_id and p.reversed_at is null) and
      (v_old.status <> v_status or v_old.price <> v_price or v_old.cancellation_fee <> v_fee
        or v_old.cancellation_reason <> v_reason or v_old.starts_at <> v_start or v_old.ends_at <> v_end) then
      raise exception 'Esta sesión tiene pagos. Revertí el registro incorrecto antes de modificarla.';
    end if;
    update public.sessions set starts_at=v_start,ends_at=v_end,status=v_status,price=v_price,
      cancellation_fee=v_fee,cancellation_reason=v_reason,updated_at=now() where id=p_id;
  else
    if not exists (select 1 from public.patients where id=v_patient and active) then
      raise exception 'Reactivá al paciente antes de agendar una sesión.';
    end if;
    insert into public.sessions(id,owner_id,patient_id,starts_at,ends_at,status,price,cancellation_fee,cancellation_reason)
      values(v_id,v_owner,v_patient,v_start,v_end,v_status,v_price,v_fee,v_reason);
  end if;
  insert into public.audit_log(owner_id,action,entity_id,details) values
    (v_owner,case when p_id is null then 'session.created' else 'session.updated' end,v_id,
      jsonb_build_object('status',v_status,'price',v_price,'cancellation_fee',v_fee));
  return v_id;
end;
$$;

create function public.record_payment(p_data jsonb, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := private.require_access();
  v_patient uuid := (p_data->>'patient_id')::uuid;
  v_amount numeric := (p_data->>'amount')::numeric;
  v_date timestamptz := (p_data->>'paid_at')::timestamptz;
  v_method text := p_data->>'method';
  v_allocations jsonb := p_data->'allocations';
  v_existing public.payments%rowtype;
  v_row record;
  v_balance numeric;
  v_sum numeric;
  v_id uuid := gen_random_uuid();
begin
  if jsonb_typeof(p_data) is distinct from 'object' or p_idempotency_key is null or v_amount is null
    or v_amount <= 0 or v_amount > 999999999999.99 or v_amount <> round(v_amount,2) or v_date is null or not isfinite(v_date) or v_date > now()
    or v_method is null or v_method not in ('efectivo','transferencia','otro')
    or jsonb_typeof(v_allocations) is distinct from 'array' then
    raise exception 'Revisá el importe, la fecha y el medio de pago.';
  end if;
  if jsonb_array_length(v_allocations) not between 1 and 200 then raise exception 'Seleccioná entre 1 y 200 sesiones.'; end if;
  -- A per-patient lock also serializes reversal/session changes and concurrent allocations.
  perform 1 from public.patients where id=v_patient and owner_id=v_owner for update;
  if not found then raise exception 'Paciente no disponible.'; end if;
  select * into v_existing from public.payments where owner_id=v_owner and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_payload is distinct from p_data then raise exception 'La solicitud repetida contiene datos diferentes. Revisá el historial.'; end if;
    return v_existing.id;
  end if;
  select sum(x.amount) into v_sum from jsonb_to_recordset(v_allocations) as x(session_id uuid,amount numeric);
  if v_sum is distinct from v_amount then raise exception 'El pago debe coincidir con la suma asignada a las sesiones.'; end if;
  if exists (select 1 from jsonb_to_recordset(v_allocations) as x(session_id uuid,amount numeric)
    where x.session_id is null or x.amount is null or x.amount <= 0 or x.amount <> round(x.amount,2)) then
    raise exception 'Las asignaciones deben ser importes positivos con hasta dos decimales.';
  end if;
  if (select count(distinct x.session_id) from jsonb_to_recordset(v_allocations) as x(session_id uuid,amount numeric)) <> jsonb_array_length(v_allocations) then
    raise exception 'No repitas una sesión dentro del pago.';
  end if;
  for v_row in select * from jsonb_to_recordset(v_allocations) as x(session_id uuid,amount numeric) order by session_id loop
    perform 1 from public.sessions where id=v_row.session_id and owner_id=v_owner and patient_id=v_patient for update;
    if not found then raise exception 'Todas las sesiones deben pertenecer al mismo paciente.'; end if;
    select balance::numeric into v_balance from public.session_balances where id=v_row.session_id and owner_id=v_owner;
    if v_row.amount > v_balance then raise exception 'El importe supera el saldo disponible de una sesión. Actualizá los datos.'; end if;
  end loop;
  insert into public.payments(id,owner_id,patient_id,paid_at,amount,method,reference,idempotency_key,request_payload)
    values(v_id,v_owner,v_patient,v_date,v_amount,v_method,coalesce(trim(p_data->>'reference'),''),p_idempotency_key,p_data);
  insert into public.payment_allocations(owner_id,patient_id,payment_id,session_id,amount)
    select v_owner,v_patient,v_id,x.session_id,x.amount from jsonb_to_recordset(v_allocations) as x(session_id uuid,amount numeric);
  insert into public.audit_log(owner_id,action,entity_id,details) values
    (v_owner,'payment.recorded',v_id,jsonb_build_object('amount',v_amount,'method',v_method));
  return v_id;
end;
$$;

create function public.reverse_payment(p_id uuid,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := private.require_access();
  v_patient uuid;
  v_payment public.payments%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) not between 1 and 300 then raise exception 'Indicá el motivo de la reversión (hasta 300 caracteres).'; end if;
  select patient_id into v_patient from public.payments where id=p_id and owner_id=v_owner;
  if not found then raise exception 'Pago no disponible.'; end if;
  perform 1 from public.patients where id=v_patient and owner_id=v_owner for update;
  select * into v_payment from public.payments where id=p_id and owner_id=v_owner for update;
  if v_payment.reversed_at is not null then return; end if;
  update public.payments set reversed_at=now(),reversal_reason=trim(p_reason) where id=p_id;
  insert into public.audit_log(owner_id,action,entity_id,details) values
    (v_owner,'payment.reversed',p_id,jsonb_build_object('amount',v_payment.amount,'reason',trim(p_reason)));
end;
$$;

create function public.dashboard_summary() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_month timestamptz := date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
  v_next timestamptz := (date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires') + interval '1 month') at time zone 'America/Argentina/Buenos_Aires';
begin
  if not public.has_app_access() then raise exception 'Acceso no autorizado.' using errcode='42501'; end if;
  return jsonb_build_object(
    'total_debt',(select coalesce(sum(balance::numeric),0)::text from public.patient_balances),
    'debtors',(select count(*) from public.patient_balances where balance::numeric > 0),
    'unpaid_sessions',(select count(*) from public.session_balances where balance::numeric > 0),
    'collected_month',(select coalesce(sum(amount),0)::text from public.payments where reversed_at is null and paid_at >= v_month and paid_at < v_next),
    'active_patients',(select count(*) from public.patients where active),
    'completed_month',(select count(*) from public.sessions where status='realizada' and ends_at <= now() and starts_at >= v_month and starts_at < v_next)
  );
end;
$$;

revoke all on function public.is_app_owner(),public.has_app_access(),public.save_session(jsonb,uuid),public.record_payment(jsonb,uuid),public.reverse_payment(uuid,text),public.dashboard_summary() from public,anon;
grant execute on function public.is_app_owner(),public.has_app_access(),public.save_session(jsonb,uuid),public.record_payment(jsonb,uuid),public.reverse_payment(uuid,text),public.dashboard_summary() to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;

commit;
