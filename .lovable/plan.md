

# Fix: Deploy Missing `enqueue-report` Edge Function

## Problem Summary

Report generation fails before Step 0 with error:
```
enqueue-report failed: 404 - {"code":"NOT_FOUND","message":"Requested function was not found"}
```

The `generate-report` function (line 540-550) calls `enqueue-report` to dispatch the report run to the Cloud Run worker, but `enqueue-report` is **not deployed** despite existing in the codebase.

## Root Cause

The `enqueue-report` edge function exists at `supabase/functions/enqueue-report/index.ts` and is configured in `supabase/config.toml`, but it was never deployed to the backend environment.

## Flow Diagram

```text
User clicks "Generate Report"
         │
         ▼
┌─────────────────────────┐
│   generate-report       │  ✅ Works
│   (creates run record)  │
└───────────┬─────────────┘
            │ calls
            ▼
┌─────────────────────────┐
│   enqueue-report        │  ❌ 404 NOT FOUND
│   (triggers worker)     │
└─────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│   Cloud Run Worker      │  Never reached
│   (processes steps)     │
└─────────────────────────┘
```

## Solution

Deploy the `enqueue-report` edge function. The function code is already correct - it just needs to be deployed to the backend environment.

## Technical Details

The `enqueue-report` function (already in codebase):
1. Receives `report_run_id` from `generate-report`
2. Fetches `CLOUD_RUN_URL` and `WORKER_SECRET` from environment
3. Calls the external Cloud Run worker at `{CLOUD_RUN_URL}/enqueue-run`
4. Worker processes pipeline steps and updates the database

## Implementation

Deploy the existing `enqueue-report` function - no code changes needed.

## Validation

After deployment:
1. Navigate to an application workspace
2. Click "Generate Report"
3. Verify the generation starts and Step 0 begins processing
4. Check edge function logs confirm `enqueue-report` is being called successfully

