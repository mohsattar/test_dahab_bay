-- Security verification queries (read-only)

-- 1) Auth profiles and roles.
select auth_user_id, username, fullname, role, is_active
from public.profiles
order by username;

-- 2) Confirm PII is stored as ciphertext (bytea), not readable text.
select
  id,
  room,
  pg_typeof(name_enc) as name_storage_type,
  octet_length(name_enc) as encrypted_name_bytes,
  octet_length(id_number_enc) as encrypted_id_bytes,
  created_at
from public.booking_records
order by id desc
limit 10;

-- 3) Confirm RLS is enabled.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in ('profiles','booking_records','audit_log')
order by tablename;

-- 4) Confirm browser roles have no direct table privileges.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('profiles','booking_records','audit_log')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- Expected result for query 4: no rows.

-- 5) Confirm only authenticated can execute the intended API functions.
select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where specific_schema='public'
  and routine_name like 'api_%'
order by routine_name, grantee;

-- 6) Check the encrypted-storage migration count.
select count(*) as secure_booking_count from public.booking_records;

-- 7) Check whether plaintext legacy tables still exist.
select
  to_regclass('public.legacy_users_plaintext') as legacy_users,
  to_regclass('public.legacy_bookings_plaintext') as legacy_bookings,
  to_regclass('public.legacy_guests_plaintext') as legacy_guests;

-- After full application verification, run 003_drop_legacy_plaintext.sql.

-- 8) Confirm Vault decrypted secrets are inaccessible to browser/server API roles.
select
  role_name,
  has_schema_privilege(role_name, 'vault', 'USAGE') as vault_schema_usage,
  has_table_privilege(role_name, 'vault.decrypted_secrets', 'SELECT') as can_read_decrypted_secrets
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);

-- Expected for query 8: false / false for every listed role.
-- The private SECURITY DEFINER encryption functions remain owned by postgres and can read the key.
