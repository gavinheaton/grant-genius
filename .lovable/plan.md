

## Add New Sign-Ins to Brevo "Prospects (Sign In)" List

### Overview

When a user signs in via magic link, their email will be added (or updated) as a contact in the Brevo "Prospects (Sign In)" list. This happens server-side via a new edge function, called from the client after a successful sign-in.

### How It Works

1. User clicks magic link and is authenticated
2. The `onAuthStateChange` listener fires `SIGNED_IN`
3. Client calls a new `add-to-brevo-list` edge function with the user's email
4. The edge function calls the Brevo Contacts API to create/update the contact and add them to the list

### What You Need to Provide

The **numeric List ID** for the "Prospects (Sign In)" list from your Brevo dashboard (Contacts > Lists). I'll use this as a constant in the edge function.

### Changes

**New file: `supabase/functions/add-to-brevo-list/index.ts`**
- Accepts `{ email }` in the request body
- Requires valid auth token (extracts user from JWT)
- Calls `POST https://api.brevo.com/v3/contacts` with `updateEnabled: true` and `listIds: [LIST_ID]`
- Fire-and-forget from client (errors logged server-side, never block the user)

**Updated file: `supabase/config.toml`**
- Add `[functions.add-to-brevo-list]` with `verify_jwt = false` (auth validated in code)

**Updated file: `src/pages/Auth.tsx`**
- In the existing `onAuthStateChange` handler for `SIGNED_IN`, add a fire-and-forget call to the new edge function with the user's email before navigating to `/dashboard`

### No Database or Schema Changes Required

This only uses the Brevo Contacts API and the existing `BREVO_API_KEY` secret.

