

## Fix: Duplicate Report Creation and Cancel Ineffectiveness

### What Happened

The ProPresence report run (`4043a0e5`) created **5 separate reports** from a single run, and cancellation did not stop it. Here's why:

### Root Cause 1: No Deduplication in `createFinalReport`

The `createFinalReport` function in `resume-report-run` simply inserts a new report every time it's called. It does not check whether a report already exists for that `report_run_id`. Because the pipeline had retries and concurrent executions (the finalize step ran at least 3 times), each execution created a new report record with an incrementing `version_number` (1 through 5), and each triggered a review workflow entry.

### Root Cause 2: No Cancel Status Check Before Saving

When the user clicked "Cancel", the `cancel-report-run` function correctly marked the run as `failed` in the database. However, the already-in-progress edge function execution did not re-check the run status before calling `createFinalReport`. It continued to completion and saved additional reports.

### Root Cause 3: Concurrent Step Execution Without Locking

The logs show Step 9 (`identify_partners`) started twice concurrently (at 05:25:05 and 05:25:08), and Step 10 (`finalize_report_html`) ran three times. There is no atomic claim/lock mechanism to prevent multiple invocations from processing the same step simultaneously.

### Immediate Data Cleanup

Delete the 4 duplicate reports and their review records, keeping only the latest (version 5, which has the most complete content):

```sql
-- Delete duplicate review records
DELETE FROM report_reviews WHERE report_id IN (
  '168cc89a-4c24-4064-bc75-f7d9ea254ba9',
  '1d54995e-2802-4df4-8e29-cc2f56b5afc9',
  'af9caa00-5e13-4f7a-9095-b026ee02afed',
  '0e142344-f59d-4a8e-a572-6475032d5591'
);

-- Delete duplicate reports (keep version 5)
DELETE FROM reports WHERE id IN (
  '168cc89a-4c24-4064-bc75-f7d9ea254ba9',
  '1d54995e-2802-4df4-8e29-cc2f56b5afc9',
  'af9caa00-5e13-4f7a-9095-b026ee02afed',
  '0e142344-f59d-4a8e-a572-6475032d5591'
);

-- Reset the kept report's version to 1
UPDATE reports SET version_number = 1 WHERE id = '84f24915-a6fd-405b-b6c8-b0221577763b';
```

### Fix 1: Deduplication Guard in `createFinalReport`

**File: `supabase/functions/resume-report-run/index.ts`**

Before inserting a new report, check if one already exists for this `report_run_id`. If it does, skip the insert and return the existing report ID. This prevents duplicate reports from concurrent or retried final steps.

```text
Before insert:
  SELECT id FROM reports WHERE report_run_id = ? LIMIT 1
  If exists -> log "Report already exists, skipping insert" and return existing ID
  If not -> proceed with insert
```

### Fix 2: Cancel Status Check Before Final Save

**File: `supabase/functions/resume-report-run/index.ts`**

In the `createFinalReport` function, re-read the run status from the database before inserting the report. If the status is `failed` (cancelled), abort without saving.

```text
Before insert:
  SELECT status FROM report_runs WHERE id = ?
  If status = 'failed' -> log "Run was cancelled, skipping report save" and return
```

### Fix 3: Atomic Step Claim in `executeStep`

**File: `supabase/functions/resume-report-run/index.ts`**

Add an atomic status transition when starting a step. Use a conditional update that only succeeds if the step is still in `pending` status:

```text
UPDATE report_run_steps 
SET status = 'running', started_at = now() 
WHERE report_run_id = ? AND step_number = ? AND status = 'pending'
RETURNING id

If no rows returned -> another worker already claimed this step, skip execution
```

This prevents two concurrent invocations from both executing the same step.

### Summary of Changes

| File | Change |
|------|--------|
| Database | Delete 4 duplicate reports and reviews for ProPresence |
| `resume-report-run/index.ts` | Add deduplication check in `createFinalReport` |
| `resume-report-run/index.ts` | Add cancel status check before report save |
| `resume-report-run/index.ts` | Add atomic step claim in `executeStep` |

### No New Tables or Schema Changes Required

All fixes are in edge function code plus a one-time data cleanup query.

