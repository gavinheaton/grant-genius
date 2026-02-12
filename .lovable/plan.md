

## Fix: Show "In Progress" Status on Dashboard During Report Generation

### Problem
When a report is being generated, the application card on the Dashboard still shows "Draft" because nothing updates the `applications.status` column from `draft` to `in_progress` when automated report generation begins.

The `worker-proxy` already sets status to `ready` on completion, but the transition to `in_progress` at the start is missing.

### Solution
Update the `generate-report` edge function to set the application status to `in_progress` when a report run is successfully created. This mirrors the pattern already used in `submit-manual-request` for manual grants.

### Changes

**`supabase/functions/generate-report/index.ts`**
- After successfully creating the `report_run` record and before dispatching to the worker, add an update:
  ```sql
  UPDATE applications SET status = 'in_progress' WHERE id = application_id
  ```
- This ensures the Dashboard immediately reflects that the application is being processed.

**`src/pages/Dashboard.tsx`** (minor label improvement)
- Update the `in_progress` status config label from "In Progress" to "Processing" for clearer user communication (the current "In Progress" label is fine but "Processing" better describes what's happening with automated reports).

### No other changes needed
- The `worker-proxy` already sets status to `ready` on completion
- The `worker-proxy` / failure handlers can optionally set status to `failed` (already handled or can be added as a follow-up)
- The Dashboard `statusConfig` already has an `in_progress` entry with the correct badge styling

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/generate-report/index.ts` | Add `applications.status = 'in_progress'` update after creating the report run |
| `src/pages/Dashboard.tsx` | Optionally update label from "In Progress" to "Processing" for clarity |

