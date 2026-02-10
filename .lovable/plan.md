

## Fix: validate-pipeline Edge Function DNS Error

### Problem

The `validate-pipeline` edge function fails with a DNS error because it calls the wrong AI gateway URL:
- **Current (broken):** `https://ai.lovable.dev/api/v1/chat/completions`
- **Correct (used by all other functions):** `https://ai.gateway.lovable.dev/v1/chat/completions`

### Changes

**`supabase/functions/validate-pipeline/index.ts`**

1. Change the fetch URL from `https://ai.lovable.dev/api/v1/chat/completions` to `https://ai.gateway.lovable.dev/v1/chat/completions`
2. No other changes needed -- the rest of the function (auth, request body, response parsing) is correct

This is a one-line fix. All other edge functions in the project (admin-assistant, analyze-grant-guidelines, process-grant-guidelines, regenerate-step-prompt) already use the correct gateway URL.

