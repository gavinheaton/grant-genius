

## Make Resume Always Available on Run Detail Page

### Problem
The Resume button on the Run Detail page (`/admin/runs/:runId`) is only visible when `run.status === "failed"`. If a run is stalled but still has status `"running"` or `"pending"`, you only see "Force Fail" -- no way to resume without first failing it. This is why you didn't see Resume and used "Clear & Restart" instead.

The Stalled Runs table on the dashboard already shows Resume for any status, so this is an inconsistency.

### Changes

**`src/pages/admin/RunDetail.tsx`**

1. Show the **Resume** button for `failed`, `running`, and `pending` statuses (not just `failed`)
2. Add a **confirmation dialog** to "Clear & Restart" warning that all step progress will be lost, with a suggestion to try Resume first
3. Improve button labels:
   - Resume → **"Resume from Step {n}"** (showing current step number)
   - Clear & Restart → **"Wipe & Restart"** (destructive variant)
4. Add a progress summary line above the action buttons: "Completed {current_step} of {total_steps} steps" so you can see what would be lost
5. Move "Force Fail" to only show alongside Resume (when status is `running`/`pending`), keeping it as a secondary action

### Button Visibility Matrix

| Status    | Resume from Step N | Force Fail | Wipe & Restart (SA) |
|-----------|-------------------|------------|---------------------|
| pending   | Yes               | Yes        | Yes + confirm       |
| running   | Yes               | Yes        | Yes + confirm       |
| failed    | Yes               | No         | Yes + confirm       |
| completed | No                | No         | No                  |

