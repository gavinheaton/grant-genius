

# Investigation Report: Timeouts & Admin Dashboard Failures

## Problems Identified

I investigated two interrelated issues:

### 1. Timeouts at Various Steps
**Root Cause**: Supabase Edge Functions have a hard timeout limit (60 seconds wall-clock time). When a step takes longer than this limit:
- The function is forcibly terminated by the platform
- No cleanup code runs (no catch blocks, no finally blocks)
- Database status remains "running" instead of "failed"
- Credits are never refunded

Evidence from the database:
- Current run `ca41a41d-f84c-4d16-9e1b-2b62aa24deb8` has been "running" Step 3 for over 7 minutes
- The step shows `status: running` with no `error_message`
- Edge function logs show `shutdown` events without corresponding error recordings

### 2. Failures Not Appearing on Admin Dashboard
**Root Cause**: The admin dashboard queries only for `status = "failed"`, but timeout-killed runs remain stuck in `status = "running"` forever.

The current query in `AdminDashboard.tsx` (lines 63-77):
```sql
.eq("status", "failed")
```
This misses:
- Runs stuck in "running" status (timed out)
- Runs stuck in "pending" status (never resumed)

---

## Solution Plan

### Part 1: Add "Stalled Runs" Detection to Admin Dashboard

Modify the admin dashboard to detect and display runs that are likely stalled (stuck in running/pending beyond a threshold).

**Changes to `src/pages/admin/AdminDashboard.tsx`:**
- Add a new query for stalled runs (running/pending for >5 minutes)
- Display stalled runs in a new section or as a separate tab in the failures panel
- Allow admins to manually mark runs as failed or trigger cleanup

### Part 2: Create Background Cleanup Edge Function

Create a new edge function `cleanup-stalled-runs` that:
- Finds runs stuck in "running" for >10 minutes
- Marks them as "failed" with an appropriate error message
- Updates the failed step with an error
- Refunds the consumed credit
- Can be triggered manually by admins or via a scheduled job

### Part 3: Add Admin Actions for Stuck Runs

Provide admin controls to:
- View stalled runs with details
- Manually fail a stalled run (with credit refund)
- View the last activity timestamp for each run

---

## Technical Details

### Database Query for Stalled Runs
```sql
SELECT rr.*, a.title, p.email
FROM report_runs rr
JOIN applications a ON a.id = rr.application_id
JOIN profiles p ON p.user_id = a.user_id
WHERE rr.status IN ('running', 'pending')
  AND rr.started_at < NOW() - INTERVAL '5 minutes'
ORDER BY rr.started_at ASC
```

### New Edge Function: `cleanup-stalled-runs`
```text
supabase/functions/cleanup-stalled-runs/index.ts
```
- Accepts optional `stale_threshold_minutes` parameter (default: 10)
- Accepts optional `run_id` to clean up a specific run
- Updates run status to "failed"
- Updates current step with error message "Edge function timed out"
- Refunds credits via existing `refundCredit` pattern

### UI Additions
1. New "Stalled Runs" card in admin dashboard
2. "Force Fail" button for each stalled run
3. Alert badge showing count of stalled runs

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/admin/AdminDashboard.tsx` | Add stalled runs query and display |
| `src/components/admin/StalledRunsTable.tsx` | New component for stalled runs |
| `supabase/functions/cleanup-stalled-runs/index.ts` | New cleanup function |
| `supabase/config.toml` | Add config for new function |

---

## Implementation Order

1. Create `cleanup-stalled-runs` edge function
2. Add StalledRunsTable component
3. Update AdminDashboard to fetch and display stalled runs
4. Add "Force Fail" action that calls the cleanup function
5. Test end-to-end with a stuck run

---

## Expected Outcome

After implementation:
- Admins will see stalled runs prominently in the dashboard
- One-click "Force Fail" will clean up stuck runs and refund credits
- Better visibility into actual system reliability
- Users stuck in limbo will get their credits back

