

## Fix: Add Users to Brevo Prospects List Server-Side

### Problem
The `add-to-brevo-list` function requires authentication, but during the magic link redirect flow, the session token may not be fully established when the client-side `useAuth` hook tries to invoke it. This causes silent failures -- no logs appear for the function at all.

### Solution
Move the Brevo "Prospects" list addition into the `send-magic-link` edge function, which already runs server-side with the service role key and has the user's email. This is more reliable than depending on client-side timing.

### Changes

**`supabase/functions/send-magic-link/index.ts`**
- After successfully sending the magic link email via Brevo, make a second Brevo API call to add/update the contact in the Prospects list (ID: 3)
- This uses the same `BREVO_API_KEY` already available in the function
- Fire-and-forget: log errors but don't fail the request

**`src/hooks/useAuth.ts`**
- Remove the `add-to-brevo-list` invocation from both the `onAuthStateChange` listener and the `initializeAuth` flow
- Remove the `brevoCalled` ref (no longer needed)
- This simplifies the auth hook and removes the unreliable client-side call

### Why This Is Better
- Server-side call is guaranteed to execute (no auth token timing issues)
- Runs at the right moment: when the user requests a magic link (i.e., signs in)
- Removes complexity from the auth hook
- The `add-to-brevo-list` edge function can remain deployed for other use cases (e.g., Stripe webhook) but is no longer called from the frontend auth flow

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/send-magic-link/index.ts` | Add Brevo contacts API call to add email to Prospects list (ID: 3) |
| `src/hooks/useAuth.ts` | Remove `add-to-brevo-list` invocations and `brevoCalled` ref |
