

## Fix: Reset Stalled Grant Version Status

### Problem
Grant version `4b41f191-1cac-4974-b016-d2fb203597e5` is stuck with `ai_analysis_status = 'analyzing'` from the previous failed attempt. The constraint fix has been applied, but the status was never reset, so the UI still shows it as processing.

### Solution
Run a database update to reset the status to `'failed'`, which will show the "Retry Processing" button in the UI. Then you can retry and it should succeed since the constraint now allows `'not_required'`.

### Changes
**1. Database migration** -- reset the stalled grant version:
```sql
UPDATE grant_versions 
SET ai_analysis_status = 'failed', 
    pipeline_generation_status = 'none'
WHERE id = '4b41f191-1cac-4974-b016-d2fb203597e5' 
  AND ai_analysis_status = 'analyzing';
```

No code changes needed. After this reset, navigate to the grant edit page and click "Retry Processing".
