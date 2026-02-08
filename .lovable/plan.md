

# Fix Email URLs to Use Production Domain

## Problem

Email links are resolving to incorrect URLs because the edge functions construct URLs by replacing the Supabase project URL domain, which produces:
- `https://sdrawnxfhiyyiiswqvni.lovable.app` (broken)

Instead of the production domain:
- `https://grantgenius.disruptorsco.com`

## Current State

| Function | URL Construction Method | Result |
|----------|------------------------|--------|
| `submit-manual-request` | `supabaseUrl.replace(".supabase.co", ".lovable.app")` | Broken URL |
| `complete-manual-report` | `supabaseUrl.replace(".supabase.co", ".lovable.app")` | Broken URL |
| `send-report-email` | `Deno.env.get("APP_URL")` with fallback | Works if secret is set |

## Solution

### 1. Add APP_URL Secret

Add an `APP_URL` secret with value `https://grantgenius.disruptorsco.com` so all edge functions can reference the correct production domain.

### 2. Update Edge Functions

Modify both manual processing functions to use the `APP_URL` environment variable with a sensible fallback:

**Pattern to use:**
```javascript
const appUrl = Deno.env.get("APP_URL") || "https://grantgenius.disruptorsco.com";
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/submit-manual-request/index.ts` | Replace URL construction (line 117) with `APP_URL` env lookup |
| `supabase/functions/complete-manual-report/index.ts` | Replace URL construction (line 286) with `APP_URL` env lookup |

---

## Additional: Update Fallback in send-report-email

The `send-report-email` function already uses `APP_URL` but has a fallback to `https://grant-genius-dc.lovable.app`. This should be updated to use the production domain as the fallback:

**File:** `supabase/functions/send-report-email/index.ts`

Change line 70 from:
```javascript
const appUrl = Deno.env.get("APP_URL") || "https://grant-genius-dc.lovable.app";
```
To:
```javascript
const appUrl = Deno.env.get("APP_URL") || "https://grantgenius.disruptorsco.com";
```

---

## Summary

This fix ensures all email links point to the correct production domain by:
1. Adding an `APP_URL` secret for the production domain
2. Updating all three email-related edge functions to use this consistent approach

