

## Admin Run Detail Page: Logs + Restart Actions

### What This Adds
A new admin page at `/admin/runs/:runId` that lets you:
1. **View worker logs** for any report run (reusing the existing `useReportLogs` hook and realtime subscription)
2. **See run metadata** -- status, current step, engine, halt reason, timestamps, user email, application title
3. **Take action** -- Resume (from checkpoint), Clear and Restart (fresh), or Force Fail (for stalled runs)
4. **Navigate there easily** -- clickable Run IDs in the Admin Dashboard's failures panel and active runs table

### How It Works

The existing infrastructure already covers most of this:
- `useReportLogs` hook fetches and subscribes to `report_logs` table in realtime
- `clear-and-restart-run` edge function wipes steps and re-enqueues (Super Admin only)
- `resume-report-run` edge function resumes from last checkpoint
- `ReportLogViewer` component renders logs with color-coded levels and expandable JSON details

We just need to wire these together into an admin-facing page.

### Files to Create

| File | Purpose |
|---|---|
| `src/pages/admin/RunDetail.tsx` | New page showing run metadata, action buttons, and worker logs |

### Files to Modify

| File | Change |
|---|---|
| `src/App.tsx` | Add route `/admin/runs/:runId` |
| `src/components/admin/FailuresPanel.tsx` | Make run IDs clickable links to `/admin/runs/:id` |
| `src/components/admin/ActiveRunsTable.tsx` | Make run IDs clickable links to `/admin/runs/:id` |
| `src/components/admin/StalledRunsTable.tsx` | Make run IDs clickable links to `/admin/runs/:id` |

### Run Detail Page Layout

The page will show:

**Header**: Run ID (truncated), status badge, back button

**Metadata Card**:
- Status, phase, execution engine
- Current step / total steps
- Halt reason (if failed)
- User email, application title
- Created, started, completed timestamps

**Action Buttons** (contextual based on status):
- "Resume" -- visible when status is `failed` (calls `resume-report-run`)
- "Clear and Restart" -- visible when status is `failed` (calls `clear-and-restart-run`, Super Admin only)
- "Force Fail" -- visible when status is `running` or `pending` (calls `cancel-report-run`)

**Worker Logs Panel**:
- Reuses the `useReportLogs` hook directly (not the collapsible component, since this is a dedicated page)
- Full-height log viewer with color-coded levels, timestamps, expandable JSON details
- Realtime updates via Supabase subscription

### Technical Details

- The page fetches run data using `supabase.from("report_runs").select(...)` joined with `applications` and `profiles` for context
- Admin RLS is not currently on `report_runs`, but `report_run_steps` has a user-only policy. The logs table (`report_logs`) already has an admin SELECT policy, so logs will work. For the run itself, the admin-assistant already reads runs via service role -- but from the frontend we'll need to fetch via a joined path through `applications` (which has admin SELECT policy)
- Action buttons call the existing edge functions directly via `supabase.functions.invoke()`
- Navigation links use `react-router-dom` `Link` components

