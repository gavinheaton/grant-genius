
# Fix: Auth Loading State Stuck on Homepage

## Problem
The "Sign In" button on the homepage shows a spinning loader instead of the actual button. This happens because the `useAuth` hook's `isLoading` state gets stuck as `true` and never resolves to `false`.

## Root Cause
The `useAuth` hook in `src/hooks/useAuth.ts` has an incomplete `onAuthStateChange` handler that only processes `SIGNED_IN` and `SIGNED_OUT` events:

```typescript
// Current code - missing INITIAL_SESSION handling
if (event === "SIGNED_IN" && session?.user) {
  await updateAuthState(...);
} else if (event === "SIGNED_OUT") {
  await updateAuthState(null, undefined);
}
// INITIAL_SESSION event is ignored!
```

When a user visits the homepage without being logged in:
1. Supabase fires an `INITIAL_SESSION` event with `session: null`
2. This event is ignored by the current handler
3. The `getSession()` call should handle this, but if there's any timing issue or the call doesn't complete properly, `isLoading` stays `true`

## Solution
Update the `onAuthStateChange` handler to process all relevant events, ensuring `isLoading` is always set to `false` after the initial auth check completes.

## Changes Required

### File: `src/hooks/useAuth.ts`

**Before:**
```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_IN" && session?.user) {
    await updateAuthState(session.user.id, session.user.email);
  } else if (event === "SIGNED_OUT") {
    await updateAuthState(null, undefined);
  }
});
```

**After:**
```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    await updateAuthState(session.user.id, session.user.email);
  } else {
    // No session - clear auth state (handles INITIAL_SESSION, SIGNED_OUT, etc.)
    await updateAuthState(null, undefined);
  }
});
```

This change:
- Handles `INITIAL_SESSION` with no user → sets `isLoading: false`
- Handles `SIGNED_OUT` → clears auth state
- Handles `SIGNED_IN` → sets auth state
- Handles `TOKEN_REFRESHED` → updates session if user changes

## Technical Summary
| Aspect | Details |
|--------|---------|
| Files modified | `src/hooks/useAuth.ts` |
| Risk level | Low - simplifies logic while making it more robust |
| Testing | Verify Sign In button appears on homepage after fix |
