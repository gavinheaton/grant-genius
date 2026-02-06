

# Fix: Report Recovery Function Not Working

## Problem Summary

You reported two issues:
1. Step 13 (Finalize Report Html) failed with "No step output found with 'report_html' field"
2. The "Recover Final Step" button did not work

## Root Causes Identified

### Issue 1: Function Not Deployed
The `recover-finalize-report` edge function was in the config file but **was never deployed**. When called, it returned a 404 error.

**Fix**: I manually deployed the function just now. It's now live and responding.

### Issue 2: CORS Headers Incomplete
The function has outdated CORS headers that don't include all the Supabase client headers. When called from the custom domain, the preflight request will fail.

Current headers (incomplete):
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

Required headers (matching `generate-docx` and `trigger-deploy`):
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
```

## Database Analysis

I verified the failed run data:

| Step | Name | Status | Data Available |
|------|------|--------|----------------|
| 11 | assemble_sections_html | completed | sections_html (10,925 chars), data_gaps |
| 12 | build_tables_sources_html | completed | tables, all_sources |
| 13 | finalize_report_html | failed | empty {} |

The recovery function has all the data it needs - steps 11 and 12 contain valid `sections_html`, `tables`, and `all_sources`. Once the CORS is fixed, recovery should work.

## Solution

### File to Modify

**supabase/functions/recover-finalize-report/index.ts**

Update lines 5-9 to use the complete CORS headers:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
```

## Expected Outcome

After this fix:
1. The "Recover Final Step" button will work from the custom domain
2. The function will merge `sections_html` from step 11 with `tables` and `sources` from step 12
3. A new report will be created with the recovered content
4. The run status will be updated to "completed"

## What I Already Did

- Deployed the `recover-finalize-report` function (it was missing from deployment)
- Verified the function is now live and responding (401 = auth required, which is correct)

