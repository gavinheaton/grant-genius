

## Fix: Delete User FK Constraint Violation

### Root Cause

The `applications` table has a foreign key `entitlement_consumption_id` referencing `entitlement_consumptions.id`. The current deletion order in `supabase/functions/delete-user/index.ts` is:

```text
1. Delete entitlement_consumptions (by report_run_id)   <-- FAILS here
2. Delete reports
3. Delete report_runs
4. Delete applications                                   <-- still references the consumption
```

PostgreSQL enforces FK constraints regardless of service role, so deleting a consumption that an application still references causes a constraint violation error.

### Fix

In `supabase/functions/delete-user/index.ts`, null out `applications.entitlement_consumption_id` before deleting any entitlement_consumptions. This breaks the FK reference so the consumption rows can be safely deleted.

Add this line **before** the entitlement_consumptions delete (before line 100):

```typescript
// Null out FK reference from applications before deleting consumptions
await adminClient
  .from("applications")
  .update({ entitlement_consumption_id: null })
  .eq("user_id", userId);
```

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/delete-user/index.ts` | Add `update({ entitlement_consumption_id: null })` on applications before deleting entitlement_consumptions |

