
# Fix Cancel Button and Stalled Generation

## Problem Summary

Two critical edge functions are not deployed, causing:

1. **Cancel button broken** - `cancel-report-run` function returns 404
2. **Generation stuck at step 0** - `enqueue-report` function returns 404, so the worker was never triggered

The logs confirm:
```
ERROR enqueue-report failed: 404 - {"code":"NOT_FOUND","message":"Requested function was not found"}
```

The run `bbb56486-6f26-4b97-81e4-d4827ea16f81` was created successfully with 14 steps but never progressed because the worker dispatch failed.

---

## Solution

### Step 1: Deploy Missing Edge Functions

Deploy both missing functions:
- `cancel-report-run` - enables users to cancel stuck runs
- `enqueue-report` - enables report generation to dispatch to external workers

### Step 2: Force-Fail the Stalled Run

After deploying `cancel-report-run`, mark the stuck run as failed and refund the credit:

```sql
UPDATE report_runs 
SET status = 'failed', completed_at = now() 
WHERE id = 'bbb56486-6f26-4b97-81e4-d4827ea16f81';

UPDATE report_run_steps 
SET status = 'failed', error_message = 'Cancelled - backend deployment issue', completed_at = now()
WHERE report_run_id = 'bbb56486-6f26-4b97-81e4-d4827ea16f81' 
  AND status IN ('pending', 'running');
```

Also refund the credit if one was consumed.

### Step 3: Verify All Critical Functions

Ensure these core functions are deployed:
- `generate-report` (dispatcher)
- `enqueue-report` (worker trigger)
- `cancel-report-run` (cancellation)
- `resume-report-run` (checkpoint recovery)
- `worker-proxy` (worker database interface)

---

## Files Changed

No code changes required - only deployment of existing functions.

---

## Testing

After deployment:
1. Verify the cancel button works on stalled runs
2. Test a fresh report generation to confirm the full pipeline works
3. Confirm credits are refunded correctly on cancellation
