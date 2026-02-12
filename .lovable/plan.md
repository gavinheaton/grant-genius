

## Send Magic Links via Brevo Instead of Default Auth Emails

### Problem
Magic link emails are sent from `no-reply@auth.lovable.cloud`, which gets caught by spam filters (especially on corporate mail servers like `heatoncommunications.com`).

### Solution
Create a custom `send-magic-link` edge function that generates the magic link server-side and sends it via the Brevo API from your verified `grantgenius@disruptorsco.com` sender. This is the same pattern already used successfully in the `invite-admin` function.

### How It Works

1. User enters email on the Auth page
2. Instead of calling `supabase.auth.signInWithOtp()` (which triggers the default email), the frontend calls a new `send-magic-link` edge function
3. The edge function uses the admin API to generate a magic link URL
4. The edge function sends that URL via Brevo API with your branded email template
5. User clicks the link and is authenticated as normal

### Changes

**New file: `supabase/functions/send-magic-link/index.ts`**
- Receives `{ email }` in the request body
- Uses `adminClient.auth.admin.generateLink({ type: "magiclink", email, ... })` to create the link
- Sends the link via Brevo API from `grantgenius@disruptorsco.com`
- Returns a generic success response (no account enumeration leaks)
- Uses existing secrets: `BREVO_API_KEY`, `APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Updated file: `src/pages/Auth.tsx`**
- Replace `supabase.auth.signInWithOtp(...)` with `supabase.functions.invoke("send-magic-link", { body: { email } })`
- Keep the same UI behavior (loading state, success message, error handling)

**Updated file: `supabase/config.toml`**
- Add `[functions.send-magic-link]` with `verify_jwt = false` (unauthenticated users need to request magic links)

### Email Template
The Brevo email will use a branded HTML template matching the style already used in the admin invite email (Grant Genius branding, gradient header, clear CTA button, fallback URL text).

### Security Considerations
- The edge function uses the service role key server-side only
- Generic error responses prevent account enumeration
- Rate limiting can be added later if needed (Brevo has its own rate limits)

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/send-magic-link/index.ts` | New edge function: generate magic link + send via Brevo |
| `src/pages/Auth.tsx` | Call edge function instead of `signInWithOtp` |
| `supabase/config.toml` | Register new function with `verify_jwt = false` |

