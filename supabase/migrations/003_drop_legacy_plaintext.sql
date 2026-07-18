-- FINAL CLEANUP: run only after the secure test application is fully verified
-- and after taking a fresh secure backup.
--
-- These legacy tables may still contain plaintext guest/user data.
-- Dropping them completes the plaintext-data cleanup.

begin;

drop table if exists public.legacy_guests_plaintext cascade;
drop table if exists public.legacy_bookings_plaintext cascade;
drop table if exists public.legacy_users_plaintext cascade;

commit;

notify pgrst, 'reload schema';
