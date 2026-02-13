

## Fix: Resume Rejects Stalled Runs in "running" Status

### Root Cause

The `resume-report-run` edge function only accepts runs with status `pending` or `failed` (line 439). A stalled run is still in `running` status -- it hasn't been marked as failed yet, it just stopped progressing. So clicking Resume returns a 400: "Report run is not in a resumable status".

### Fix

**File: `supabase/functions/resume-report-run/index.ts`**

Add `running` to the list of accepted statuses for resumption. This is safe because:
- The function already re-sets status to `running` and `started_at` on line 448, so there's no state conflict
- A stalled-but-running run is the primary use case for the Resume button on the Stalled Runs table
- The function processes exactly one step and checkpoints, so re-entering a running state is idempotent

### Change

```typescript
// Line 439: Before
if (reportRun.status !== "pending" && reportRun.status !== "failed") {

// After
if (reportRun.status !== "pending" && reportRun.status !== "failed" && reportRun.status !== "running") {
```

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/resume-report-run/index.ts` | Add `running` to accepted statuses on line 439 |

### Risk

Low. The function already guards against completed runs (line 384-428 handles final step recovery), and the step execution is single-step with checkpoint, so duplicate processing is unlikely. The worker that originally stalled has already timed out or crashed.
