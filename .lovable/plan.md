
# Add "Try Again" Button for Stalled Report Runs

## Problem

When a report generation stalls at a step (e.g., step 5), the user only sees a "Cancel & Retry" button. This cancels the run entirely, losing all progress. The user wants a "Try Again" button that resumes from the last checkpoint instead.

## Solution

Add a "Try Again" button for stalled runs that works the same way as for failed runs - it resets the status and resumes from the checkpoint without losing progress.

## What You'll See

When a run is stalled, you'll now see two options:
- **Try Again** (primary) - Resumes from the last successful step
- **Cancel & Start Over** (secondary) - Cancels the run entirely (renamed for clarity)

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/workspace/GenerationProgress.tsx` | Add "Try Again" button to stalled state UI |
| `src/pages/ApplicationWorkspace.tsx` | Pass `onRestart` prop for stalled runs, update display condition |

## Implementation Details

### 1. GenerationProgress.tsx - Update Stalled State UI

```typescript
{status === "stalled" && (
  <div className="space-y-3">
    <p className="text-sm text-warning">
      Generation appears to have stalled. This can happen due to high demand or network issues.
    </p>
    <div className="flex gap-2">
      {onRestart && (
        <Button variant="default" size="sm" onClick={onRestart} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      )}
      {onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel} className="gap-2">
          <XCircle className="h-4 w-4" />
          Cancel & Start Over
        </Button>
      )}
    </div>
  </div>
)}
```

### 2. ApplicationWorkspace.tsx - Pass onRestart for Stalled Runs

Update the display condition and props:

```typescript
{/* Progress Indicator */}
<div ref={progressRef}>
  {(isGenerating || activeRun?.status === "failed" || activeRun?.status === "stalled") && activeRun && (
    <GenerationProgress
      currentStep={activeRun.current_step}
      totalSteps={activeRun.total_steps}
      status={activeRun.status}
      onCancel={activeRun.status === "stalled" ? () => cancelRun(activeRun.id) : undefined}
      onRestart={
        (activeRun.status === "failed" || activeRun.status === "stalled") 
          ? () => retryFromFailedStep(activeRun.id) 
          : undefined
      }
    />
  )}
</div>
```

## User Experience

```text
Before (stalled):
┌─────────────────────────────────────────────────────┐
│ 🕐 Generating Report                                │
├─────────────────────────────────────────────────────┤
│ Stalled at step 5/10                           50%  │
│ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                     │
│ Generation appears to have stalled...               │
│                                                     │
│ [Cancel & Retry]                                    │
└─────────────────────────────────────────────────────┘

After (stalled):
┌─────────────────────────────────────────────────────┐
│ 🕐 Generating Report                                │
├─────────────────────────────────────────────────────┤
│ Stalled at step 5/10                           50%  │
│ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                     │
│ Generation appears to have stalled...               │
│                                                     │
│ [🔄 Try Again]  [Cancel & Start Over]               │
└─────────────────────────────────────────────────────┘
```

## How It Works

When "Try Again" is clicked for a stalled run:
1. The run's status is reset to `pending` in the database
2. The `resume-report-run` edge function is called
3. Generation resumes from the last checkpoint (step 5 in this case)
4. No credit is consumed again since the original credit is still tied to this run
