## Goal
Send an email to admins whenever a user signs in, containing that user's name and email. Add a SuperAdmin toggle to turn this notification on/off.

## Approach

### 1. Storage for the toggle
Add two rows to `api_settings` (already used for site config) via migration:
- `login_notifications_enabled` (boolean, default `false`)
- `login_notifications_recipient` (text, default `grantgenius@disruptorsco.com`) — where the alert is sent

RLS: readable by admins, writable only by super_admin.

### 2. New edge function: `notify-user-login`
- `verify_jwt = true` (called from authenticated client right after sign-in).
- Reads the caller's session, fetches `login_notifications_enabled` using service role.
- If disabled → returns `{ skipped: true }` and exits.
- If enabled: pulls the user's `profiles` row (full_name/email), sends a Brevo transactional email to the configured recipient with subject like `User signed in: {name}` and body containing name, email, timestamp, user_id.
- Uses existing `BREVO_API_KEY` secret; mirrors the pattern from `send-magic-link` / `send-report-email`.
- Idempotency: dedupe repeat fires within 5 minutes per user_id via a simple check against `app_events` (event_type `login_notified`) so refreshes/tab reopens don't spam.

### 3. Trigger point (frontend)
In `src/pages/Auth.tsx` inside the `onAuthStateChange` handler, on `SIGNED_IN` fire-and-forget `supabase.functions.invoke("notify-user-login")` before navigation. Failures are swallowed (don't block login).

### 4. SuperAdmin UI
New page `src/pages/admin/LoginNotifications.tsx` (linked from the admin sidebar, gated to `super_admin`):
- Switch: "Email me when a user logs in"
- Input: recipient email (defaults to grantgenius@disruptorsco.com)
- Save button → upserts both `api_settings` rows.
- "Send test" button → invokes `notify-user-login` with `{ test: true }`.

Add route in the admin router and a nav entry under the SuperAdmin-only section.

## Technical notes
- No changes to auth providers; we hook the client-side `SIGNED_IN` event (fires on magic link verify and session restore). To avoid emailing on every tab refresh we gate on `app_events` dedupe (5-minute window).
- All email sends go through Brevo (already configured, IP allow-list resolved).
- Non-super-admin admins can view but not toggle; the setting rows are protected via RLS + `is_super_admin` check.

## Files touched
- New migration: `api_settings` rows + RLS policy tweak.
- New edge function: `supabase/functions/notify-user-login/index.ts`.
- Update `src/pages/Auth.tsx` (invoke on SIGNED_IN).
- New page `src/pages/admin/LoginNotifications.tsx` + route + sidebar entry.
