-- Run after 001_secure_schema.sql and after creating the three Auth users in:
-- Supabase Dashboard -> Authentication -> Users.
--
-- Required Auth emails:
--   dahabbay@dahabbay.example.com
--   abdo@dahabbay.example.com
--   walid@dahabbay.example.com
--
-- Use NEW strong passwords. Do not reuse plaintext passwords from legacy_users_plaintext.

insert into public.profiles(auth_user_id, username, fullname, role, is_active)
select id, 'dahabbay', 'reception', 'admin', true
from auth.users where lower(email)='dahabbay@dahabbay.example.com'
on conflict (auth_user_id) do update
set username=excluded.username, fullname=excluded.fullname, role=excluded.role, is_active=true;

insert into public.profiles(auth_user_id, username, fullname, role, is_active)
select id, 'abdo', 'Owner', 'admin', true
from auth.users where lower(email)='abdo@dahabbay.example.com'
on conflict (auth_user_id) do update
set username=excluded.username, fullname=excluded.fullname, role=excluded.role, is_active=true;

insert into public.profiles(auth_user_id, username, fullname, role, is_active)
select id, 'walid', 'walid', 'staff', true
from auth.users where lower(email)='walid@dahabbay.example.com'
on conflict (auth_user_id) do update
set username=excluded.username, fullname=excluded.fullname, role=excluded.role, is_active=true;

-- Verify that all Auth users were found and profiles were created.
select auth_user_id, username, fullname, role, is_active, created_at
from public.profiles
order by role, username;
