

## Add "Recover Report" Button to Run Detail Page

### Problem
The run `466ad6de` is marked as `completed` (status=completed, step 14/15) but the report (`0d451477`) has no `assembledReport` wrapper — so it renders as empty in the UI. Since the run is "completed", the Resume button is hidden, leaving no way to fix it from the admin panel.

### Existing Infrastructure
There's already a `recover-finalize-report` edge function that does exactly what's needed: it reads completed step outputs, reconstructs the `assembledReport` wrapper with citation normalization, and saves a new report. However:
1. It requires the **owning user's** auth (line 376: `application.user_id !== user.id`) — admins can't call it
2. There's no button in the RunDetail UI to trigger it

### Changes

**1. `supabase/functions/recover-finalize-report/index.ts`**
- Add admin bypass to the ownership check: allow the call if `is_admin(user.id)` or if the user owns the application
- This is a one-line change to the auth guard

**2. `src/pages/admin/RunDetail.tsx`**
- Add a "Recover Report" button that appears for **completed** runs (where currently only "This run completed successfully" is shown)
- The button calls `recover-finalize-report` with `{ reportRunId }`
- On success, show a toast with the recovery strategy used and link to the application workspace
- Also show the Resume button for completed runs (useful if admin wants to re-run the final step instead of recovering)

### Technical Detail

The recover function will:
1. Read all completed `report_run_steps` for this run
2. Find `assemble_sections_html` output → extract `sections_html`
3. Find `build_tables_sources_html` output → extract `tables` + `all_sources`
4. Run citation normalization (APA format)
5. Save a new report with proper `{ assembledReport: { report_html, tables, all_sources } }` structure
6. Mark app status as "ready" and update run

No database changes needed.

