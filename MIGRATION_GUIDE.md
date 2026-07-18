# Dahab Bay Secure Test Migration Guide

This package is prepared for the current test environments:

- **Vercel:** `https://testdahabbay.vercel.app`
- **Supabase project reference:** `flrujsfbqsbwrkdvmzih`
- **GitHub repository:** `mohsattar/test_dahab_bay`

Do not apply these steps to production until the complete test checklist passes.

---

## 1. What changed

The original static HTML used a public Supabase key to query `public.users` and `public.bookings` directly. Passwords were compared as normal table values and booking PII was stored in plaintext.

The new package changes the architecture to:

```text
Browser
  ├─ Supabase Auth: username/password login through synthetic internal email
  ├─ Authenticated RPC: booking reads and writes
  └─ Authenticated Edge Function: administrator user management

Supabase
  ├─ auth.users: bcrypt password hashes
  ├─ public.profiles: username, full name and application role
  ├─ public.booking_records: encrypted guest/booking PII
  ├─ public.audit_log: user and booking change history
  ├─ private functions: encryption, authorization and validation
  ├─ RLS + revoked direct table permissions
  └─ Vault: encrypted PII key
```

No service-role or database password is placed in the HTML.

---

# 2. Package contents

```text
index.html
app.js
vercel.json
.gitignore
CHANGELOG.csv
MIGRATION_GUIDE.md
SECURITY_TEST_CHECKLIST.md
BACKUP_AND_RECOVERY.md
VALIDATION_REPORT.txt
SHA256SUMS.txt

supabase/
├─ config.toml
├─ migrations/
│  ├─ 001_secure_schema.sql
│  ├─ 002_bootstrap_profiles.sql
│  ├─ 003_drop_legacy_plaintext.sql
│  └─ 004_verify_security.sql
└─ functions/
   └─ admin-users/
      └─ index.ts
```

## 2.1 Verify package integrity

`VALIDATION_REPORT.txt` records the static checks performed before delivery. `SHA256SUMS.txt` contains a SHA-256 digest for every package file. After copying the package, you can verify a file in PowerShell with:

```powershell
Get-FileHash .\index.html -Algorithm SHA256
```

Compare the result with the `index.html` line in `SHA256SUMS.txt`.

---

# 3. Mandatory preparation

## 3.1 Confirm that you are using the test Supabase project

Open the Supabase dashboard and confirm the project reference is:

```text
flrujsfbqsbwrkdvmzih
```

The secure `index.html` already contains the test project URL and publishable key. Do not replace them with production values.

## 3.2 Take a fresh backup

Before running any SQL:

1. Run the existing scheduled/manual custom backup.
2. Confirm the file is not 0 KB.
3. Validate it with `pg_restore --list`.
4. Keep the pre-migration backup separately.

## 3.3 Create Auth users before running migration 001

The data migration records the first Auth user as the creator of imported historical bookings. Therefore, at least one Auth user must exist before `001_secure_schema.sql` runs.

In Supabase:

```text
Authentication → Users → Add user
```

Create these users with **new strong passwords** and auto-confirm them:

| Internal email | Login username | Full name | Role |
|---|---|---|---|
| `dahabbay@dahabbay.example.com` | `dahabbay` | `reception` | Admin |
| `abdo@dahabbay.example.com` | `abdo` | `Owner` | Admin |
| `walid@dahabbay.example.com` | `walid` | `walid` | Staff |

Important:

- Users log in to the site using only `dahabbay`, `abdo`, or `walid`.
- The `@dahabbay.example.com` address is an internal reserved-format identifier and is never displayed or used for email delivery.
- Do not reuse the old plaintext passwords.
- Use at least 12 characters with uppercase, lowercase, number, and symbol.
- Select **Auto Confirm User**.

## 3.4 Harden Supabase Auth settings

In the test project Auth settings:

1. Keep Email/Password sign-in enabled.
2. Disable public user sign-up. New users are created only by the administrator Edge Function.
3. Set minimum password length to at least `12`.
4. Require uppercase, lowercase, number, and symbol.
5. Enable leaked-password protection when available on the plan.
6. Set the Site URL to:

```text
https://testdahabbay.vercel.app
```

---

# 4. Apply the Supabase database migration

Use the Supabase SQL Editor. Run each file separately and in the exact order below.

## 4.1 Run `001_secure_schema.sql`

Open:

```text
supabase/migrations/001_secure_schema.sql
```

Copy the entire file into a new SQL Editor query and run it.

This migration:

- Enables `pgcrypto`, `citext`, and Vault.
- Creates an encrypted Vault key named `dahab_bay_pii_key`.
- Renames old plaintext tables for rollback.
- Creates `profiles`, `booking_records`, and `audit_log`.
- Migrates existing bookings to encrypted columns.
- Removes usable plaintext values from the old users password column.
- Creates authenticated RPC functions.
- Adds server-side room overlap checking.
- Adds transactions for group booking operations.
- Adds optimistic version checking.
- Enables RLS and removes direct browser access to all protected tables.
- Grants only the required RPC functions to `authenticated`.

Expected final message:

```text
Success. No rows returned
```

Do not continue when the migration returns an error.

### Common migration error: no Auth user exists

When you receive a foreign-key or null error while migrating existing bookings, create at least one user under Authentication → Users, restore the pre-migration backup if the transaction did not roll back cleanly, and rerun the migration.

## 4.2 Run `002_bootstrap_profiles.sql`

Run:

```text
supabase/migrations/002_bootstrap_profiles.sql
```

The result must show three profile rows:

```text
dahabbay   admin
abdo       admin
walid      staff
```

If a profile is missing, confirm that the corresponding internal email exists exactly under Authentication → Users.

## 4.3 Run `004_verify_security.sql`

Run:

```text
supabase/migrations/004_verify_security.sql
```

Key expected results:

- `booking_records` contains the migrated booking count.
- Encrypted fields have type `bytea`.
- RLS is enabled for all secure tables.
- The direct privilege query for `anon` and `authenticated` returns no rows.
- The API functions are executable only by `authenticated`.

Do **not** run `003_drop_legacy_plaintext.sql` yet.

---

# 5. Save the encryption recovery key securely

The scheduled `public`-schema backup contains encrypted booking data, but it does not contain a usable plaintext copy of the encryption key.

Run this query once:

```sql
select decrypted_secret
from vault.decrypted_secrets
where name = 'dahab_bay_pii_key';
```

Immediately store the result in an approved company password manager or encrypted offline recovery vault.

Never store it in:

- GitHub
- Vercel
- the HTML
- email
- WhatsApp
- a normal text file
- the same folder as database backups

This recovery key is required if encrypted booking data is restored to a different Supabase project.

---

# 6. Deploy the Supabase Edge Function

The `admin-users` function securely creates, updates, resets passwords, changes roles, and deletes Auth users. The server secret key remains only in the Supabase server environment.

## 6.1 Open PowerShell in the package root

Example:

```powershell
cd "C:\DahabBay-Secure"
```

The current folder must contain the `supabase` directory.

## 6.2 Run the Supabase CLI without Docker

Node.js 20 or later is required.

```powershell
node --version
```

Log in:

```powershell
npx supabase login
```

Link the test project:

```powershell
npx supabase link --project-ref flrujsfbqsbwrkdvmzih
```

## 6.3 Add the allowed Vercel origin

```powershell
npx supabase secrets set `
  ALLOWED_ORIGIN=https://testdahabbay.vercel.app `
  --project-ref flrujsfbqsbwrkdvmzih
```

Do not add a trailing slash.

When you also need to test a Vercel preview deployment, add both origins separated by a comma:

```powershell
npx supabase secrets set `
  ALLOWED_ORIGIN=https://testdahabbay.vercel.app,https://YOUR-PREVIEW.vercel.app `
  --project-ref flrujsfbqsbwrkdvmzih
```

## 6.4 Deploy the function

Docker is not required for remote API deployment:

```powershell
npx supabase functions deploy admin-users `
  --project-ref flrujsfbqsbwrkdvmzih `
  --use-api
```

Expected deployed endpoint:

```text
https://flrujsfbqsbwrkdvmzih.supabase.co/functions/v1/admin-users
```

Do not place a Supabase secret/service-role key in GitHub or Vercel. Hosted Edge Functions receive `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` automatically; the function also supports the legacy predefined variables as a fallback. Only `ALLOWED_ORIGIN` is added manually.

## 6.5 Verify function configuration

The package contains:

```toml
[functions.admin-users]
verify_jwt = true
```

The function also verifies the caller again and checks the caller's `profiles.role = 'admin'`.

---

# 7. Upload the frontend to GitHub

Repository:

```text
https://github.com/mohsattar/test_dahab_bay
```

## 7.1 Keep a rollback copy

Download the current repository `index.html` and save it locally as:

```text
index_before_secure_auth.html
```

Do not upload this rollback file to the public repository because it contains the old insecure client logic.

## 7.2 Upload the secure package

The repository root should contain:

```text
test_dahab_bay/
├─ index.html
├─ app.js
├─ vercel.json
├─ .gitignore
├─ CHANGELOG.csv
├─ MIGRATION_GUIDE.md
├─ SECURITY_TEST_CHECKLIST.md
├─ BACKUP_AND_RECOVERY.md
└─ supabase/
   ├─ config.toml
   ├─ migrations/
   └─ functions/
```

Using GitHub web:

1. Open the repository.
2. Select **Add file → Upload files**.
3. Drag the package files and the `supabase` folder.
4. Ensure the secure HTML is named exactly `index.html`.
5. Commit directly to `main` with:

```text
Secure authentication, encrypted booking data and RLS
```

The test repository is public in the screenshot. This package contains no secret/service key, but consider changing the repository to Private because it contains application architecture and business logic.

---

# 8. Vercel deployment

Because the Vercel test project is connected to the repository, a commit to `main` should automatically create a production deployment for the same test project.

Open:

```text
Vercel → testdahabbay project → Deployments
```

Wait for:

```text
Status: Ready
Environment: Production
```

Then open:

```text
https://testdahabbay.vercel.app
```

Use:

```text
Ctrl + F5
```

or an Incognito window.

`vercel.json` adds:

- Content Security Policy
- anti-clickjacking
- MIME sniffing protection
- no-referrer policy
- permissions restrictions
- no-store caching
- restricted Supabase connection origin

The JavaScript is now stored in `app.js`. All former inline event handlers were converted to non-executable `data-on-*` attributes and are handled through a strict allowlisted event dispatcher. The CSP therefore uses `script-src 'self'` without `unsafe-inline` or `unsafe-eval`.
Printable vouchers are mounted through DOM parsing/import with escaped dynamic values; the package does not use `document.write()`.
The original external icon CDN was removed and replaced with local Unicode glyph styling, eliminating that third-party runtime dependency.

---

# 9. First login and functional tests

Login using the username, not the internal email:

```text
Username: abdo
Password: the new Auth password created in step 3
```

Verify:

1. Dashboard loads.
2. Existing bookings are visible.
3. A booking can be created.
4. A booking can be edited.
5. A booking can be checked out.
6. An admin can delete a booking.
7. A staff user cannot see permanent-delete or export buttons.
8. An admin can open Users.
9. An admin can create a user.
10. An admin can edit full name, role, and password.
11. An admin cannot demote or delete the last admin.
12. A user password is never read from a database table.
13. The browser Network panel shows Auth requests, not a `users?password=eq...` query.

When an administrator changes their own password, the application logs out and requires login using the new password.

---

# 10. Security verification with Postman

Use the publishable key without a user access token.

## Direct table request

```http
GET https://flrujsfbqsbwrkdvmzih.supabase.co/rest/v1/booking_records?select=*
apikey: <publishable key>
```

Expected: permission denied / unauthorized. It must not return booking data.

## RPC request without login

```http
POST https://flrujsfbqsbwrkdvmzih.supabase.co/rest/v1/rpc/api_list_bookings
apikey: <publishable key>
Content-Type: application/json

{}
```

Expected: unauthorized or insufficient privilege.

## Staff authorization

Login through the test site as `walid`, then confirm:

- Users navigation is hidden.
- Excel export is hidden.
- Permanent delete is hidden.
- Manually calling admin functions receives `ADMIN_REQUIRED`.

---

# 11. Test stored-XSS protection

Create a temporary test booking with this guest name:

```text
<img src=x onerror=alert('xss-test')>
```

Expected:

- The exact text is displayed.
- No alert appears.
- No image is created.
- The value remains harmless on Dashboard, Bookings, Status, room details, edit screen, and print preview.

Delete the temporary record afterward using an admin account.

---

# 12. Complete plaintext cleanup

Only after all tests pass:

1. Take a new secure backup.
2. Confirm `booking_records` contains all records.
3. Confirm login and booking operations work.
4. Run:

```text
supabase/migrations/003_drop_legacy_plaintext.sql
```

This permanently drops:

```text
legacy_users_plaintext
legacy_bookings_plaintext
legacy_guests_plaintext
```

After this step, rollback requires restoring the pre-migration backup.

---

# 13. Rollback procedure

Before running cleanup `003`:

1. Redeploy the old GitHub commit.
2. Restore the pre-migration database backup to the test project or a replacement project.
3. Remove the test Edge Function if required.

After running cleanup `003`, use the pre-migration backup for full rollback.

Do not attempt to switch the new HTML back to the old plaintext tables.

---

# 14. Production migration later

After the test environment passes:

1. Create a separate production backup.
2. Copy the package.
3. Replace only:
   - Supabase project URL.
   - Supabase publishable key.
   - Vercel production origin in the Edge Function secret.
   - `connect-src` Supabase origin in `vercel.json`.
4. Create production Auth users with new passwords.
5. Repeat SQL migrations in order.
6. Deploy the Edge Function to the production project.
7. Deploy through the production GitHub/Vercel project.
8. Run the complete security checklist before dropping production legacy tables.
