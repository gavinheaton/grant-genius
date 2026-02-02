
# Fix Worker Logs Visibility & Pipeline Generator

## Issues Identified

### 1. Worker Logs Disappear
The logs disappear because:
- **`useReportGeneration.ts`** (line 116): Only fetches runs with `status IN ['pending', 'running']`
- Once a run completes/fails, the next poll returns nothing, setting `activeRun = null`
- **`ApplicationWorkspace.tsx`** (line 359): Only renders `GenerationProgress` for `isGenerating`, `failed`, or `stalled` status - not `completed`
- When `activeRun` becomes `null`, the entire progress card (including logs) unmounts

### 2. Report Generation Failed
The error `Finalize FAILED: No step output found with 'report_html' field` occurs because:
- The pipeline bundle for "AEA Ignite 2026" was generated BEFORE the fix was deployed
- The `finalize_report_html` step in this bundle still has the old broken prompt
- The fix only applies to newly generated pipelines

## Solution

### Part 1: Keep Logs Visible After Completion/Failure

**File: `src/hooks/useReportGeneration.ts`**
- Modify `checkActiveRun` to also fetch the most recent `completed` or `failed` run (not just pending/running)
- Add a new query to fetch the last run regardless of status if no active run is found
- This ensures `activeRun` remains populated after completion

```typescript
// After checking for active runs, if none found, fetch the most recent run
if (!data) {
  const { data: recentRun } = await supabase
    .from("report_runs")
    .select("id, status, current_step, total_steps, created_at, started_at, completed_at, email_on_complete")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
    
  if (recentRun && (recentRun.status === "completed" || recentRun.status === "failed" || recentRun.status === "stalled")) {
    setActiveRun(recentRun as ReportRun);
    fetchSteps(recentRun.id);
  }
}
```

**File: `src/pages/ApplicationWorkspace.tsx`**
- Update the conditional rendering to also show `GenerationProgress` when status is `completed`
- Add a prop to indicate the run is completed so the UI can adjust messaging

```typescript
// Line 359: Add completed status to the condition
{!isStarting && (isGenerating || activeRun?.status === "failed" || activeRun?.status === "stalled" || activeRun?.status === "completed") && activeRun && (
  <GenerationProgress
    // ... existing props
  />
)}
```

**File: `src/components/workspace/GenerationProgress.tsx`**
- The log viewer is already shown for any `activeRunId` (lines 357-360) - this is correct
- No changes needed here

### Part 2: Fix Existing Pipeline Bundle

The fix to `process-grant-guidelines` was deployed, but it only affects NEW pipelines. For the existing "AEA Ignite 2026" bundle:

**Option A: Regenerate the Pipeline**
- Delete the current prompt bundle
- Re-upload the grant guidelines to regenerate the pipeline with the fixed templates

**Option B: Manually Fix the Prompt** (Using Inline Editor)
- Go to Admin > Grants > AEA Ignite 2026 > Pipeline tab
- Expand the pipeline editor
- Find Step 10 (`finalize_report_html`)
- Update the prompt to correctly reference `step8.sections_html` and `step9.tables`

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useReportGeneration.ts` | Add fallback query to fetch most recent completed/failed run |
| `src/pages/ApplicationWorkspace.tsx` | Include `completed` status in render condition |

## Implementation Details

### `useReportGeneration.ts` Changes

Update the `checkActiveRun` function (~lines 109-165):

```typescript
const checkActiveRun = useCallback(async () => {
  if (!applicationId) return;

  // First, check for active runs (pending/running)
  const { data, error } = await supabase
    .from("report_runs")
    .select("id, status, current_step, total_steps, created_at, started_at, completed_at, email_on_complete")
    .eq("application_id", applicationId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error checking active run:", error);
    return;
  }

  if (data) {
    // Active run found - existing logic
    // ... stale detection, 504 error checking, etc.
    setActiveRun(runData);
    setIsGenerating(true);
    fetchSteps(data.id);
  } else {
    // No active run - check for recent completed/failed run to keep logs visible
    const { data: recentRun } = await supabase
      .from("report_runs")
      .select("id, status, current_step, total_steps, created_at, started_at, completed_at, email_on_complete")
      .eq("application_id", applicationId)
      .in("status", ["completed", "failed", "stalled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentRun) {
      // Keep the recent run in state so logs remain visible
      const failedSteps = steps.filter(s => s.status === 'failed');
      const has504Error = failedSteps.some(s => isTransientError(s.error_message));
      
      setActiveRun({
        ...recentRun,
        completed_at: recentRun.completed_at ?? null,
        email_on_complete: recentRun.email_on_complete ?? false,
        is504Error: has504Error,
      } as ReportRun);
      fetchSteps(recentRun.id);
    } else {
      setActiveRun(null);
    }
    setIsGenerating(false);
  }
}, [applicationId, fetchSteps, steps]);
```

### `ApplicationWorkspace.tsx` Changes

Update line 359 to include `completed` status:

```typescript
{!isStarting && (isGenerating || activeRun?.status === "failed" || activeRun?.status === "stalled" || activeRun?.status === "completed") && activeRun && (
```

## Expected Behavior After Fix

1. **During generation**: Progress card visible with logs
2. **After completion**: Progress card remains visible showing "Report generation complete!" with logs accessible
3. **After failure**: Progress card remains visible with error message and logs
4. **User starts new generation**: Old run clears, new run takes over
5. **Page refresh**: Most recent run (including completed) is fetched, logs remain accessible

## Testing

1. Start a report generation and let it complete
2. Verify the progress card stays visible after completion
3. Verify logs remain accessible and expandable
4. Refresh the page - logs should still be accessible
5. Start a new generation - old run should be replaced
