

## Fix: Final Step Crash and Missing Notifications

### Root Cause

The edge function logs show the exact error:

```
Step 21 failed: ReferenceError: ownerUserId is not defined
    at processSingleStep (resume-report-run/index.ts:652:106)
```

Two bugs in `supabase/functions/resume-report-run/index.ts`:

1. **Variable name mismatch**: `processSingleStep` receives the user ID as parameter `userId` (line 538), but line 765 inside the function references `ownerUserId` — which doesn't exist in that scope. This crashes the final step every time, preventing report creation, email notification, and dashboard update.

2. **Wrong user ID passed**: Line 493 passes the calling admin's `userId` instead of `ownerUserId` (the researcher who owns the application). Even after fixing the variable name, the report would be incorrectly assigned to the admin.

### Fix

**`supabase/functions/resume-report-run/index.ts`** — two line changes:

- **Line 493**: Change `userId` to `ownerUserId` so the researcher's ID is passed to `processSingleStep`
- **Line 765**: Change `ownerUserId` to `userId` (the parameter name used inside `processSingleStep`)

This ensures:
- The final step no longer crashes with a `ReferenceError`
- The report is assigned to the researcher (not the admin)
- The completion email fires
- The application status updates to "ready" and appears on the dashboard

