
Goal
- Fix the "generation timed out and would not restart" loop where the run gets stuck at the final stage and clicking "Try Again" causes repeated `resume-report-run` 400 errors.

## COMPLETED ✅

### Changes Made

**A) Backend: `resume-report-run` now recovers from step 11 stalls**

File: `supabase/functions/resume-report-run/index.ts`

1. Added Step 11 recovery logic after fetching the report run:
   - If `current_step >= 11` AND no report exists → reset step 11 to pending and treat as "resume from step 10"
   - If `current_step >= 11` AND report exists → return success with `ALREADY_COMPLETE` code
2. Changed validation to use `effectiveResumeFromStep` instead of raw `current_step`
3. Split status validation into separate check for better error messages
4. Added explicit error handling in `createFinalReport()` to catch and throw if report insert fails

**B) Frontend: `retryFromFailedStep` now handles all cases**

File: `src/hooks/useReportGeneration.ts`

1. Added third branch for `current_step >= 11`:
   - Sets status to pending
   - Calls `resume-report-run` which triggers backend recovery
   - Shows "Retrying final assembly" toast
2. After cancel+restart (step 0 case):
   - Clears `resumeAttemptedRef.current` to prevent stale resume attempts
   - Sets `activeRun` to null before calling `startGeneration()`

### Testing Checklist

- [ ] Step 0 failure: cancels + restarts cleanly
- [ ] Step 2-10 failure: resumes from checkpoint
- [ ] Step 11 stall (no report): resets and re-runs step 11
- [ ] Step 11 complete (report exists): returns success, no error
- [ ] No "Resuming report generation..." spam in console
- [ ] No 400 errors from resume-report-run
