
# Fix: Standardize CORS Headers Across All Edge Functions

## Problem Summary

Two issues were reported:
1. **Errors persist** - Various edge functions are failing from the custom domain (`grantgenius.disruptorsco.com`)
2. **Cancel button disappeared** - The Cancel Generation button is not appearing

## Root Cause

The **cancel-report-run** edge function (along with 12 other functions) has incomplete CORS headers:

```typescript
// Current (incomplete) - Lines 4-8 in cancel-report-run/index.ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

Missing headers that the Supabase JS client sends:
- `x-supabase-client-platform-version`
- `x-supabase-client-runtime`
- `x-supabase-client-runtime-version`

When the browser preflight check fails, the function invocation silently fails, making it appear as if the Cancel button doesn't exist (the UI likely hides it when the `cancelRun` function fails).

## Functions Requiring Updates

| Function | Status | Impact |
|----------|--------|--------|
| cancel-report-run | ❌ Outdated | Cancel button broken |
| resume-report-run | ❌ Outdated | Resume Report broken |
| clear-and-restart-run | ❌ Outdated | Clear & Restart broken |
| enqueue-report | ❌ Outdated | Report generation broken |
| create-checkout | ❌ Outdated | Purchases broken |
| generate-pdf | ❌ Outdated | PDF exports broken |
| worker-proxy | ❌ Outdated | Worker communication broken |
| regenerate-step-prompt | ❌ Outdated | Admin prompt editing broken |
| process-grant-guidelines | ❌ Outdated | Guidelines processing broken |
| invite-admin | ❌ Outdated | Admin invites broken |
| analyze-grant-guidelines | ❌ Outdated | Grant analysis broken |
| send-report-email | ❌ Outdated | Email notifications broken |
| enqueue-cloud-run | ❌ Outdated | Cloud Run dispatch broken |

## Solution

Update the `corsHeaders` object in all 13 functions to match the working standard:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
```

## Files to Modify

1. `supabase/functions/cancel-report-run/index.ts` - Lines 4-8
2. `supabase/functions/resume-report-run/index.ts` - Lines 4-8
3. `supabase/functions/clear-and-restart-run/index.ts` - Lines 4-8
4. `supabase/functions/enqueue-report/index.ts` - Lines 3-7
5. `supabase/functions/create-checkout/index.ts` - Lines 5-9
6. `supabase/functions/generate-pdf/index.ts` - Lines 3-7
7. `supabase/functions/worker-proxy/index.ts` - Lines 5-9
8. `supabase/functions/regenerate-step-prompt/index.ts` - Lines 4-8
9. `supabase/functions/process-grant-guidelines/index.ts` - Lines 4-8
10. `supabase/functions/invite-admin/index.ts` - Lines 4-8
11. `supabase/functions/analyze-grant-guidelines/index.ts` - Lines 4-8
12. `supabase/functions/send-report-email/index.ts` - Lines 4-8
13. `supabase/functions/enqueue-cloud-run/index.ts` - Lines 4-8

## Technical Details

### Why the Cancel Button Disappeared

Looking at the UI component (`GenerationProgress.tsx`), the Cancel button is conditionally rendered:

```tsx
{onCancel && (
  <Button onClick={onCancel}>Cancel Generation</Button>
)}
```

The `onCancel` prop comes from `useReportGeneration` hook's `cancelRun` function. When called from the custom domain, the CORS preflight fails silently, which may cause React Query or the Supabase client to throw errors that affect the conditional rendering.

### Standard CORS Headers

All edge functions should use identical CORS headers to ensure consistent behavior across all origins:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
```

## Expected Outcome

After updating all 13 functions:
1. Cancel button will appear and work correctly
2. Resume/Retry actions will work
3. Report generation will function properly
4. PDF exports will work
5. Payment checkout will work
6. All admin operations will function correctly
