

## Fix: Brevo "Prospects" List Not Updating

### Root Causes

**1. Edge function auth validation uses a non-existent method**
The `add-to-brevo-list` edge function calls `supabase.auth.getClaims(token)` (line 33), which is not a standard Supabase JS client method. This causes every request to fail with a 401 response. The fix is to replace it with `supabase.auth.getUser(token)`, which is the correct way to validate a JWT.

**2. The SIGNED_IN event may be suppressed on magic link redirects**
When a magic link redirects to `/dashboard`, the auth state change might only emit `INITIAL_SESSION` (which we skip) rather than a separate `SIGNED_IN` event. To be safe, we should also handle the initial session case for the Brevo call.

### Changes

**`supabase/functions/add-to-brevo-list/index.ts`**
- Replace `supabase.auth.getClaims(token)` with `supabase.auth.getUser()` to properly validate the authenticated user
- This is the primary fix -- the function has been silently rejecting every request

**`src/hooks/useAuth.ts`**
- Add the Brevo call to the `initializeAuth` flow as well (not just the `onAuthStateChange` listener), so that if a magic link sign-in only triggers `INITIAL_SESSION`, the Brevo update still fires
- Use a simple flag to avoid duplicate calls if both paths fire

### Why This Will Work

- The edge function will no longer reject valid requests due to a bad auth check
- The Brevo call will fire on both `SIGNED_IN` events and initial session detection, covering all sign-in scenarios

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/add-to-brevo-list/index.ts` | Replace `getClaims` with `getUser` for auth validation |
| `src/hooks/useAuth.ts` | Also trigger Brevo call during initial session detection |
