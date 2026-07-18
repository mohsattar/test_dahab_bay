# Backup and Recovery After Encryption

## What the existing scheduled backup now contains

The scheduled custom-format backup of the `public` schema contains:

- `profiles`
- encrypted `booking_records`
- `audit_log`
- public RPC functions
- RLS/table definitions in the public schema

It does not provide a complete standalone clone of:

- Supabase Auth users/password hashes in the `auth` schema
- the usable plaintext PII encryption key stored through Vault
- Edge Functions
- Edge Function secrets
- Vercel files

## Mandatory recovery assets

Keep these items separately:

1. PostgreSQL `.backup` file.
2. The `dahab_bay_pii_key` recovery value in a company password manager.
3. This GitHub repository/package.
4. A list of required Auth usernames and roles.
5. Edge Function deployment instructions.
6. The exact approved Vercel origin.

Never store the recovery key beside the `.backup` file.

## Recommended backup layers

### Layer 1 — Supabase managed project backups

Use Supabase managed backups as the primary full-project recovery method when available. These are better suited to the managed Auth and Vault environment.

### Layer 2 — Scheduled logical public-schema backup

Continue the current scheduled `pg_dump`/pgAdmin custom backup for application data.

Because guest PII is encrypted, the backup does not reveal the values without the separate recovery key.

### Layer 3 — GitHub/Vercel source

The secure frontend, SQL migrations and Edge Function must remain version controlled.

## Restore to another Supabase project

1. Create the replacement Supabase project.
2. Create at least one Auth admin user.
3. Run `001_secure_schema.sql`.
4. Replace the automatically generated Vault PII key with the saved recovery key:

```sql
select id
from vault.decrypted_secrets
where name='dahab_bay_pii_key';
```

Then use the returned ID:

```sql
select vault.update_secret(
  'PASTE_SECRET_ID_HERE'::uuid,
  'PASTE_SAVED_RECOVERY_KEY_HERE',
  'dahab_bay_pii_key',
  'Restored Dahab Bay PII key'
);
```

5. Restore the `public` backup.
6. Recreate/bootstrap Auth users and profiles.
7. Deploy the `admin-users` Edge Function.
8. Set `ALLOWED_ORIGIN`.
9. Deploy the frontend.
10. Run `004_verify_security.sql`.
11. Test decryption by logging in and opening existing bookings.

## Important warning

When a replacement project contains a different PII key, the encrypted booking columns cannot be decrypted. Do not create new bookings until the correct recovery key is restored and existing records open successfully.

## Auth password recovery

Supabase Auth passwords are hashed and cannot be decrypted or exported as plaintext. If Auth users are not restored by the managed project backup, recreate users and issue new passwords.

## Backup file encryption

The custom PostgreSQL format is compressed, not encrypted. Encrypted booking columns are protected, but profiles, operational dates, room numbers, status and amounts may still be visible to someone with database access.

Protect the backup folder using:

- BitLocker/EFS or approved endpoint encryption
- restricted NTFS permissions
- OneDrive MFA
- no public sharing
- retention and deletion rules
