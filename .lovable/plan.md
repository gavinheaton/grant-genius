
# Fix: Allow Status Reset for Stalled/Failed Report Runs

## Problem Identified

When clicking "Try Again" on a stalled report run, you get a 400 error. This happens because:

1. The `retryFromFailedStep` function in the frontend tries to update the run's status to `"pending"` in the database
2. **The `report_runs` table has no UPDATE RLS policy for users** - users can only INSERT and SELECT
3. The update silently fails, so the status remains `"running"` 
4. When `resume-report-run` is called, it checks `status === "pending"` and returns 400 because the status wasn't actually changed

## Solution

Add a database RLS policy that allows users to update their own report runs (specifically for status changes to retry/resume).

## Database Change Required

Add an UPDATE policy on the `report_runs` table:

```sql
-- Allow users to update their own report runs (for retry/cancel)
CREATE POLICY "Users can update own report runs"
  ON report_runs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = report_runs.application_id
      AND applications.user_id = auth.uid()
    )
  );
```

## Files/Changes

| Change | Description |
|--------|-------------|
| Database Migration | Add UPDATE policy on `report_runs` for authenticated users to reset status on their own runs |

## Why This Is Safe

- The policy only allows users to update runs belonging to their own applications (via the ownership check through the `applications` table)
- This is the same ownership logic used for the existing SELECT and INSERT policies
- Users already own this data; they just couldn't modify it before

## Flow After Fix

```text
User clicks "Try Again"
        │
        ▼
Frontend: UPDATE report_runs SET status = 'pending' WHERE id = X
        │
        ▼
RLS: Check if user owns the application ✓
        │
        ▼
Status updated to 'pending'
        │
        ▼
Frontend: Call resume-report-run edge function
        │
        ▼
Edge function: Check status === 'pending' ✓
        │
        ▼
Generation resumes from checkpoint
```
