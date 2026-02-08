

# Add Credit Consumption for Manual Reports

## Problem

Currently, manual reports do not consume credits. The frontend checks for available credits before allowing submission, but neither the `submit-manual-request` nor `complete-manual-report` Edge Functions actually consume the entitlement.

**Current Flow (Manual Reports):**
1. User clicks "Submit for Review"
2. Frontend checks `hasAvailableReport` (correct)
3. `submit-manual-request` updates application status (no credit consumption)
4. Admin completes report via `complete-manual-report` (no credit consumption)
5. User receives report without paying

**Comparison with Regular Reports:**
- Regular reports consume credits in `generate-report` at the start of processing
- A consumption record is created and linked to the report run
- If the report fails, credits are refunded

---

## Solution

Add credit consumption to the `submit-manual-request` function, matching the pattern used in `generate-report`. This ensures:

1. Credits are consumed when the user submits (upfront payment)
2. A consumption record links the entitlement to the eventual report
3. Prevents users from submitting multiple requests without credits

---

## Implementation Details

### File: `supabase/functions/submit-manual-request/index.ts`

Add the following logic after verifying the application but before updating the status:

| Step | Description |
|------|-------------|
| 1 | Query user's entitlements for `REPORT_ONE_OFF` type |
| 2 | Find an entitlement with available credits (not expired, `quantity > used_quantity`) |
| 3 | If no credits available, return 402 error with appropriate message |
| 4 | Increment `used_quantity` on the entitlement |
| 5 | Create `entitlement_consumptions` record (without `report_id` for now) |
| 6 | Store the `consumption_id` in the application for linking later |

### File: `supabase/functions/complete-manual-report/index.ts`

Add logic to link the consumption record to the report:

| Step | Description |
|------|-------------|
| 1 | After creating the report, find the consumption record for this application |
| 2 | Update the consumption record with the `report_id` |

---

## Database Consideration

The `entitlement_consumptions` table has `report_id` and `report_run_id` columns. For manual reports:
- `report_run_id` will link to the placeholder manual run
- `report_id` will be updated when the report is completed

We may need to add an `application_id` to `entitlement_consumptions` to track manual submissions before the report exists, OR store the `entitlement_consumption_id` on the application.

**Recommended approach:** Store `entitlement_consumption_id` on the `applications` table to track which consumption record is associated with a manual submission. This allows `complete-manual-report` to easily update the consumption when the report is created.

---

## Changes Summary

| File | Changes |
|------|---------|
| Database migration | Add `entitlement_consumption_id` column to `applications` table |
| `supabase/functions/submit-manual-request/index.ts` | Add entitlement check, consumption logic, and store consumption ID |
| `supabase/functions/complete-manual-report/index.ts` | Link consumption record to report when created |

---

## Edge Cases

1. **User has no credits**: Return 402 error, frontend already handles this by showing purchase modal
2. **User cancels before completion**: May need a separate "cancel manual request" flow to refund (future enhancement)
3. **Admin never completes**: Credits remain consumed (same as regular reports that fail permanently)

---

## Technical Details

### submit-manual-request changes:

```typescript
// Check for available entitlement
const { data: entitlements } = await serviceClient
  .from("entitlements")
  .select("id, quantity, used_quantity, expires_at")
  .eq("user_id", user.id)
  .eq("entitlement_type", "REPORT_ONE_OFF");

const now = new Date();
const availableEntitlement = (entitlements || []).find((ent) => {
  if (ent.expires_at && new Date(ent.expires_at) < now) return false;
  return ent.quantity > ent.used_quantity;
});

if (!availableEntitlement) {
  return new Response(
    JSON.stringify({ error: "No report credits available. Please purchase a report." }),
    { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Consume entitlement
await serviceClient
  .from("entitlements")
  .update({ used_quantity: availableEntitlement.used_quantity + 1 })
  .eq("id", availableEntitlement.id);

// Create consumption record
const { data: consumption } = await serviceClient
  .from("entitlement_consumptions")
  .insert({
    entitlement_id: availableEntitlement.id,
    report_id: null, // Will be updated when report is created
  })
  .select("id")
  .single();
```

### complete-manual-report changes:

```typescript
// After creating the report, link the consumption record
const { data: consumption } = await serviceClient
  .from("entitlement_consumptions")
  .select("id")
  .eq("entitlement_id", /* from application */)
  .is("report_id", null)
  .limit(1)
  .single();

if (consumption) {
  await serviceClient
    .from("entitlement_consumptions")
    .update({ report_id: reportId, report_run_id: reportRun.id })
    .eq("id", consumption.id);
}
```

