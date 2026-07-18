# Dahab Bay Security Test Checklist

Complete every item in the TEST environment before production migration.

## Authentication

- [ ] Old plaintext-table passwords no longer log in.
- [ ] New Supabase Auth passwords log in successfully.
- [ ] Login request uses `/auth/v1/token`.
- [ ] No request contains `users?password=eq`.
- [ ] Failed login returns a generic message.
- [ ] Session disappears after logout.
- [ ] Closing the browser tab removes the session.
- [ ] Changing the current administrator password logs the user out.
- [ ] Public user sign-up is disabled.
- [ ] Password minimum and character requirements are enabled.

## Authorization

- [ ] Anonymous Postman request cannot select `booking_records`.
- [ ] Anonymous request cannot execute `api_list_bookings`.
- [ ] Staff cannot open the Users page.
- [ ] Staff cannot call the `admin-users` Edge Function.
- [ ] Staff cannot permanently delete a booking.
- [ ] Staff cannot delete a group.
- [ ] Staff cannot export complete guest PII.
- [ ] Admin can create users.
- [ ] Admin can update full name.
- [ ] Admin can update role.
- [ ] Admin can reset password.
- [ ] Admin cannot delete themself.
- [ ] Admin cannot demote themself.
- [ ] Last active admin cannot be deleted or demoted.

## Data protection

- [ ] `booking_records.name_enc` is `bytea`.
- [ ] National IDs/passport numbers are not readable in table rows.
- [ ] Guest JSON is encrypted in `guests_enc`.
- [ ] Notes are encrypted in `notes_enc`.
- [ ] Vault contains exactly one `dahab_bay_pii_key` secret.
- [ ] Encryption recovery key is stored outside GitHub/Vercel/backups.
- [ ] No service-role key exists in frontend source.
- [ ] No database password exists in frontend source.
- [ ] Legacy user password values were replaced.
- [ ] Legacy plaintext tables were dropped after validation.

## Booking integrity

- [ ] Existing bookings migrated with the correct count.
- [ ] Create a one-room booking.
- [ ] Create a multi-room group booking.
- [ ] Failure in one room causes the entire group insert to roll back.
- [ ] Add a room to an existing group.
- [ ] Edit dates and room.
- [ ] Concurrent overlapping room booking is rejected.
- [ ] Version conflict is shown when two users edit the same booking.
- [ ] Check out one booking.
- [ ] Check out a complete group.
- [ ] Admin soft-deletes a booking.
- [ ] Deleted booking disappears from the application.
- [ ] Audit log contains create/update/checkout/delete records.

## XSS and browser security

- [ ] `<img src=x onerror=alert(1)>` is displayed as text.
- [ ] Test payload remains harmless in dashboard.
- [ ] Test payload remains harmless in booking list.
- [ ] Test payload remains harmless in status screen.
- [ ] Test payload remains harmless in room details.
- [ ] Test payload remains harmless in edit modal.
- [ ] Test payload remains harmless in print preview.
- [ ] Response includes Content-Security-Policy.
- [ ] Response includes X-Frame-Options: DENY.
- [ ] Response includes X-Content-Type-Options: nosniff.
- [ ] Response includes Referrer-Policy: no-referrer.
- [ ] The site cannot be embedded in an iframe.
- [ ] Edge Function rejects an unapproved Origin.

## Backup and recovery

- [ ] Pre-migration backup exists and validates.
- [ ] Post-migration backup exists and validates.
- [ ] Encryption recovery key is available in approved secure storage.
- [ ] Restore test documents the order for Vault key, schema, data and Auth users.
- [ ] Backup folder access is restricted.
- [ ] OneDrive folder is not publicly shared.
