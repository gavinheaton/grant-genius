

# Fix: False "Stalled" Detection When Processing Continues

## Problem Summary

The UI shows "Generation appears to have stalled" even when the pipeline is actively processing. This is a false positive caused by the stale detection logic only checking `started_at` rather than tracking **recent step activity**.

## Root Cause

```text
Pipeline starts at T=0
        │
        ├── Step 1 completes at T=1m
        ├── Step 2 completes at T=2m
        ├── Step 3 completes at T=3m
        ├── Step 4 completes at T=4m
        ├── Step 5 running at T=5m...
        │
        └── STALE CHECK (line 157):
            now - started_at > 5min = TRUE
            → Status set to "stalled" ❌
            
            But Step 5 JUST started! Processing is active.
```

The current logic at line 157 in `useReportGeneration.ts`:
```typescript
const startedAt = new Date(data.started_at || data.created_at);
const now = new Date();
const isStale = now.getTime() - startedAt.getTime() > STALE_THRESHOLD_MS;
```

This doesn't account for:
1. Steps actively completing (progress is happening)
2. Long-running legitimate pipelines (research steps can take 10-15 minutes total)

## Solution

### Option A: Track Last Step Activity Time (Recommended)

Instead of using `started_at`, check the most recent step timestamp:

```typescript
// Find the most recent step activity
const latestStepTime = steps.reduce((latest, step) => {
  const stepTime = step.completed_at || step.started_at;
  if (stepTime) {
    const stepTimestamp = new Date(stepTime).getTime();
    return Math.max(latest, stepTimestamp);
  }
  return latest;
}, new Date(data.started_at || data.created_at).getTime());

const now = Date.now();
const isStale = now - latestStepTime > STALE_THRESHOLD_MS;
```

This way:
- A run that had a step complete 2 minutes ago is NOT stalled
- A run where no step has changed for 5+ minutes IS stalled

### Option B: Increase Threshold for Active Runs

If any step is currently "running", use a longer threshold (e.g., 10 minutes):

```typescript
const hasRunningStep = steps.some(s => s.status === 'running');
const threshold = hasRunningStep ? 10 * 60 * 1000 : STALE_THRESHOLD_MS;
const isStale = now.getTime() - startedAt.getTime() > threshold;
```

### Recommended: Combine Both

```typescript
// 1. Check if there's active step progress recently
const latestStepActivity = steps.reduce((latest, step) => {
  const stepTime = step.completed_at || step.started_at;
  return stepTime ? Math.max(latest, new Date(stepTime).getTime()) : latest;
}, 0);

// 2. A run is stalled if:
//    - No step activity in 5+ minutes AND
//    - The run has been going for at least 5 minutes (to avoid false positives on fresh runs)
const now = Date.now();
const runStartTime = new Date(data.started_at || data.created_at).getTime();
const timeSinceStart = now - runStartTime;
const timeSinceLastActivity = latestStepActivity ? (now - latestStepActivity) : timeSinceStart;

// Only mark as stalled if no step activity for 5+ min
const isStale = timeSinceLastActivity > STALE_THRESHOLD_MS;
```

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useReportGeneration.ts` | Fix stale detection to use last step activity, not run start time |

## Implementation Details

### Location: Lines 153-170 in `checkActiveRun`

Replace the current stale check with activity-based detection:

```typescript
if (data) {
  // Fetch steps first so we can check activity
  const { data: stepData } = await supabase
    .from("report_run_steps")
    .select("step_number, step_name, status, started_at, completed_at, error_message")
    .eq("report_run_id", data.id)
    .order("step_number", { ascending: true });

  const fetchedSteps = (stepData as ReportRunStep[]) || [];
  setSteps(fetchedSteps);

  // Find most recent step activity
  const latestStepActivity = fetchedSteps.reduce((latest, step) => {
    const stepTime = step.completed_at || step.started_at;
    return stepTime ? Math.max(latest, new Date(stepTime).getTime()) : latest;
  }, 0);

  const now = Date.now();
  const runStartTime = new Date(data.started_at || data.created_at).getTime();
  const timeSinceLastActivity = latestStepActivity 
    ? (now - latestStepActivity) 
    : (now - runStartTime);

  // Only stale if no activity for 5+ minutes
  const isStale = timeSinceLastActivity > STALE_THRESHOLD_MS;

  // Check for 504/transient errors
  const failedSteps = fetchedSteps.filter(s => s.status === 'failed');
  const has504Error = failedSteps.some(s => isTransientError(s.error_message));

  const runData: ReportRun = {
    ...data,
    status: isStale ? "stalled" : data.status,
    completed_at: data.completed_at ?? null,
    email_on_complete: data.email_on_complete ?? false,
    is504Error: has504Error,
  } as ReportRun;

  setActiveRun(runData);
  setIsGenerating(true);
}
```

### Also Update Lines 177-210 (Recent Run Check)

Apply the same activity-based stale detection for the "recent completed/failed run" case.

## Testing Checklist

1. Start a report generation
2. Wait 6+ minutes for natural processing time
3. Verify UI does NOT show "stalled" while steps are completing
4. Verify UI DOES show "stalled" if no step activity for 5+ minutes
5. Verify auto-retry still works correctly for actual stalls

## Expected Behavior After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Run at 6 min, step 5 just completed | "Stalled" ❌ | "Running" ✓ |
| Run at 3 min, no steps completing | "Running" | "Running" ✓ |
| Run at 8 min, step 4 stalled for 5+ min | "Stalled" ✓ | "Stalled" ✓ |

