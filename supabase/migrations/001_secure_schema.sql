-- Dahab Bay secure schema migration
-- Target: TEST Supabase project only.
-- This migration introduces Supabase Auth profiles, encrypted booking storage,
-- server-side transactional RPCs, audit logging, RLS, and least-privilege grants.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Vault's decrypted view must never be accessible to browser roles.
revoke all on schema vault from anon, authenticated, service_role;
revoke all on vault.decrypted_secrets from anon, authenticated, service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Generate a 256-bit PII encryption key and keep it encrypted in Supabase Vault.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'dahab_bay_pii_key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'dahab_bay_pii_key',
      'AES-256-compatible key used by Dahab Bay PII encryption functions'
    );
  end if;
end $$;

create or replace function private.pii_key()
returns text
language sql
stable
security definer
set search_path = pg_catalog, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'dahab_bay_pii_key'
  limit 1
$$;

create or replace function private.encrypt_text(p_value text)
returns bytea
language sql
volatile
security definer
set search_path = pg_catalog, extensions, private
as $$
  select case
    when p_value is null or p_value = '' then null
    else extensions.pgp_sym_encrypt(
      p_value,
      private.pii_key(),
      'cipher-algo=aes256,compress-algo=1'
    )
  end
$$;

create or replace function private.decrypt_text(p_value bytea)
returns text
language sql
stable
security definer
set search_path = pg_catalog, extensions, private
as $$
  select case
    when p_value is null then null
    else extensions.pgp_sym_decrypt(p_value, private.pii_key())
  end
$$;

create or replace function private.assert_text_length(
  p_value text,
  p_field text,
  p_min integer,
  p_max integer
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare v_length integer := char_length(coalesce(p_value,''));
begin
  if v_length < p_min or v_length > p_max then
    raise exception using errcode='22023', message='INVALID_' || upper(p_field);
  end if;
end $$;

create or replace function private.validate_guests(p_value jsonb)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_value jsonb := coalesce(p_value, '[]'::jsonb);
  v_item jsonb;
begin
  if jsonb_typeof(v_value) <> 'array'
     or jsonb_array_length(v_value) > 10
     or octet_length(v_value::text) > 20000 then
    raise exception using errcode='22023', message='INVALID_GUESTS';
  end if;

  for v_item in select value from jsonb_array_elements(v_value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode='22023', message='INVALID_GUESTS';
    end if;
    perform private.assert_text_length(trim(v_item->>'name'),'guest_name',0,160);
    perform private.assert_text_length(trim(v_item->>'phone'),'guest_phone',0,40);
    perform private.assert_text_length(trim(v_item->>'nationality'),'guest_nationality',0,80);
    perform private.assert_text_length(trim(v_item->>'idNumber'),'guest_id_number',0,100);
    perform private.assert_text_length(trim(v_item->>'address'),'guest_address',0,500);
    if coalesce(nullif(v_item->>'idType',''),'national') not in ('national','passport') then
      raise exception using errcode='22023', message='INVALID_GUEST_ID_TYPE';
    end if;
  end loop;
end $$;

create or replace function private.validate_trips(p_value jsonb)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_value jsonb := coalesce(p_value, '[]'::jsonb);
  v_item jsonb;
  v_price numeric;
begin
  if jsonb_typeof(v_value) <> 'array'
     or jsonb_array_length(v_value) > 20
     or octet_length(v_value::text) > 20000 then
    raise exception using errcode='22023', message='INVALID_TRIPS';
  end if;

  for v_item in select value from jsonb_array_elements(v_value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode='22023', message='INVALID_TRIPS';
    end if;
    perform private.assert_text_length(trim(v_item->>'name'),'trip_name',1,200);
    if coalesce(v_item->>'date','') <> '' then
      begin
        perform (v_item->>'date')::date;
      exception when others then
        raise exception using errcode='22023', message='INVALID_TRIP_DATE';
      end;
    end if;
    if coalesce(v_item->>'price','') <> '' then
      begin
        v_price := (v_item->>'price')::numeric;
      exception when others then
        raise exception using errcode='22023', message='INVALID_TRIP_PRICE';
      end;
      if v_price < 0 or v_price > 100000000 then
        raise exception using errcode='22023', message='INVALID_TRIP_PRICE';
      end if;
    end if;
  end loop;
end $$;

-- Preserve original tables for controlled rollback.
do $$
begin
  if to_regclass('public.users') is not null
     and to_regclass('public.legacy_users_plaintext') is null
     and to_regclass('public.profiles') is null then
    alter table public.users rename to legacy_users_plaintext;
  end if;

  if to_regclass('public.bookings') is not null
     and to_regclass('public.legacy_bookings_plaintext') is null
     and to_regclass('public.booking_records') is null then
    alter table public.bookings rename to legacy_bookings_plaintext;
  end if;

  if to_regclass('public.guests') is not null
     and to_regclass('public.legacy_guests_plaintext') is null then
    alter table public.guests rename to legacy_guests_plaintext;
  end if;
end $$;

create table if not exists public.profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext not null unique,
  fullname text not null check (char_length(fullname) between 1 and 120),
  role text not null default 'staff' check (role in ('admin','staff')),
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_active_idx
  on public.profiles(role, is_active);

create table if not exists public.booking_records (
  id bigint generated by default as identity primary key,
  room integer not null check ((room between 1 and 10) or (room between 101 and 131)),
  room_type text not null check (room_type in ('double_twin','double_queen','double','triple','quad','villa','sea_view_family')),
  room_view text not null check (room_view in ('sea_view','sea_side','garden','pool_view')),
  board_type text not null default 'bb' check (board_type in ('bb','hb','fb')),

  name_enc bytea not null,
  phone_enc bytea,
  nationality_enc bytea,
  id_type text not null default 'national' check (id_type in ('national','passport')),
  id_number_enc bytea,
  address_enc bytea,

  checkin date not null,
  checkout date not null,
  amount numeric(14,2) check (amount is null or amount >= 0),
  notes_enc bytea,
  status text not null default 'active' check (status in ('active','done','cancelled','deleted')),
  group_id text,

  resp_name_enc bytea,
  resp_nationality_enc bytea,
  resp_id_type text check (resp_id_type is null or resp_id_type in ('national','passport')),
  resp_id_number_enc bytea,
  resp_address_enc bytea,

  guests_enc bytea,
  trips jsonb not null default '[]'::jsonb check (jsonb_typeof(trips) = 'array'),

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,

  constraint booking_dates_valid check (checkout > checkin)
);

create index if not exists booking_records_room_dates_idx
  on public.booking_records(room, checkin, checkout)
  where deleted_at is null and status <> 'done';

create index if not exists booking_records_group_idx
  on public.booking_records(group_id)
  where deleted_at is null and group_id is not null;

create index if not exists booking_records_status_idx
  on public.booking_records(status, checkin, checkout)
  where deleted_at is null;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_username text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id, created_at desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists(
    select 1 from public.profiles
    where auth_user_id = auth.uid() and is_active
  )
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists(
    select 1 from public.profiles
    where auth_user_id = auth.uid() and is_active and role = 'admin'
  )
$$;

create or replace function private.current_username()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select username::text
  from public.profiles
  where auth_user_id = auth.uid() and is_active
$$;

create or replace function private.require_active_user()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
end $$;

create or replace function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_active_user();
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
end $$;

create or replace function private.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $$
  insert into public.audit_log(actor_id, actor_username, action, entity_type, entity_id, details)
  values(auth.uid(), private.current_username(), p_action, p_entity_type, p_entity_id, coalesce(p_details,'{}'::jsonb))
$$;

create or replace function private.booking_json(p_row public.booking_records)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'room', p_row.room,
    'room_type', p_row.room_type,
    'room_view', p_row.room_view,
    'board_type', p_row.board_type,
    'name', private.decrypt_text(p_row.name_enc),
    'phone', private.decrypt_text(p_row.phone_enc),
    'nationality', private.decrypt_text(p_row.nationality_enc),
    'id_type', p_row.id_type,
    'id_number', private.decrypt_text(p_row.id_number_enc),
    'address', private.decrypt_text(p_row.address_enc),
    'checkin', p_row.checkin,
    'checkout', p_row.checkout,
    'amount', p_row.amount,
    'notes', private.decrypt_text(p_row.notes_enc),
    'status', p_row.status,
    'group_id', p_row.group_id,
    'resp_name', private.decrypt_text(p_row.resp_name_enc),
    'resp_nationality', private.decrypt_text(p_row.resp_nationality_enc),
    'resp_id_type', p_row.resp_id_type,
    'resp_id_number', private.decrypt_text(p_row.resp_id_number_enc),
    'resp_address', private.decrypt_text(p_row.resp_address_enc),
    'guests', coalesce(nullif(private.decrypt_text(p_row.guests_enc),'')::jsonb, '[]'::jsonb),
    'trips', coalesce(p_row.trips, '[]'::jsonb),
    'version', p_row.version,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  )
$$;

-- Migrate existing booking records once, preserving IDs.
do $$
begin
  if to_regclass('public.legacy_bookings_plaintext') is not null
     and not exists (select 1 from public.booking_records) then
    execute $migration$
      insert into public.booking_records(
        id, room, room_type, room_view, board_type,
        name_enc, phone_enc, nationality_enc, id_type, id_number_enc, address_enc,
        checkin, checkout, amount, notes_enc, status, group_id,
        resp_name_enc, resp_nationality_enc, resp_id_type, resp_id_number_enc, resp_address_enc,
        guests_enc, trips, created_by, updated_by, created_at, updated_at
      )
      select
        b.id, b.room, b.room_type, b.room_view, coalesce(b.board_type,'bb'),
        private.encrypt_text(coalesce(nullif(trim(b.name),''),'—')), private.encrypt_text(b.phone), private.encrypt_text(b.nationality),
        coalesce(b.id_type,'national'), private.encrypt_text(b.id_number), private.encrypt_text(b.address),
        b.checkin::date, b.checkout::date, b.amount, private.encrypt_text(b.notes),
        case when b.status = 'done' then 'done' else 'active' end, b.group_id,
        private.encrypt_text(b.resp_name), private.encrypt_text(b.resp_nationality), b.resp_id_type,
        private.encrypt_text(b.resp_id_number), private.encrypt_text(b.resp_address),
        private.encrypt_text(coalesce(b.guests,'[]'::jsonb)::text),
        coalesce(b.trips,'[]'::jsonb),
        (select id from auth.users order by created_at limit 1),
        (select id from auth.users order by created_at limit 1),
        now(), now()
      from public.legacy_bookings_plaintext b
    $migration$;
  end if;
end $$;

-- Align identity sequence after preserving existing IDs.
select setval(
  pg_get_serial_sequence('public.booking_records','id'),
  coalesce((select max(id) from public.booking_records), 1),
  exists(select 1 from public.booking_records)
);

-- Remove old plaintext passwords immediately. Auth passwords are managed and hashed by Supabase Auth.
do $$
begin
  if to_regclass('public.legacy_users_plaintext') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='legacy_users_plaintext' and column_name='password'
     ) then
    execute 'update public.legacy_users_plaintext set password = ''MIGRATED_TO_SUPABASE_AUTH''';
  end if;
end $$;

-- Public RPC: current safe profile.
create or replace function public.api_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_profile public.profiles;
begin
  perform private.require_active_user();
  select * into strict v_profile
  from public.profiles
  where auth_user_id = auth.uid();

  return jsonb_build_object(
    'auth_user_id', v_profile.auth_user_id,
    'username', v_profile.username::text,
    'fullname', v_profile.fullname,
    'role', v_profile.role,
    'is_active', v_profile.is_active
  );
end $$;

create or replace function public.api_list_bookings()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare v_result jsonb;
begin
  perform private.require_active_user();
  select coalesce(jsonb_agg(private.booking_json(b) order by b.id desc),'[]'::jsonb)
  into v_result
  from public.booking_records b
  where b.deleted_at is null and b.status <> 'deleted';
  return v_result;
end $$;

create or replace function public.api_create_bookings(p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_item jsonb;
  v_created jsonb := '[]'::jsonb;
  v_row public.booking_records;
  v_room integer;
  v_checkin date;
  v_checkout date;
  v_group_id text;
  v_count integer;
begin
  perform private.require_active_user();
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode='22023', message='INVALID_PAYLOAD';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 20 then
    raise exception using errcode='22023', message='INVALID_BOOKING_COUNT';
  end if;

  -- Lock all requested rooms in numeric order to serialize concurrent reservations.
  for v_room in
    select distinct (value->>'room')::integer
    from jsonb_array_elements(p_rows)
    order by 1
  loop
    perform pg_advisory_xact_lock(v_room);
  end loop;

  if v_count > 1 then
    v_group_id := 'GRP-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' ||
                  upper(substr(encode(extensions.gen_random_bytes(4),'hex'),1,8));
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_room := (v_item->>'room')::integer;
    v_checkin := (v_item->>'checkin')::date;
    v_checkout := (v_item->>'checkout')::date;

    if v_checkout <= v_checkin then
      raise exception using errcode='22023', message='INVALID_DATES';
    end if;

    perform private.assert_text_length(trim(v_item->>'name'),'name',1,160);
    perform private.assert_text_length(trim(v_item->>'phone'),'phone',0,40);
    perform private.assert_text_length(trim(v_item->>'nationality'),'nationality',0,80);
    perform private.assert_text_length(trim(v_item->>'id_number'),'id_number',0,100);
    perform private.assert_text_length(trim(v_item->>'address'),'address',0,500);
    perform private.assert_text_length(v_item->>'notes','notes',0,2000);
    perform private.assert_text_length(trim(v_item->>'resp_name'),'resp_name',0,160);
    perform private.assert_text_length(trim(v_item->>'resp_nationality'),'resp_nationality',0,80);
    perform private.assert_text_length(trim(v_item->>'resp_id_number'),'resp_id_number',0,100);
    perform private.assert_text_length(trim(v_item->>'resp_address'),'resp_address',0,500);
    perform private.validate_guests(coalesce(v_item->'guests','[]'::jsonb));
    perform private.validate_trips(coalesce(v_item->'trips','[]'::jsonb));

    if exists(
      select 1 from public.booking_records b
      where b.deleted_at is null
        and b.status not in ('done','cancelled','deleted')
        and b.room = v_room
        and b.checkin < v_checkout
        and b.checkout > v_checkin
    ) then
      raise exception using errcode='P0001', message='ROOM_CONFLICT';
    end if;

    insert into public.booking_records(
      room, room_type, room_view, board_type,
      name_enc, phone_enc, nationality_enc, id_type, id_number_enc, address_enc,
      checkin, checkout, amount, notes_enc, status, group_id,
      resp_name_enc, resp_nationality_enc, resp_id_type, resp_id_number_enc, resp_address_enc,
      guests_enc, trips, created_by, updated_by
    ) values (
      v_room,
      v_item->>'room_type',
      v_item->>'room_view',
      coalesce(nullif(v_item->>'board_type',''),'bb'),
      private.encrypt_text(nullif(trim(v_item->>'name'),'')),
      private.encrypt_text(nullif(trim(v_item->>'phone'),'')),
      private.encrypt_text(nullif(trim(v_item->>'nationality'),'')),
      coalesce(nullif(v_item->>'id_type',''),'national'),
      private.encrypt_text(nullif(trim(v_item->>'id_number'),'')),
      private.encrypt_text(nullif(trim(v_item->>'address'),'')),
      v_checkin, v_checkout,
      nullif(v_item->>'amount','')::numeric,
      private.encrypt_text(nullif(v_item->>'notes','')),
      'active', v_group_id,
      private.encrypt_text(nullif(trim(v_item->>'resp_name'),'')),
      private.encrypt_text(nullif(trim(v_item->>'resp_nationality'),'')),
      nullif(v_item->>'resp_id_type',''),
      private.encrypt_text(nullif(trim(v_item->>'resp_id_number'),'')),
      private.encrypt_text(nullif(trim(v_item->>'resp_address'),'')),
      private.encrypt_text(coalesce(v_item->'guests','[]'::jsonb)::text),
      coalesce(v_item->'trips','[]'::jsonb),
      auth.uid(), auth.uid()
    )
    returning * into v_row;

    v_created := v_created || jsonb_build_array(private.booking_json(v_row));
    perform private.write_audit('create','booking',v_row.id::text,jsonb_build_object('room',v_row.room,'group_id',v_row.group_id));
  end loop;

  return v_created;
end $$;

create or replace function public.api_update_booking(p_id bigint, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_old public.booking_records;
  v_new public.booking_records;
  v_room integer;
  v_checkin date;
  v_checkout date;
  v_expected bigint;
begin
  perform private.require_active_user();
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode='22023', message='INVALID_PAYLOAD';
  end if;

  select * into strict v_old
  from public.booking_records
  where id=p_id and deleted_at is null
  for update;

  if p_payload ? 'expected_version' then
    v_expected := (p_payload->>'expected_version')::bigint;
    if v_expected <> v_old.version then
      raise exception using errcode='P0001', message='VERSION_CONFLICT';
    end if;
  end if;

  v_room := coalesce(nullif(p_payload->>'room','')::integer, v_old.room);
  v_checkin := coalesce(nullif(p_payload->>'checkin','')::date, v_old.checkin);
  v_checkout := coalesce(nullif(p_payload->>'checkout','')::date, v_old.checkout);

  if v_checkout <= v_checkin then
    raise exception using errcode='22023', message='INVALID_DATES';
  end if;

  if p_payload ? 'name' then perform private.assert_text_length(trim(p_payload->>'name'),'name',1,160); end if;
  if p_payload ? 'phone' then perform private.assert_text_length(trim(p_payload->>'phone'),'phone',0,40); end if;
  if p_payload ? 'nationality' then perform private.assert_text_length(trim(p_payload->>'nationality'),'nationality',0,80); end if;
  if p_payload ? 'id_number' then perform private.assert_text_length(trim(p_payload->>'id_number'),'id_number',0,100); end if;
  if p_payload ? 'address' then perform private.assert_text_length(trim(p_payload->>'address'),'address',0,500); end if;
  if p_payload ? 'notes' then perform private.assert_text_length(p_payload->>'notes','notes',0,2000); end if;
  if p_payload ? 'resp_name' then perform private.assert_text_length(trim(p_payload->>'resp_name'),'resp_name',0,160); end if;
  if p_payload ? 'resp_nationality' then perform private.assert_text_length(trim(p_payload->>'resp_nationality'),'resp_nationality',0,80); end if;
  if p_payload ? 'resp_id_number' then perform private.assert_text_length(trim(p_payload->>'resp_id_number'),'resp_id_number',0,100); end if;
  if p_payload ? 'resp_address' then perform private.assert_text_length(trim(p_payload->>'resp_address'),'resp_address',0,500); end if;
  if p_payload ? 'guests' then
    perform private.validate_guests(coalesce(p_payload->'guests','[]'::jsonb));
  end if;
  if p_payload ? 'trips' then
    perform private.validate_trips(coalesce(p_payload->'trips','[]'::jsonb));
  end if;

  perform pg_advisory_xact_lock(v_room);

  if exists(
    select 1 from public.booking_records b
    where b.id <> p_id
      and b.deleted_at is null
      and b.status not in ('done','cancelled','deleted')
      and b.room=v_room
      and b.checkin < v_checkout
      and b.checkout > v_checkin
  ) then
    raise exception using errcode='P0001', message='ROOM_CONFLICT';
  end if;

  update public.booking_records set
    room = v_room,
    room_type = coalesce(nullif(p_payload->>'room_type',''), room_type),
    room_view = coalesce(nullif(p_payload->>'room_view',''), room_view),
    board_type = coalesce(nullif(p_payload->>'board_type',''), board_type),
    name_enc = case when p_payload ? 'name' then private.encrypt_text(nullif(trim(p_payload->>'name'),'')) else name_enc end,
    phone_enc = case when p_payload ? 'phone' then private.encrypt_text(nullif(trim(p_payload->>'phone'),'')) else phone_enc end,
    nationality_enc = case when p_payload ? 'nationality' then private.encrypt_text(nullif(trim(p_payload->>'nationality'),'')) else nationality_enc end,
    id_type = case when p_payload ? 'id_type' then coalesce(nullif(p_payload->>'id_type',''),'national') else id_type end,
    id_number_enc = case when p_payload ? 'id_number' then private.encrypt_text(nullif(trim(p_payload->>'id_number'),'')) else id_number_enc end,
    address_enc = case when p_payload ? 'address' then private.encrypt_text(nullif(trim(p_payload->>'address'),'')) else address_enc end,
    checkin = v_checkin,
    checkout = v_checkout,
    amount = case when p_payload ? 'amount' then nullif(p_payload->>'amount','')::numeric else amount end,
    notes_enc = case when p_payload ? 'notes' then private.encrypt_text(nullif(p_payload->>'notes','')) else notes_enc end,
    resp_name_enc = case when p_payload ? 'resp_name' then private.encrypt_text(nullif(trim(p_payload->>'resp_name'),'')) else resp_name_enc end,
    resp_nationality_enc = case when p_payload ? 'resp_nationality' then private.encrypt_text(nullif(trim(p_payload->>'resp_nationality'),'')) else resp_nationality_enc end,
    resp_id_type = case when p_payload ? 'resp_id_type' then nullif(p_payload->>'resp_id_type','') else resp_id_type end,
    resp_id_number_enc = case when p_payload ? 'resp_id_number' then private.encrypt_text(nullif(trim(p_payload->>'resp_id_number'),'')) else resp_id_number_enc end,
    resp_address_enc = case when p_payload ? 'resp_address' then private.encrypt_text(nullif(trim(p_payload->>'resp_address'),'')) else resp_address_enc end,
    guests_enc = case when p_payload ? 'guests' then private.encrypt_text(coalesce(p_payload->'guests','[]'::jsonb)::text) else guests_enc end,
    trips = case when p_payload ? 'trips' then coalesce(p_payload->'trips','[]'::jsonb) else trips end,
    updated_by = auth.uid(),
    updated_at = now(),
    version = version + 1
  where id=p_id
  returning * into v_new;

  perform private.write_audit('update','booking',p_id::text,jsonb_build_object('room',v_new.room,'version',v_new.version));
  return private.booking_json(v_new);
end $$;

create or replace function public.api_checkout_booking(p_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_row public.booking_records;
begin
  perform private.require_active_user();
  update public.booking_records
  set status='done', updated_by=auth.uid(), updated_at=now(), version=version+1
  where id=p_id and deleted_at is null
  returning * into strict v_row;
  perform private.write_audit('checkout','booking',p_id::text,jsonb_build_object('room',v_row.room));
  return private.booking_json(v_row);
end $$;

create or replace function public.api_delete_booking(p_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_row public.booking_records;
begin
  perform private.require_admin();
  update public.booking_records
  set status='deleted', deleted_at=now(), updated_by=auth.uid(), updated_at=now(), version=version+1
  where id=p_id and deleted_at is null
  returning * into strict v_row;
  perform private.write_audit('delete','booking',p_id::text,jsonb_build_object('room',v_row.room));
  return jsonb_build_object('ok',true,'id',p_id);
end $$;

create or replace function public.api_checkout_group(p_group_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_count integer;
begin
  perform private.require_active_user();
  update public.booking_records
  set status='done', updated_by=auth.uid(), updated_at=now(), version=version+1
  where group_id=p_group_id and deleted_at is null and status <> 'done';
  get diagnostics v_count = row_count;
  perform private.write_audit('checkout_group','booking_group',p_group_id,jsonb_build_object('count',v_count));
  return jsonb_build_object('ok',true,'count',v_count);
end $$;

create or replace function public.api_delete_group(p_group_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_count integer;
begin
  perform private.require_admin();
  update public.booking_records
  set status='deleted', deleted_at=now(), updated_by=auth.uid(), updated_at=now(), version=version+1
  where group_id=p_group_id and deleted_at is null;
  get diagnostics v_count = row_count;
  perform private.write_audit('delete_group','booking_group',p_group_id,jsonb_build_object('count',v_count));
  return jsonb_build_object('ok',true,'count',v_count);
end $$;

create or replace function public.api_add_group_room(p_base_id bigint, p_row jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_base public.booking_records;
  v_new public.booking_records;
  v_room integer;
  v_group_id text;
begin
  perform private.require_active_user();
  if p_row is null or jsonb_typeof(p_row) <> 'object' then
    raise exception using errcode='22023', message='INVALID_PAYLOAD';
  end if;
  select * into strict v_base
  from public.booking_records
  where id=p_base_id and deleted_at is null
  for update;

  v_room := (p_row->>'room')::integer;
  perform private.assert_text_length(trim(p_row->>'name'),'name',1,160);
  perform private.assert_text_length(trim(p_row->>'phone'),'phone',0,40);
  perform private.assert_text_length(trim(p_row->>'nationality'),'nationality',0,80);
  perform private.assert_text_length(trim(p_row->>'id_number'),'id_number',0,100);
  perform private.assert_text_length(trim(p_row->>'address'),'address',0,500);
  perform private.validate_guests(coalesce(p_row->'guests','[]'::jsonb));
  perform private.validate_trips(coalesce(p_row->'trips','[]'::jsonb));
  perform pg_advisory_xact_lock(v_room);

  if exists(
    select 1 from public.booking_records b
    where b.deleted_at is null
      and b.status not in ('done','cancelled','deleted')
      and b.room=v_room
      and b.checkin < v_base.checkout
      and b.checkout > v_base.checkin
  ) then
    raise exception using errcode='P0001', message='ROOM_CONFLICT';
  end if;

  v_group_id := coalesce(v_base.group_id,
    'GRP-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' ||
    upper(substr(encode(extensions.gen_random_bytes(4),'hex'),1,8))
  );

  if v_base.group_id is null then
    update public.booking_records
    set group_id=v_group_id, updated_by=auth.uid(), updated_at=now(), version=version+1
    where id=v_base.id;
  end if;

  insert into public.booking_records(
    room, room_type, room_view, board_type,
    name_enc, phone_enc, nationality_enc, id_type, id_number_enc, address_enc,
    checkin, checkout, amount, notes_enc, status, group_id,
    resp_name_enc, resp_nationality_enc, resp_id_type, resp_id_number_enc, resp_address_enc,
    guests_enc, trips, created_by, updated_by
  ) values (
    v_room, p_row->>'room_type', p_row->>'room_view', coalesce(nullif(p_row->>'board_type',''),'bb'),
    private.encrypt_text(nullif(trim(p_row->>'name'),'')),
    private.encrypt_text(nullif(trim(p_row->>'phone'),'')),
    private.encrypt_text(nullif(trim(p_row->>'nationality'),'')),
    coalesce(nullif(p_row->>'id_type',''),'national'),
    private.encrypt_text(nullif(trim(p_row->>'id_number'),'')),
    private.encrypt_text(nullif(trim(p_row->>'address'),'')),
    v_base.checkin, v_base.checkout, nullif(p_row->>'amount','')::numeric,
    private.encrypt_text(nullif(p_row->>'notes','')), 'active', v_group_id,
    v_base.resp_name_enc, v_base.resp_nationality_enc, v_base.resp_id_type,
    v_base.resp_id_number_enc, v_base.resp_address_enc,
    private.encrypt_text(coalesce(p_row->'guests','[]'::jsonb)::text),
    coalesce(p_row->'trips','[]'::jsonb), auth.uid(), auth.uid()
  ) returning * into v_new;

  perform private.write_audit('add_group_room','booking',v_new.id::text,jsonb_build_object('room',v_new.room,'group_id',v_group_id));
  return jsonb_build_object('group_id',v_group_id,'booking',private.booking_json(v_new));
end $$;

create or replace function public.api_list_audit(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare v_result jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select id, actor_username, action, entity_type, entity_id, details, created_at
    from public.audit_log
    order by created_at desc
    limit least(greatest(coalesce(p_limit,200),1),1000)
  ) x;
  return v_result;
end $$;

-- RLS and least privilege: no direct table access from browser roles.
alter table public.profiles enable row level security;
alter table public.booking_records enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.booking_records from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Edge Functions use the server-only service role for administrator operations.
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.booking_records to service_role;
grant select, insert, update, delete on public.audit_log to service_role;
grant usage, select on all sequences in schema public to service_role;

do $$
declare t text;
begin
  foreach t in array array['legacy_users_plaintext','legacy_bookings_plaintext','legacy_guests_plaintext']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('revoke all on public.%I from anon, authenticated',t);
    end if;
  end loop;
end $$;

revoke all on function private.pii_key() from public, anon, authenticated;
revoke all on function private.encrypt_text(text) from public, anon, authenticated;
revoke all on function private.decrypt_text(bytea) from public, anon, authenticated;
revoke all on function private.assert_text_length(text,text,integer,integer) from public, anon, authenticated;
revoke all on function private.validate_guests(jsonb) from public, anon, authenticated;
revoke all on function private.validate_trips(jsonb) from public, anon, authenticated;
revoke all on function private.is_active_user() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.current_username() from public, anon, authenticated;
revoke all on function private.require_active_user() from public, anon, authenticated;
revoke all on function private.require_admin() from public, anon, authenticated;
revoke all on function private.write_audit(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function private.booking_json(public.booking_records) from public, anon, authenticated;

revoke all on function public.api_my_profile() from public, anon;
revoke all on function public.api_list_bookings() from public, anon;
revoke all on function public.api_create_bookings(jsonb) from public, anon;
revoke all on function public.api_update_booking(bigint,jsonb) from public, anon;
revoke all on function public.api_checkout_booking(bigint) from public, anon;
revoke all on function public.api_delete_booking(bigint) from public, anon;
revoke all on function public.api_checkout_group(text) from public, anon;
revoke all on function public.api_delete_group(text) from public, anon;
revoke all on function public.api_add_group_room(bigint,jsonb) from public, anon;
revoke all on function public.api_list_audit(integer) from public, anon;

grant execute on function public.api_my_profile() to authenticated;
grant execute on function public.api_list_bookings() to authenticated;
grant execute on function public.api_create_bookings(jsonb) to authenticated;
grant execute on function public.api_update_booking(bigint,jsonb) to authenticated;
grant execute on function public.api_checkout_booking(bigint) to authenticated;
grant execute on function public.api_delete_booking(bigint) to authenticated;
grant execute on function public.api_checkout_group(text) to authenticated;
grant execute on function public.api_delete_group(text) to authenticated;
grant execute on function public.api_add_group_room(bigint,jsonb) to authenticated;
grant execute on function public.api_list_audit(integer) to authenticated;

commit;

-- Force PostgREST to refresh function/schema metadata.
notify pgrst, 'reload schema';
