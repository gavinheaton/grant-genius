

## Reset Stalled Guidelines Analysis

The grant version `788c9051...` is stuck in `analyzing` status. The edge function logs show it completed extraction but likely failed on the final database write-back.

### Fix

Run a database migration to reset the status so you can retry:

```sql
UPDATE grant_versions 
SET ai_analysis_status = 'failed', 
    pipeline_generation_status = 'none'
WHERE id = '788c9051-8efa-4efa-9b80-993b59cb64b0' 
  AND ai_analysis_status = 'analyzing';
```

This will show the "Processing Failed" state in the UI with a "Retry Processing" button.

### Root Cause Investigation

After resetting, I'll also check the `process-grant-guidelines` edge function to ensure the Claude early-return path correctly saves all the extracted data before returning. The logs show the function reached "Claude engine detected -- skipping pipeline generation" but the status was never updated to `completed`, suggesting the DB update in the Claude branch may have an issue (possibly a column name mismatch or RLS policy blocking the service role update).

### Files to Review/Fix
1. **Database**: One-time status reset (migration above)
2. **`supabase/functions/process-grant-guidelines/index.ts`**: Review the Claude early-return branch to ensure the update query is correct and error handling surfaces any DB write failures

