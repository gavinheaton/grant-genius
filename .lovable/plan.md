

# Fix: Admin Users Seeing Other Users' Credits

## Problem Identified

**Root Cause**: The `useEntitlements` hook relies on Row-Level Security (RLS) to filter entitlements to the current user. However, admin users have an RLS policy that allows them to view ALL entitlements:

```sql
-- This policy lets admins see everyone's entitlements
Policy: "Admins can view all entitlements"
Using Expression: is_admin(auth.uid())
```

When an admin (like gavin@disruptorsco.com) visits the Dashboard:
1. The hook fetches entitlements without a `user_id` filter
2. RLS returns ALL users' entitlements (not just their own)
3. The frontend sums everything: gavin's 0 + joanne's 10 = 10
4. The UI incorrectly shows "You have 10 credits remaining"

---

## Solution

Add an explicit `user_id` filter to the `useEntitlements` hook. This ensures admins only see their OWN credits on user-facing pages, regardless of RLS policies.

---

## Changes Required

### File: `src/hooks/useEntitlements.ts`

**Current code (lines 26-29):**
```typescript
const { data, error } = await supabase
  .from("entitlements")
  .select("id, entitlement_type, quantity, used_quantity, expires_at")
  .eq("entitlement_type", "REPORT_ONE_OFF");
```

**Updated code:**
```typescript
const { data, error } = await supabase
  .from("entitlements")
  .select("id, entitlement_type, quantity, used_quantity, expires_at")
  .eq("entitlement_type", "REPORT_ONE_OFF")
  .eq("user_id", session.user.id);  // Filter to current user only
```

---

## Technical Notes

- This is a defense-in-depth fix — the hook should NOT rely solely on RLS for scoping
- The admin RLS policy is intentional (admins need to see all entitlements in the admin panel), but user-facing hooks should explicitly filter by the authenticated user
- No database changes required
- No edge function changes required

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useEntitlements.ts` | Add `.eq("user_id", session.user.id)` filter |

---

## Expected Outcome

After this fix:
- gavin@disruptorsco.com will see "0 credits" (correct)
- joanne@disruptorsco.com will see "10 credits" (unchanged)
- Admin users will see only their own credits on user-facing pages
- The admin panel will continue to show all users' entitlements (unchanged)

