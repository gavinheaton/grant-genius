

# Fix: Add generate-docx to config.toml

## Root Cause
The `generate-docx` edge function exists in code (`supabase/functions/generate-docx/index.ts`) but is **not registered** in `supabase/config.toml`. 

The config file lists all other edge functions but is missing:
```toml
[functions.generate-docx]
verify_jwt = false
```

Without this configuration entry, the Lovable deployment system skips this function during publish.

## Solution
Add the missing configuration entry to `supabase/config.toml`.

## File to Modify

**supabase/config.toml**

Add after line 28 (after `generate-pdf`):
```toml
[functions.generate-docx]
verify_jwt = false
```

## Expected Outcome
After this change and a republish:
- The `generate-docx` function will be deployed
- System Health will show it as "OK" instead of "not_deployed"
- DOCX exports will work correctly

## Why verify_jwt = false?
The function handles its own authentication by verifying the user's session token via `supabase.auth.getSession()`. Setting `verify_jwt = false` allows the function to receive requests and handle auth internally, which is consistent with how other export functions (`generate-pdf`) are configured.

