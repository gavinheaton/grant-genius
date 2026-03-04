

## Fix 504 Timeouts in Claude Report Generation

### Root Causes Found

1. **No timeout on Claude API call**: The `fetch` to `api.anthropic.com` at line 238 has no `AbortController`. If Claude takes >150s (which happens with large prompts + 16K max_tokens), the edge function exceeds the wall-clock limit and returns 504.

2. **`validate-references` not in `config.toml`**: The function was created but never registered, so it can't be invoked. The fire-and-forget call silently fails (caught by `.catch()`), which is harmless but means validation never runs.

### Technical Changes

**1. `supabase/functions/run-claude-report/index.ts`**
- Add an `AbortController` with a 120-second timeout to the Claude API call (leaving ~30s buffer for DB operations within the 150s edge limit)
- If the timeout fires, mark the run as failed with a clear message rather than letting the edge function 504

**2. `supabase/config.toml`**
- Add the missing `[functions.validate-references]` entry with `verify_jwt = false`

### Summary
The 504s are caused by the Claude API call running too long with no timeout guard. Adding a 120s abort signal will ensure the function either completes or fails gracefully within the edge function's time limit. Registering `validate-references` in config.toml will also enable the background reference validation to actually run.

