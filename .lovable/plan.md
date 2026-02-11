

## Fix: Brevo "Prospects" List Not Updating on Sign-In

### Problem

The call to add users to the Brevo "Prospects (Sign In)" list only exists inside the `Auth.tsx` page component. However, magic link sign-ins redirect users directly to `/dashboard`, so `Auth.tsx` is never mounted and the `onAuthStateChange` listener with the Brevo call never fires.

### Solution

Move the Brevo contact call from `Auth.tsx` into the global `useAuth` hook, which is active on every page. This ensures the call fires regardless of which page the user lands on after clicking their magic link.

### Changes

**`src/hooks/useAuth.ts`**
- In the `onAuthStateChange` handler, when the event is `SIGNED_IN` and the user has an email, fire-and-forget invoke the `add-to-brevo-list` edge function (same as current Auth.tsx logic)

**`src/pages/Auth.tsx`**
- Remove the Brevo `supabase.functions.invoke("add-to-brevo-list", ...)` call from the `onAuthStateChange` handler, since it will now be handled globally

### Why This Works

The `useAuth` hook is used in the App layout and is mounted on every route, including `/dashboard`. When Gavin clicks his magic link and lands on `/dashboard`, the hook's `onAuthStateChange` fires `SIGNED_IN`, which will now trigger the Brevo call.

### No Other Changes Needed

- No database, edge function, or config changes required
- The `add-to-brevo-list` edge function remains unchanged

