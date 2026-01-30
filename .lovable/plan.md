

# Dynamic Report Progress with Realtime Updates

## Overview
Update the report progress tracking to be fully dynamic based on database values instead of hardcoded constants, and implement Supabase Realtime subscriptions for instant progress updates.

## Current State
- Progress uses hardcoded `RESEARCH_STEPS` array (15 items) in GenerationProgress.tsx
- `totalSteps` is passed from `report_runs.total_steps` but step names are hardcoded
- Polling every 3 seconds in `useReportGeneration` hook to check progress
- No Realtime subscriptions currently in use

## New Architecture

```text
+------------------+     +-------------------+     +------------------+
| ApplicationWork  | --> | useReportGeneration| --> | GenerationProgress|
|     space.tsx    |     | (manages state)    |     | (displays UI)    |
+------------------+     +-------------------+     +------------------+
                                  |
                                  v
                    +---------------------------+
                    | Supabase Realtime Channel |
                    | (report_run_steps table)  |
                    +---------------------------+
                                  |
                    +-------------+-------------+
                    |                           |
              INSERT event               UPDATE event
              (new step starts)        (step completes)
                    |                           |
                    v                           v
              +------------------------------------------+
              | Update local state with step_name,      |
              | status, and recalculate progress %      |
              +------------------------------------------+
```

## Implementation Plan

### Phase 1: Database Migration - Enable Realtime
**File:** New migration file

Enable Realtime for the `report_run_steps` table:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_run_steps;
```

### Phase 2: Update useReportGeneration Hook
**File:** `src/hooks/useReportGeneration.ts`

1. Add new state for tracking step-level progress:
   ```typescript
   interface ReportRunStep {
     step_number: number;
     step_name: string;
     status: "pending" | "running" | "completed" | "failed";
     started_at: string | null;
     completed_at: string | null;
   }
   
   const [steps, setSteps] = useState<ReportRunStep[]>([]);
   ```

2. Fetch initial steps when active run is detected:
   ```typescript
   const fetchSteps = useCallback(async () => {
     if (!activeRun?.id) return;
     
     const { data } = await supabase
       .from("report_run_steps")
       .select("step_number, step_name, status, started_at, completed_at")
       .eq("report_run_id", activeRun.id)
       .order("step_number", { ascending: true });
     
     setSteps(data || []);
   }, [activeRun?.id]);
   ```

3. Subscribe to Realtime changes when generating:
   ```typescript
   useEffect(() => {
     if (!isGenerating || !activeRun?.id) return;
     
     const channel = supabase
       .channel(`report-steps-${activeRun.id}`)
       .on(
         'postgres_changes',
         {
           event: '*',
           schema: 'public',
           table: 'report_run_steps',
           filter: `report_run_id=eq.${activeRun.id}`,
         },
         (payload) => {
           if (payload.eventType === 'INSERT') {
             setSteps(prev => [...prev, payload.new as ReportRunStep]);
           } else if (payload.eventType === 'UPDATE') {
             setSteps(prev => prev.map(s => 
               s.step_number === payload.new.step_number 
                 ? payload.new as ReportRunStep 
                 : s
             ));
           }
         }
       )
       .subscribe();
     
     return () => {
       supabase.removeChannel(channel);
     };
   }, [isGenerating, activeRun?.id]);
   ```

4. Calculate completed steps count:
   ```typescript
   const completedSteps = steps.filter(s => s.status === 'completed').length;
   ```

5. Return `steps` and `completedSteps` from the hook

### Phase 3: Update GenerationProgress Component
**File:** `src/components/workspace/GenerationProgress.tsx`

1. Remove hardcoded `RESEARCH_STEPS` array

2. Accept new props:
   ```typescript
   interface GenerationProgressProps {
     currentStep: number;
     totalSteps: number;
     completedSteps: number;  // NEW
     steps: ReportRunStep[];  // NEW
     status: ...
   }
   ```

3. Update progress calculation:
   ```typescript
   // OLD: const progressPercent = ((currentStep + 1) / totalSteps) * 100;
   // NEW: 
   const progressPercent = totalSteps > 0 
     ? (completedSteps / totalSteps) * 100 
     : 0;
   ```

4. Get current step name from steps array:
   ```typescript
   const currentStepData = steps.find(s => s.step_number === currentStep);
   const currentStepName = currentStepData?.step_name || "Initializing...";
   ```

5. Create a helper to format step names nicely:
   ```typescript
   function formatStepName(name: string): string {
     return name
       .split('_')
       .map(word => word.charAt(0).toUpperCase() + word.slice(1))
       .join(' ');
   }
   ```

### Phase 4: Update ApplicationWorkspace
**File:** `src/pages/ApplicationWorkspace.tsx`

1. Destructure new values from hook:
   ```typescript
   const { 
     ...existing,
     steps,
     completedSteps,
   } = useReportGeneration(id, { onNoCredits: handleNoCredits });
   ```

2. Pass new props to GenerationProgress:
   ```typescript
   <GenerationProgress
     currentStep={activeRun.current_step}
     totalSteps={activeRun.total_steps}
     completedSteps={completedSteps}
     steps={steps}
     status={activeRun.status}
     ...
   />
   ```

## Files to Modify
| File | Changes |
|------|---------|
| New migration | Enable Realtime for `report_run_steps` |
| `src/hooks/useReportGeneration.ts` | Add steps state, Realtime subscription, completedSteps calculation |
| `src/components/workspace/GenerationProgress.tsx` | Remove hardcoded steps, use dynamic data, update progress calculation |
| `src/pages/ApplicationWorkspace.tsx` | Pass new props to GenerationProgress |

## Technical Details

### Step Status Flow
Each step in `report_run_steps` follows this lifecycle:
1. **INSERT** with `status: 'pending'` - Step created at run initialization
2. **UPDATE** to `status: 'running'` - Worker picks up step
3. **UPDATE** to `status: 'completed'` - Step finished successfully
   - Or `status: 'failed'` if error occurs

### Realtime Filter
Using `filter: report_run_id=eq.${activeRun.id}` ensures we only receive events for the current run, not all runs in the system.

### Cleanup
The Realtime channel is cleaned up via the effect's return function when:
- Generation completes
- User navigates away
- Active run changes

## Acceptance Criteria
- Progress bar updates in real-time as steps complete (no 3-second polling delay)
- Step names come from database, not hardcoded array
- Total steps value from `report_runs.total_steps` is used
- Progress percentage = (completed_steps / total_steps) * 100
- Realtime subscription is properly cleaned up on unmount

