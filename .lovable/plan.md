
Goal
- Fix the “generation timed out and would not restart” loop where the run gets stuck at the final stage and clicking “Try Again” causes repeated `resume-report-run` 400 errors.

What’s happening (confirmed by backend data)
- There is an active report run for your application with:
  - `status = pending`
  - `current_step = 11`
  - no `reports` row created for that `report_run_id`
- `report_run_steps.step_number = 11` is `running` and never completed.
- When you click “Try Again”, the frontend calls `resume-report-run`, but that function only allows `current_step` in `1..10` (because it treats `current_step` as “checkpoint step”, and the next executed step is `current_step + 1`).
- Result: 400 “not a valid checkpoint” and the UI can’t recover.

Root cause (code-level)
- Step 11 is “special”: it runs and then should create a final report + mark the run completed.
- Step 11 can stall/timeout (edge runtime shutdown / long model call / network), leaving:
  - report_runs.current_step updated to 11 (because executeStep updates it when a step starts/runs/completes)
  - report_runs.status sometimes still pending (because status updates aren’t consistently checked/handled)
  - report_run_steps step 11 stuck in “running”
  - no report created
- The retry logic doesn’t have a branch for “final step got stuck”.

Solution overview
A) Backend: make `resume-report-run` able to recover “stuck at step 11 but not completed”
- Add “final-step recovery” logic before the existing validation:
  1) Detect “final step stuck” state:
     - report_run.current_step >= 11 AND (no report exists for this report_run_id)
  2) Convert that state into a resumable checkpoint:
     - treat it as “resume from step 10” (so the next step executed is step 11 again)
  3) Clean up the step 11 record so the UI + backend aren’t stuck in “running” forever:
     - set report_run_steps(step_number=11) back to pending (or failed then pending) and clear started/completed/error fields if appropriate
  4) Ensure the report run status is set to “running” (and this time handle errors properly), then start processing step 11 again.

B) Frontend: handle “step 11 stuck” in Try Again and avoid auto-resume spam
- Update `retryFromFailedStep` in `src/hooks/useReportGeneration.ts` to add a third branch:
  - If `current_step === 0`: cancel + restart (already implemented)
  - If `1 <= current_step <= 10`: resume from checkpoint (existing behavior)
  - If `current_step >= 11`:
    - call `resume-report-run` directly (after we implement backend recovery), OR set status to pending then call resume
    - show a toast like “Retrying final assembly…” instead of “Resuming from last checkpoint”
- Additionally, after cancel+restart, explicitly clear `resumeAttemptedRef` and reset `activeRun` locally to prevent lingering state from triggering resume calls tied to the old run.

C) Hardening: ensure step 11 can’t silently fail to finalize
- In `createFinalReport()` inside `resume-report-run`:
  - explicitly check `{ error }` responses for:
    - inserting `reports`
    - updating `report_runs` to completed
    - updating `applications` status
  - if any of those fail, throw so the outer try/catch marks the run failed (and refunds appropriately).
- Add a “max wall-clock” protection:
  - if step 11 is “running” for > X minutes, treat it as stalled and allow re-run; log a clear message.

Implementation steps (exact files)
1) Backend function changes
- File: `supabase/functions/resume-report-run/index.ts`
  - Add logic near the top (right after fetching reportRun) to:
    - if `reportRun.current_step >= 11`:
      - check if a `reports` row exists for `report_run_id = reportRunId`
      - if no report exists:
        - set `effectiveResumeFromStep = 10` (instead of rejecting)
        - reset step 11 row in `report_run_steps` (status -> pending, clear timestamps/error)
        - proceed as if resuming from step 10
      - if a report exists:
        - return success response advising frontend to refresh (run is already done) OR mark run completed if needed
  - Change validation to use `effectiveResumeFromStep` (not raw `reportRun.current_step`)
  - Improve safety: check and handle errors on the “set status running” update.

2) Frontend retry improvements
- File: `src/hooks/useReportGeneration.ts`
  - In `retryFromFailedStep`, extend to handle `current_step >= 11`:
    - Don’t attempt “resume from checkpoint” in the old meaning; instead:
      - call `resume-report-run` and let backend re-run final step
      - optionally reset run status to pending first (only if needed)
    - show an appropriate toast (“Retrying final report assembly…”)
  - After the “cancel & restart” branch:
    - clear `resumeAttemptedRef.current`
    - setActiveRun(null) before calling `startGeneration()` to prevent any transient “pending” state from triggering resume logic against the old run id.

3) Verification / testing (in Test environment)
- Create a report run and let it progress to step 11.
- Simulate a stall (or use an already-stuck run).
- Click “Try Again”.
Expected:
  - No repeated “Resuming report generation…” spam
  - No 400 from `resume-report-run`
  - Step 11 restarts and completes
  - A `reports` row is created for the run
  - `report_runs.status` becomes `completed`
- Regression checks:
  - Step 0 failure still cancels + restarts cleanly.
  - Step 2-10 failures still resume from the last checkpoint.
  - A fully completed run doesn’t restart; it just shows the report.

Why this is the best fix
- It preserves user progress (steps 1–10) and only re-runs the final assembly.
- It resolves the current invalid state (`current_step = 11`, no report) without requiring manual backend intervention.
- It closes the gap between “checkpoint model” (1–10) and “finalization step” (11).

Notes / edge cases handled
- If step 11 succeeded but the final report insert failed, we will now fail loudly and mark the run failed (instead of leaving it half-finished).
- If multiple resume calls happen concurrently, step 11 reset + “running” status update will reduce duplicate work; we can also add a simple “lock” check later if needed.

Scope
- No database schema changes required.
- Only code changes to the backend function and the retry logic on the frontend.
