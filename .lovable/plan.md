

# Fix: CORS Headers for generate-docx and trigger-deploy

## Problem

Two edge functions are failing CORS preflight checks when called from the custom domain `grantgenius.disruptorsco.com`:

1. **generate-docx**: Missing `OPTIONS` method in `Access-Control-Allow-Methods`
2. **trigger-deploy**: Missing `x-supabase-client-platform` (and related headers) in `Access-Control-Allow-Headers`

## Root Cause

The `trigger-deploy` function was created with incomplete CORS headers:
```javascript
// Current (incomplete)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

The Supabase JS client sends additional headers that must be explicitly allowed:
- `x-supabase-client-platform`
- `x-supabase-client-platform-version`
- `x-supabase-client-runtime`
- `x-supabase-client-runtime-version`

Both functions are also missing the `Access-Control-Allow-Methods` header which should include `OPTIONS`.

## Solution

Update the CORS headers in both functions to match the standard configuration used by other edge functions.

### Files to Modify

**supabase/functions/trigger-deploy/index.ts**

Update lines 3-7 to use the full CORS headers:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
```

**supabase/functions/generate-docx/index.ts**

Update lines 21-25 to add the missing `Access-Control-Allow-Methods` header:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
```

## Technical Details

### Why These Headers Are Needed

| Header | Purpose |
|--------|---------|
| `Access-Control-Allow-Origin: *` | Allows requests from any origin (including custom domains) |
| `Access-Control-Allow-Headers` | Lists all headers the browser is permitted to send |
| `Access-Control-Allow-Methods` | Lists HTTP methods allowed for the endpoint |

### Supabase Client Headers

The Supabase JS SDK (`@supabase/supabase-js`) automatically includes these headers in every request:
- `x-supabase-client-platform` - Platform identifier
- `x-supabase-client-platform-version` - Platform version
- `x-supabase-client-runtime` - Runtime (e.g., "browser")
- `x-supabase-client-runtime-version` - Runtime version

If these aren't listed in `Access-Control-Allow-Headers`, the browser blocks the preflight request.

## Expected Outcome

After these changes and republishing:
- DOCX export will work from the custom domain
- The "Deploy" button in System Health will work
- Both functions will pass health checks without CORS errors

