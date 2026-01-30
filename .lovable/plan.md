

# Enhanced Failure Handling with Resume and Clear & Restart Options

## Overview
Add two new action buttons to the report generation failure UI:
1. **Resume Report** - Re-enqueues the existing run to continue from where it stopped
2. **Clear & Restart** (Super Admin only) - Deletes all step data and starts fresh from Step 1

## Current Architecture

```text
+---------------------+     +-----------------------+     +--------------------+
| ApplicationWorkspace| --> | useReportGeneration   | --> | GenerationProgress |
|                     |     | - retryFromFailedStep | --> | - onRestart        |
+---------------------+     | - cancelRun           |     | - onCancel         |
                            +-----------------------+     +--------------------+
                                      |
                                      v
                            +-------------------+
                            | resume-report-run |
                            | edge function     |
                            +-------------------+
```

## Implementation Plan

### Phase 1: Add New Hook Functions

**File:** `src/hooks/useReportGeneration.ts`

Add two new callback functions:

1. **resumeReport** - Directly calls `enqueue-report` edge function:
```typescript
const resumeReport = useCallback(async (runId: string) => {
  try {
    setIsGenerating(true);
    
    // Reset status to pending
    await supabase
      .from("report_runs")
      .update({ status: "pending" })
      .eq("id", runId);

    // Call enqueue-report to re-trigger the worker
    const { error } = await supabase.functions.invoke("enqueue-report", {
      body: { report_run_id: runId },
    });

    if (error) throw error;

    toast({
      title: "Resuming report",
      description: "Re-triggering the report generation worker.",
    });

    checkActiveRun();
  } catch (error) {
    console.error("Error resuming report:", error);
    setIsGenerating(false);
    toast({
      title: "Resume failed",
      description: "Failed to resume report. Please try again.",
      variant: "destructive",
    });
  }
}, [toast, checkActiveRun]);
```

2. **clearAndRestart** - Deletes steps and restarts from Step 1:
```typescript
const clearAndRestart = useCallback(async (runId: string) => {
  try {
    setIsGenerating(true);

    // Delete all steps for this run (requires service role or RLS update)
    // Since RLS prevents user deletion, call an edge function
    const { error } = await supabase.functions.invoke("clear-and-restart-run", {
      body: { reportRunId: runId },
    });

    if (error) throw error;

    setSteps([]);
    toast({
      title: "Run cleared",
      description: "Starting fresh from Step 1.",
    });

    checkActiveRun();
  } catch (error) {
    console.error("Error clearing run:", error);
    setIsGenerating(false);
    toast({
      title: "Clear failed",
      description: "Failed to clear run. Please try again.",
      variant: "destructive",
    });
  }
}, [toast, checkActiveRun]);
```

### Phase 2: Create Edge Function for Clear & Restart

**File:** `supabase/functions/clear-and-restart-run/index.ts`

A new edge function that:
1. Verifies the user is a Super Admin
2. Deletes all `report_run_steps` for the given run
3. Resets `report_runs.current_step` to 0 and `status` to "pending"
4. Clears checkpoint data
5. Calls the worker to start fresh

```typescript
// Verify super admin via user_roles table
const { data: roleData } = await supabaseAdmin
  .from("user_roles")
  .select("role")
  .eq("user_id", user.id)
  .single();

if (roleData?.role !== "super_admin") {
  return new Response(
    JSON.stringify({ error: "Super Admin access required" }),
    { status: 403, headers: corsHeaders }
  );
}

// Delete all steps
await supabaseAdmin
  .from("report_run_steps")
  .delete()
  .eq("report_run_id", reportRunId);

// Reset the run
await supabaseAdmin
  .from("report_runs")
  .update({
    status: "pending",
    current_step: 0,
    checkpoint_data_json: {},
    checkpoint_citations_json: [],
  })
  .eq("id", reportRunId);

// Trigger worker
// Call enqueue-report...
```

### Phase 3: Update GenerationProgress Component

**File:** `src/components/workspace/GenerationProgress.tsx`

1. Add new props for the additional actions and super admin status:
```typescript
interface GenerationProgressProps {
  // ... existing props
  onResume?: () => void;         // NEW
  onClearAndRestart?: () => void; // NEW
  isSuperAdmin?: boolean;         // NEW
}
```

2. Update the failed state UI to show both buttons:
```typescript
{status === "failed" && (
  <div className="space-y-3">
    {/* Error message display (already implemented) */}
    
    {/* Action buttons */}
    <div className="flex flex-wrap gap-2">
      {onResume && (
        <Button variant="default" size="sm" onClick={onResume} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Resume Report
        </Button>
      )}
      {isSuperAdmin && onClearAndRestart && (
        <Button variant="outline" size="sm" onClick={onClearAndRestart} className="gap-2">
          <Trash2 className="h-4 w-4" />
          Clear & Restart
        </Button>
      )}
    </div>
  </div>
)}
```

### Phase 4: Update ApplicationWorkspace

**File:** `src/pages/ApplicationWorkspace.tsx`

1. Import and use `useAuth` to get `isSuperAdmin`:
```typescript
import { useAuth } from "@/hooks/useAuth";

// In component:
const { isSuperAdmin } = useAuth();
```

2. Destructure new functions from hook:
```typescript
const { 
  // ...existing
  resumeReport,
  clearAndRestart,
} = useReportGeneration(id, { onNoCredits: handleNoCredits });
```

3. Pass new props to GenerationProgress:
```typescript
<GenerationProgress
  // ...existing props
  onResume={() => activeRun && resumeReport(activeRun.id)}
  onClearAndRestart={() => activeRun && clearAndRestart(activeRun.id)}
  isSuperAdmin={isSuperAdmin}
/>
```

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `supabase/functions/clear-and-restart-run/index.ts` | Create | New edge function for Super Admin clear and restart |
| `src/hooks/useReportGeneration.ts` | Modify | Add `resumeReport` and `clearAndRestart` functions |
| `src/components/workspace/GenerationProgress.tsx` | Modify | Add new action buttons, `isSuperAdmin` prop |
| `src/pages/ApplicationWorkspace.tsx` | Modify | Import useAuth, pass new props |

## Security Considerations

- The `clear-and-restart-run` edge function must validate Super Admin role server-side
- Uses the `user_roles` table (not client-side checks) for role verification
- Regular users only see the "Resume Report" button
- Service role key used in edge function to delete steps (bypasses RLS)

## Button Behavior Summary

| Button | Visible To | Action |
|--------|-----------|--------|
| Resume Report | All Users | Calls `enqueue-report` with existing `report_run_id` to re-trigger worker |
| Clear & Restart | Super Admin Only | Deletes all steps, resets run to step 0, then triggers fresh generation |

## Acceptance Criteria

- When a step fails, the error message is displayed prominently
- "Resume Report" button appears for all users on failure
- "Clear & Restart" button only appears for Super Admins
- Clicking "Resume Report" re-enqueues the run and shows progress
- Clicking "Clear & Restart" clears step data and starts from Step 1
- Both actions update the UI via Realtime subscriptions

