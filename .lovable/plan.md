

## Fix: Dashboard falsely flags active runs as "stalled"

### Root Cause

The Admin Dashboard's stalled run detection (line 111 of `AdminDashboard.tsx`) uses this filter:

```typescript
.lt("started_at", fiveMinutesAgo)
```

This checks if the **run's overall start time** is more than 5 minutes ago. A run that started 15 minutes ago but is actively processing step 9 of 10 will be incorrectly flagged as "stalled."

The researcher-side code (`useReportGeneration.ts`) already does this correctly by checking the **most recent step activity** timestamp. The dashboard needs the same approach.

### Fix

**`src/pages/admin/AdminDashboard.tsx`**

Replace the simple `started_at < 5min ago` filter with a two-step approach:

1. Fetch all running/pending runs (no time filter on the query itself)
2. For each run, fetch the latest `report_run_steps` row to get the most recent activity timestamp (`started_at` or `completed_at`)
3. Only mark a run as stalled if the latest step activity is older than 5 minutes

Concretely:
- Remove the `.lt("started_at", fiveMinutesAgo)` filter from the stalled runs query
- After fetching, query `report_run_steps` for each run to get the latest step's timestamps
- Filter client-side: a run is stalled only if `max(latest_step.started_at, latest_step.completed_at, run.started_at)` is more than 5 minutes ago
- Update `stalled_duration_minutes` to use the time since last activity (not since run start)

### Why this fixes the mismatch

The dashboard will no longer flag a run as stalled when it's actively completing steps. Only runs where no step has had any activity for 5+ minutes will appear in the stalled runs alert. This matches the researcher-side behavior and eliminates the false positive.

### Files Changed

| File | Change |
|---|---|
| `src/pages/admin/AdminDashboard.tsx` | Replace `started_at`-based stalled detection with activity-based detection using `report_run_steps` |

