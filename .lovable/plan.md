

## Fix: Regenerate Button Doesn't Work

### Root Cause

The `process-grant-guidelines` edge function has a concurrency guard (line 1528) that only proceeds if `ai_analysis_status = 'pending'`. When a pipeline has already been generated (status is `completed`), clicking "Regenerate" calls the function directly but the guard silently rejects it with `{ skipped: true }`.

The `handleRetryProcessing` function in `GrantEdit.tsx` (line 221) never resets the grant version's status before calling the edge function, so the guard always blocks re-runs.

### Fix

**`src/pages/admin/GrantEdit.tsx`** -- Update `handleRetryProcessing` to:

1. Reset the grant version statuses (`ai_analysis_status = 'pending'`, `pipeline_generation_status = 'none'`)
2. De-couple the existing prompt bundle (`prompt_bundle_id = null`)
3. Clear stale suggestions (`ai_suggestions_json = {}`)
4. Then call the `process-grant-guidelines` edge function

This ensures the concurrency guard sees `pending` and proceeds with a fresh generation.

```text
handleRetryProcessing flow (before fix):
  Call edge function --> Guard sees "completed" --> Skipped silently

handleRetryProcessing flow (after fix):
  Reset grant_version statuses to pending/none --> Clear prompt_bundle_id --> 
  Update local state --> Call edge function --> Guard sees "pending" --> Proceeds
```

### Files Changed

| File | Change |
|---|---|
| `src/pages/admin/GrantEdit.tsx` | Add DB reset (statuses + decouple bundle) before calling `process-grant-guidelines` in `handleRetryProcessing` |

### Notes

- The old prompt bundle is not deleted -- it remains in the database but is no longer linked to the grant version. This is intentional so admins can compare old vs new pipelines if needed.
- Local state variables (`aiAnalysisStatus`, `pipelineStatus`, `promptBundleId`, `aiSuggestions`) are updated immediately after the reset so the UI shows the processing state right away.

