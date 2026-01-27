

# Fix: CORS Error in Generate Report Function

## Problem Identified

The browser is blocking requests to the `generate-report` edge function because the CORS configuration is missing a required header.

**Error:**
```
Request header field x-supabase-client-platform is not allowed by Access-Control-Allow-Headers in preflight response
```

**Root Cause:**
The `generate-report` function's CORS headers don't include `x-supabase-client-platform`, which the Supabase client automatically sends with every request.

| Function | CORS Headers |
|----------|--------------|
| `create-checkout` | `authorization, x-client-info, apikey, content-type, x-supabase-client-platform` |
| `generate-report` | `authorization, x-client-info, apikey, content-type` (missing!) |

---

## Solution

Update the CORS headers in `supabase/functions/generate-report/index.ts` to include the missing header.

**Change (line 4-7):**
```typescript
// Before
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// After
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};
```

---

## Implementation Steps

1. Update the `corsHeaders` constant in `generate-report/index.ts` to add `x-supabase-client-platform`
2. The edge function will automatically redeploy
3. Test the "Generate Report" button - it should now work without CORS errors

This is a one-line fix that matches the working pattern used in the `create-checkout` function.

