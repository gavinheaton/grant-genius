

# Fix CORS Error in cancel-report-run Edge Function

## Problem

The `cancel-report-run` edge function is failing with a CORS preflight error:
```
Response to preflight request doesn't pass access control check: It does not have HTTP ok status.
```

The browser sends an OPTIONS preflight request before the actual POST request. The current implementation is missing the `Access-Control-Allow-Methods` header and lacks an explicit status code.

## Root Cause

The current CORS headers are incomplete for preflight requests:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};
```

Missing: `Access-Control-Allow-Methods` to specify which HTTP methods are allowed.

## Solution

Update the CORS headers and OPTIONS response in `cancel-report-run`:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Handle OPTIONS with explicit 200 status
if (req.method === "OPTIONS") {
  return new Response(null, { status: 200, headers: corsHeaders });
}
```

## Files to Update

| File | Change |
|------|--------|
| `supabase/functions/cancel-report-run/index.ts` | Add `Access-Control-Allow-Methods` header and explicit `status: 200` for OPTIONS response |

## Consistency Update

For consistency and to prevent similar issues, apply the same fix to other edge functions:
- `supabase/functions/generate-report/index.ts`
- `supabase/functions/resume-report-run/index.ts`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/analyze-grant-guidelines/index.ts`

## Deployment

After updating, the edge function will be automatically redeployed. The CORS preflight should then succeed.

