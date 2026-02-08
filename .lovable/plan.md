
# Fix: Step Failure Should Stop Pipeline (Not Continue After Credit Refund)

## Problem Summary

When Step 4 (`build_source_pack`) failed with a JSON Guard error ("Contains unsubstituted template variable: {{project_description}}"), the external worker:

1. Correctly marked the step as `failed`
2. Correctly refunded the credit via `refund_credit` action
3. **Incorrectly continued processing** - marked step as `completed` (with error preserved) and proceeded with Steps 5-12

This results in degraded report quality because the source pack step failed but downstream steps used incomplete/broken data.

## Root Cause Analysis

The external Cloud Run/Replit worker has a "recovery" logic path that:
- Attempts JSON Guard repair (up to 3 times)
- If repair fails, logs the error message
- But then **marks the step as "completed" with the error** and continues

The worker-proxy logs confirm:
```
10:19:17Z - update_step: step=4, status=failed    <-- Worker detected failure
10:19:19Z - Credit refunded for run               <-- Credit was refunded
[later]  - Step 4 status became "completed"       <-- Worker continued anyway
```

## Proposed Fix

### 1. External Worker Must Halt on Unrecoverable Errors

The external worker needs to be updated to:
- When JSON Guard fails after 3 repair attempts, mark step as **failed** (not completed)
- **Stop the pipeline loop** - do not proceed to next step
- Update `report_run.status` to `failed`
- Keep the `refund_credit` call (already working)

### 2. Add "Fatal Error" vs "Recoverable Error" Classification

Create clear categories:
| Error Type | Action |
|------------|--------|
| Unsubstituted template variable | FATAL - Stop pipeline |
| Rate limit (429) | Recoverable - Retry with backoff |
| Timeout (504) | Recoverable - Retry from checkpoint |
| JSON parse error | Recoverable - Attempt 3 repairs, then FATAL |
| Missing required field | FATAL - Stop pipeline |

### 3. Worker Proxy Enhancement

Add a `halt_pipeline` flag to the `update_run` action:
```typescript
// When step fails fatally, worker calls:
POST /worker-proxy
{
  "action": "update_run",
  "report_run_id": "xxx",
  "status": "failed",
  "halt_reason": "JSON Guard failed: unsubstituted template variable"
}
```

---

## Technical Implementation

### File: `supabase/functions/worker-proxy/index.ts`

**Change 1**: Add optional `halt_reason` field to `update_run` action

```typescript
// In handleUpdateRun function
if (status === "failed" && params.halt_reason) {
  // Store the halt reason for debugging
  updateData.halt_reason = params.halt_reason;
  console.log(`[HALT] Pipeline stopped: ${params.halt_reason}`);
}
```

**Change 2**: Ensure `update_step` with `status=failed` does NOT get overwritten

Add a safeguard:
```typescript
// In handleUpdateStep - prevent changing failed→completed
if (status === "completed") {
  // Check if step is already failed - don't allow override
  const { data: existing } = await supabase
    .from("report_run_steps")
    .select("status")
    .eq("report_run_id", report_run_id)
    .eq("step_number", step_number)
    .single();
  
  if (existing?.status === "failed") {
    console.log(`[GUARD] Rejecting completed→failed override for step ${step_number}`);
    return jsonResponse({ success: false, message: "Cannot mark failed step as completed" });
  }
}
```

### File: Database Schema

Add `halt_reason` column to `report_runs` table (optional but helpful for debugging):

```sql
ALTER TABLE report_runs 
ADD COLUMN halt_reason TEXT;
```

### File: External Worker (Replit/Cloud Run)

The external worker code needs updating. The key change:

```typescript
// In step execution loop
try {
  const result = await executeStep(stepNumber, prompt);
  // ... save outputs
} catch (error) {
  if (isFatalError(error)) {
    // Mark step failed
    await updateStep(stepNumber, "failed", error.message);
    // Mark run failed with halt reason
    await updateRun({ status: "failed", halt_reason: error.message });
    // Refund credit
    await refundCredit(report_run_id);
    // EXIT THE LOOP - do NOT continue
    break;
  } else {
    // Recoverable error - retry logic
  }
}

function isFatalError(error) {
  const fatalPatterns = [
    /unsubstituted template variable/i,
    /JSON Guard failed after \d+ attempts/i,
    /missing required field/i,
    /UNRESOLVED_TEMPLATE_VARS/i,
  ];
  return fatalPatterns.some(p => p.test(error.message));
}
```

---

## Summary of Changes

| Component | Change |
|-----------|--------|
| `worker-proxy/index.ts` | Add step status guard to prevent failed→completed override |
| `worker-proxy/index.ts` | Add `halt_reason` support to `update_run` action |
| Database | Add `halt_reason` column to `report_runs` table |
| External Worker | Implement fatal error detection + pipeline halt logic |

## Expected Outcome

After this fix:
1. When Step 4 fails with JSON Guard error → pipeline **stops**
2. Credit is refunded (already working)
3. User sees "Step 4 failed" with clear error message
4. User can click "Retry" to start fresh (or fix inputs)
5. No degraded-quality reports are generated from broken source packs
