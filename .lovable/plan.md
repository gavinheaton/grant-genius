

## Add Resume and Restart Buttons to Stalled Runs Table

### Problem

The Stalled Runs table on the Admin Dashboard only offers "Force Fail" for stuck runs. The "Resume" and "Clear & Restart" actions exist on the Run Detail page but only appear for `failed` runs. This forces admins into a clunky two-step workflow: Force Fail, then navigate to the run detail page to Resume.

For stalled runs (still in `running`/`pending` status), admins should be able to attempt a Resume directly -- the worker may have silently died but the run state is still valid for resumption.

### Changes

**File: `src/components/admin/StalledRunsTable.tsx`**

1. Add a `handleResume` function that calls the `resume-report-run` edge function with the run ID
2. Add a `handleRestart` function that calls `clear-and-restart-run` (Super Admin only)
3. Replace the single "Force Fail" button with a button group containing:
   - **Resume** (primary) -- attempts to re-dispatch the stalled step
   - **Force Fail** (destructive, with confirmation dialog) -- existing behavior
4. Accept `isSuperAdmin` as a prop to conditionally show "Clear & Restart"

**File: `src/pages/admin/AdminDashboard.tsx`**

1. Pass `isSuperAdmin` from `useAdminAuth()` down to `StalledRunsTable`

### Updated Action Column Layout

```text
[ Resume ]  [ Force Fail ]        (for all admins)
[ Resume ]  [ Restart ]  [ Force Fail ]   (for super admins)
```

- Resume: outline variant, Play icon
- Restart: outline variant, RotateCcw icon (super admin only)
- Force Fail: destructive variant with confirmation dialog (unchanged)

### Technical Notes

- The `resume-report-run` edge function already accepts runs in both `pending` and `failed` states, so it will work for stalled runs without modification
- The `clear-and-restart-run` function works on any non-completed run
- Loading states will track which action is in progress per run (e.g., `actionState: { runId, action }`)
- After any action succeeds, the dashboard query is invalidated to refresh the table

### Files Changed

| File | Change |
|---|---|
| `src/components/admin/StalledRunsTable.tsx` | Add Resume and Restart handlers; expand action column with button group; accept `isSuperAdmin` prop |
| `src/pages/admin/AdminDashboard.tsx` | Import `useAdminAuth`, pass `isSuperAdmin` to `StalledRunsTable` |

