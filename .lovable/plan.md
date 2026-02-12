

## Fix: Resume function rejects failed runs

### Root Cause

The `resume-report-run` edge function (line 439) only accepts runs with `status = "pending"`:

```typescript
if (reportRun.status !== "pending") {
  return new Response(
    JSON.stringify({ error: "Report run is not in pending status" }),
    { status: 400, ... }
  );
}
```

When a run fails, its status is `"failed"`, so the resume function immediately returns a 400 error. The function needs to also accept `"failed"` status and reset it to `"running"` before proceeding.

### Fix

**`supabase/functions/resume-report-run/index.ts`** (line 439)

Change the status check from:
```typescript
if (reportRun.status !== "pending") {
```
to:
```typescript
if (reportRun.status !== "pending" && reportRun.status !== "failed") {
```

This single-line change allows admins (and users) to resume runs that have failed, which is the primary use case for the Resume button on the Run Detail page.

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/resume-report-run/index.ts` | Accept `"failed"` status in addition to `"pending"` for resume |

