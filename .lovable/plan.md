

# Update Report Generation to Use enqueue-report

## Overview
Modify the report generation flow to use the new `enqueue-report` Edge Function, which triggers an external worker for processing. The UI will show distinct states: "Starting..." during initial setup, then "Processing" while polling real-time progress from the 15-step pipeline.

## Current State
- `useReportGeneration` hook calls `generate-report` edge function
- `generate-report` creates the run record, consumes credit, and processes locally
- UI polls `report_runs` table for progress updates

## New Architecture

```text
+-------------------+     +-------------------+     +------------------+
|  User clicks      | --> | generate-report   | --> | enqueue-report   |
|  "Generate Report"|     | (creates run,     |     | (triggers        |
|                   |     |  consumes credit) |     |  external worker)|
+-------------------+     +-------------------+     +------------------+
                                                           |
                                                           v
                          +-------------------+     +------------------+
                          |  UI polls         | <-- | External Worker  |
                          |  report_run_steps |     | (updates steps)  |
                          +-------------------+     +------------------+
```

## Implementation Plan

### Phase 1: Backend - Update generate-report to call enqueue-report
**File:** `supabase/functions/generate-report/index.ts`

1. After creating the report run record and consuming the credit, call `enqueue-report` instead of processing locally
2. Return immediately with the `report_run_id` and status "enqueued"
3. Remove the async `processStep0Only` call - the external worker handles all processing

Key changes:
- Replace `processStep0Only(...)` call with fetch to `enqueue-report`
- Return `{ success: true, reportRunId, status: "enqueued" }` on success
- Handle errors from `enqueue-report` gracefully

### Phase 2: Frontend - Update useReportGeneration Hook
**File:** `src/hooks/useReportGeneration.ts`

1. Add new state: `isStarting` to show "Starting..." during initial API call
2. Update `startGeneration()` to:
   - Set `isStarting = true` immediately
   - Call `generate-report` (which now enqueues instead of processing)
   - On success, set `isStarting = false` and `isGenerating = true`
   - Begin polling for progress
3. Add polling for `report_run_steps` table to get detailed step-by-step progress

New state flow:
```text
Idle --> Starting --> Processing --> Completed
          |               |
          +----> Failed <-+
```

### Phase 3: Frontend - Update GenerationProgress Component
**File:** `src/components/workspace/GenerationProgress.tsx`

1. Accept new `isStarting` prop to show "Starting..." state
2. Show spinner with "Starting generation..." text during enqueue phase
3. Once processing begins, show the 15-step progress as before
4. Add step-level detail polling from `report_run_steps`

### Phase 4: Frontend - Update ApplicationWorkspace
**File:** `src/pages/ApplicationWorkspace.tsx`

1. Pass `isStarting` state from hook to `GenerationProgress`
2. Update button to show "Starting..." when in starting state

## Technical Details

### New State in useReportGeneration
```typescript
const [isStarting, setIsStarting] = useState(false);

const startGeneration = async () => {
  setIsStarting(true);
  try {
    const { data, error } = await supabase.functions.invoke("generate-report", {
      body: { applicationId },
    });
    if (error || data?.error) throw error || new Error(data.error);
    
    // Success - switch to processing state
    setIsStarting(false);
    setIsGenerating(true);
    toast({ title: "Report generation started" });
    checkActiveRun();
  } catch (error) {
    setIsStarting(false);
    // Handle error...
  }
};
```

### Backend enqueue-report Call
```typescript
// In generate-report, after creating the run:
const enqueueResponse = await fetch(
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/enqueue-report`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ report_run_id: reportRun.id }),
  }
);
```

### Step Progress Polling
```typescript
// Poll report_run_steps for detailed progress
const { data: steps } = await supabase
  .from("report_run_steps")
  .select("step_number, step_name, status, started_at, completed_at")
  .eq("report_run_id", activeRun.id)
  .order("step_number", { ascending: true });
```

## Files to Modify
| File | Changes |
|------|---------|
| `supabase/functions/generate-report/index.ts` | Call `enqueue-report` instead of local processing |
| `src/hooks/useReportGeneration.ts` | Add `isStarting` state, update flow |
| `src/components/workspace/GenerationProgress.tsx` | Add "Starting..." UI state |
| `src/pages/ApplicationWorkspace.tsx` | Pass `isStarting` to progress component |

## Acceptance Criteria
- Clicking "Generate Report" shows "Starting..." spinner
- Once enqueued successfully, UI transitions to "Processing" state
- Progress bar updates as each of the 15 steps completes
- Error handling works for both enqueue failures and processing failures
- Existing retry/cancel functionality continues to work

