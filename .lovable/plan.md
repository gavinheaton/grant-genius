

# Fix CORS Error for Stripe Checkout

## Problem

The Supabase JavaScript client automatically sends an `x-supabase-client-platform` header with every request. The `create-checkout` edge function's CORS configuration doesn't include this header in the allowed list, causing the browser to block the request during the preflight check.

**Error:**
```
Request header field x-supabase-client-platform is not allowed by Access-Control-Allow-Headers in preflight response
```

## Solution

Update the `corsHeaders` in the `create-checkout` edge function to include the `x-supabase-client-platform` header.

---

## Changes Required

### File: `supabase/functions/create-checkout/index.ts`

**Current (line 5-8):**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

**Updated:**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};
```

---

## Why This Happens

The Supabase JS client (v2.93.1 in this project) automatically includes the `x-supabase-client-platform` header to identify the client platform (e.g., "js-browser"). This is a relatively recent addition to the client library.

When the browser makes a preflight `OPTIONS` request, it checks if the server allows all the headers the client wants to send. Since `x-supabase-client-platform` wasn't in the allowed list, the browser blocked the actual request.

---

## Summary

| File | Change |
|------|--------|
| `supabase/functions/create-checkout/index.ts` | Add `x-supabase-client-platform` to allowed CORS headers |

This is a one-line fix. After deployment, the checkout flow will work correctly from any origin including your custom domain `grantgenius.disruptorsco.com`.

