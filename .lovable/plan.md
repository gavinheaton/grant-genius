

# Enhanced Real-time Report Progress with Error Display

## Overview
Enhance the current Realtime implementation to also subscribe to `report_runs` status changes and display step-level error messages when failures occur.

## Current State (Already Implemented)
- Realtime enabled for both `report_runs` and `report_run_steps` tables
- Hook subscribes to `report_run_steps` changes for progress updates
- Progress bar uses `completedSteps / totalSteps` calculation
- Step status updates in real-time

## Gaps to Address
1. No subscription to `report_runs` for instant status change detection (completed/failed)
2. `error_message` field not included in step data
3. Failed step error message not displayed in UI

## Implementation Plan

### Phase 1: Update ReportRunStep Interface
**File:** `src/hooks/useReportGeneration.ts`

Add `error_message` to the step interface:
```typescript
export interface ReportRunStep {
  step_number: number;
  step_name: string;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;  // NEW
}
```

### Phase 2: Update fetchSteps to Include error_message
**File:** `src/hooks/useReportGeneration.ts`

Update the query to include `error_message`:
```typescript
const { data, error } = await supabase
  .from("report_run_steps")
  .select("step_number, step_name, status, started_at, completed_at, error_message")
  .eq("report_run_id", runId)
  .order("step_number", { ascending: true });
```

### Phase 3: Add Realtime Subscription for report_runs
**File:** `src/hooks/useReportGeneration.ts`

Subscribe to `report_runs` status changes for instant detection of completion or failure:
```typescript
useEffect(() => {
  if (!isGenerating || !activeRun?.id) return;

  const channel = supabase
    .channel(`report-run-${activeRun.id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'report_runs',
        filter: `id=eq.${activeRun.id}`,
      },
      (payload) => {
        const updated = payload.new as ReportRun;
        setActiveRun(prev => prev ? { ...prev, ...updated } : null);
        
        // Detect completion
        if (updated.status === 'completed') {
          setIsGenerating(false);
          fetchReports();
          toast({ title: "Report ready!", ... });
        }
        
        // Detect failure
        if (updated.status === 'failed') {
          setIsGenerating(false);
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [isGenerating, activeRun?.id]);
```

### Phase 4: Display Failed Step Error in UI
**File:** `src/components/workspace/GenerationProgress.tsx`

Extract error message from failed step and display:
```typescript
// Find failed step and its error message
const failedStep = steps.find(s => s.status === 'failed');
const stepErrorMessage = failedStep?.error_message;

// In the failed state section:
{status === "failed" && (
  <div className="space-y-3">
    {stepErrorMessage && (
      <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
        <strong>Step {failedStep.step_number} failed:</strong> {stepErrorMessage}
      </div>
    )}
    {/* existing error message fallback */}
    {!stepErrorMessage && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
    ...
  </div>
)}
```

### Phase 5: Update ApplicationWorkspace
**File:** `src/pages/ApplicationWorkspace.tsx`

Ensure error messages from steps are accessible (already handled via props).

## Files to Modify
| File | Changes |
|------|---------|
| `src/hooks/useReportGeneration.ts` | Add error_message to interface, update fetch query, add report_runs Realtime subscription |
| `src/components/workspace/GenerationProgress.tsx` | Display failed step error message from database |

## Technical Details

### Realtime Channel Structure
Two separate channels for optimal filtering:
- `report-steps-{runId}` - Step-level progress (INSERT/UPDATE on `report_run_steps`)
- `report-run-{runId}` - Overall status (UPDATE on `report_runs`)

### Error Message Priority
1. First: Show `error_message` from the failed step in `report_run_steps`
2. Fallback: Show general `errorMessage` prop if no step-level error

### Toast on Completion
When `report_runs.status` changes to `completed` via Realtime, immediately:
- Set `isGenerating = false`
- Refresh reports list
- Show success toast

## Acceptance Criteria
- Progress bar updates instantly as steps complete (no polling delay)
- When a step fails, the UI shows the `error_message` from that specific step
- When the run completes, the UI instantly shows the success state
- Total steps value comes from `report_runs.total_steps`
- Realtime subscriptions are cleaned up on unmount

