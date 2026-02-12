

## Two Changes

### 1. Force Fail: Reset counters and clear logs

When an admin triggers "Force Fail" (via `cancel-report-run` from the RunDetail page, or `cleanup-stalled-runs` from the StalledRunsTable), the run should be fully reset so it looks clean in the dashboard.

**Changes needed:**

**`supabase/functions/cancel-report-run/index.ts`**
- After marking the run as failed, also reset `current_step` to 0 and `phase` to null in the same update
- Add a step to DELETE all `report_logs` rows for this run (clears the worker log panel)

**`supabase/functions/cleanup-stalled-runs/index.ts`**
- Same changes: reset `current_step` to 0 in the run update
- Add DELETE from `report_logs` where `report_run_id` matches

The update block in `cancel-report-run` changes from:
```
.update({ status: "failed", completed_at: now })
```
to:
```
.update({ status: "failed", completed_at: now, current_step: 0, phase: null })
```

Plus a new query:
```
await supabaseAdmin.from("report_logs").delete().eq("report_run_id", reportRunId);
```

The same pattern applies to `cleanup-stalled-runs`.

### 2. Report generation status

The current active run (`135a2991`) is at step 9 of 10 and was last seen processing "identify_partners" at 08:48 UTC. Worker logs show it progressing normally through all steps. There is **no failure recorded** -- the run status is still `running`. 

It may appear stalled because it has been on step 9 for a while (Cloud Run AI calls can take several minutes). If the run does not complete soon, you can use the Force Fail button to clean it up and retry.

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/cancel-report-run/index.ts` | Reset `current_step` to 0, clear `phase`, delete `report_logs` |
| `supabase/functions/cleanup-stalled-runs/index.ts` | Reset `current_step` to 0, delete `report_logs` |

