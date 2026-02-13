

## Fix: CORS Headers in delete-user Edge Function

The `delete-user` edge function has outdated CORS headers that don't include the `x-supabase-client-platform` header (and related headers) now sent by the Supabase JS client.

### Change

**File: `supabase/functions/delete-user/index.ts`**

Update the `corsHeaders` object from:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
```

To:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
```

This aligns it with the standard CORS headers used by all other edge functions in the project.

| File | Change |
|---|---|
| `supabase/functions/delete-user/index.ts` | Update CORS `Access-Control-Allow-Headers` to include Supabase client platform headers |

