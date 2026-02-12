

## Fix: Admin Run Detail Actions (Resume, Restart, Cancel)

### Root Cause
Two bugs prevent the admin action buttons from working:

1. **Mismatched request body key**: The RunDetail page sends `{ report_run_id: runId }` but all three edge functions (`resume-report-run`, `cancel-report-run`, `clear-and-restart-run`) expect `{ reportRunId: ... }`.

2. **Ownership check blocks admins**: The `resume-report-run` function checks that the calling user owns the application (`ownerUserId !== userId`). When an admin triggers a resume, this check returns 403 Forbidden.

### Fix

**`src/pages/admin/RunDetail.tsx`** -- Change the request body key from `report_run_id` to `reportRunId` to match what the edge functions expect.

**`supabase/functions/resume-report-run/index.ts`** -- After the ownership check, add an admin bypass: if the user has an admin role, skip the ownership validation. This mirrors how `clear-and-restart-run` already handles admin access (it checks for super_admin role instead of ownership).

### Files Changed

| File | Change |
|---|---|
| `src/pages/admin/RunDetail.tsx` | Fix request body: `report_run_id` to `reportRunId` |
| `supabase/functions/resume-report-run/index.ts` | Allow admins to bypass the ownership check |

