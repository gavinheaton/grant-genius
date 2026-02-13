

## Improve Stalled Runs Table with Diagnostic Context

### Problem

The Stalled Runs table only shows step number and duration, but no diagnostic information to help admins understand **why** a run stalled. The current run (Step 20, clean_citations_apa) has been stuck for 18+ minutes with no error -- admins need to see the step name, engine, and phase to make informed recovery decisions.

### Current Stall

| Field | Value |
|---|---|
| Run ID | `6baf879d` |
| Step | 20 of 22 (clean_citations_apa) |
| Phase | assembly |
| Engine | cloud_run |
| Duration stuck | ~18 minutes |
| Error | None (worker silently stopped) |

The "Force Fail" button will clean this up and refund the credit.

### Fix

**`src/components/admin/StalledRunsTable.tsx`** -- Add step name, engine, and phase columns to give admins diagnostic context at a glance.

**`src/pages/admin/AdminDashboard.tsx`** -- Expand the stalled runs query to include `phase` and `execution_engine` from `report_runs`, and fetch the step name from `report_run_steps` for the current step.

### Updated Stalled Runs Table Columns

| Column | Source | Current | New |
|---|---|---|---|
| User | applications.profiles.email | Yes | Yes |
| Application | applications.title | Yes | Yes |
| Step | step number badge | Number only (e.g. "Step 20/22") | Name + number (e.g. "clean_citations_apa (20/22)") |
| Engine | report_runs.execution_engine | No | Yes (badge: cloud_run / edge) |
| Stalled For | computed duration | Yes | Yes |
| Action | Force Fail button | Yes | Yes |

### Files Changed

| File | Change |
|---|---|
| `src/pages/admin/AdminDashboard.tsx` | Add `phase`, `execution_engine` to stalled runs query; fetch current step name from `report_run_steps` |
| `src/components/admin/StalledRunsTable.tsx` | Add `step_name` and `execution_engine` to the interface and table columns; show step name alongside number; show engine badge |

### Notes

- Phase column omitted from the table to avoid clutter -- the step name already implies the phase (assembly steps are obvious from names like `assemble_sections_html`).
- The existing "Force Fail" flow remains unchanged.
