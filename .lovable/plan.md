
# Fix: Step Failure Should Stop Pipeline (COMPLETED)

## Problem Summary

When Step 4 (`build_source_pack`) failed with a JSON Guard error, the external worker incorrectly continued processing instead of halting the pipeline.

## Implemented Fixes

### ✅ 1. Database: halt_reason Column
Added `halt_reason TEXT` column to `report_runs` table for diagnostic storage.

### ✅ 2. Worker-Proxy: Step Status Guard
Added check in `handleUpdateStep` to **reject** `status=completed` if step is already `failed`:
- Returns HTTP 409 Conflict with clear error message
- Prevents external worker from overriding failed state

### ✅ 3. Worker-Proxy: halt_reason Support
Added `halt_reason` parameter to `update_run` action:
- When provided with `status=failed`, stores the halt reason
- Logs `[HALT]` message for diagnostics

## External Worker Requirements (NOT in this codebase)

The external Cloud Run/Replit worker must be updated to:

```typescript
// Fatal error detection
function isFatalError(error) {
  const fatalPatterns = [
    /unsubstituted template variable/i,
    /JSON Guard failed after \d+ attempts/i,
    /missing required field/i,
    /UNRESOLVED_TEMPLATE_VARS/i,
  ];
  return fatalPatterns.some(p => p.test(error.message));
}

// In step execution loop
if (isFatalError(error)) {
  await updateStep(stepNumber, "failed", error.message);
  await updateRun({ status: "failed", halt_reason: error.message });
  await refundCredit(report_run_id);
  break; // EXIT THE LOOP
}
```

## API Contract

### update_step Action
- If `status=completed` and step is already `failed`: returns `{ success: false }` with 409
- External worker should check response and halt if rejected

### update_run Action
- Now accepts optional `halt_reason: string` field
- When `status=failed` + `halt_reason` provided, stores for diagnostics

## Expected Outcome

1. Worker-proxy now blocks failed→completed overrides
2. Pipeline will fail cleanly when step fails
3. Credit refund already works (existing logic)
4. `halt_reason` stored for debugging
