
# Fix: Report Generation Fails at Step 0 Cannot Restart

## Problem Summary

When report generation fails during the initial Step 1 (before any checkpoint is saved), the database state shows:
- `current_step: 0`
- `status: pending` (or failed/stalled)

Clicking "Try Again" calls `retryFromFailedStep`, which invokes `resume-report-run`. However, the backend validation at line 312 rejects any request where `current_step < 1`:

```javascript
if (resumeFromStep < 1 || resumeFromStep > 10 || reportRun.status !== "pending") {
  return 400 error; // "Report run is not at a valid checkpoint"
}
```

This creates an infinite retry loop because the frontend keeps trying to resume from an invalid checkpoint.

## Solution

The fix requires changes in both the frontend and backend to properly handle the `current_step: 0` case:

### 1. Frontend: Differentiate Between "Restart" and "Resume"

When `current_step === 0`, the system should start a **new** report generation rather than try to resume. The `retryFromFailedStep` function needs to:

- If `current_step > 0`: Call `resume-report-run` (existing behavior)
- If `current_step === 0`: Cancel the stuck run, refund the credit, then call `generate-report` again

**File: `src/hooks/useReportGeneration.ts`**

Modify the `retryFromFailedStep` function to check the current step and either:
1. Cancel the old run and start fresh (for step 0)
2. Resume from checkpoint (for step 1-10)

### 2. Backend: Better Error Messaging

Update `resume-report-run` to return a more specific error message when `current_step === 0`, indicating that a fresh start is required rather than a resume.

**File: `supabase/functions/resume-report-run/index.ts`**

Add a specific check before the general validation:
```typescript
if (resumeFromStep === 0) {
  return new Response(
    JSON.stringify({ 
      error: "No checkpoint available", 
      code: "NO_CHECKPOINT",
      message: "Step 1 did not complete. Please cancel this run and start a new report."
    }),
    { status: 400 }
  );
}
```

### 3. Prevent Auto-Resume Loop

The frontend auto-resume logic in `useReportGeneration.ts` line 239 already handles this correctly (only auto-resumes if `current_step >= 1`), but the user can manually trigger `retryFromFailedStep` which causes the loop.

## Detailed Implementation

### File: `src/hooks/useReportGeneration.ts`

Update the `retryFromFailedStep` function:

```typescript
const retryFromFailedStep = useCallback(async (runId: string) => {
  try {
    console.log("Retrying from failed step...");
    setIsGenerating(true);

    // Fetch the current run to check the step
    const { data: run, error: fetchError } = await supabase
      .from("report_runs")
      .select("current_step")
      .eq("id", runId)
      .single();

    if (fetchError || !run) {
      throw new Error("Could not find report run");
    }

    // If Step 1 never completed, we need to start fresh
    if (run.current_step === 0) {
      console.log("Step 1 never completed, cancelling and restarting...");
      
      // Cancel the stuck run (this refunds the credit)
      await supabase.functions.invoke("cancel-report-run", {
        body: { reportRunId: runId },
      });

      // Start a fresh generation
      await startGeneration();
      return;
    }

    // Otherwise, resume from checkpoint (existing logic)
    const { error: updateError } = await supabase
      .from("report_runs")
      .update({ status: "pending" })
      .eq("id", runId);

    if (updateError) {
      throw updateError;
    }

    const { error } = await supabase.functions.invoke("resume-report-run", {
      body: { reportRunId: runId },
    });

    if (error) {
      throw error;
    }

    toast({
      title: "Resuming generation",
      description: "Continuing from the last successful step.",
    });

    checkActiveRun();
  } catch (error) {
    console.error("Error retrying from failed step:", error);
    setIsGenerating(false);
    toast({
      title: "Retry failed",
      description: "Failed to resume report generation. Please try again.",
      variant: "destructive",
    });
  }
}, [toast, checkActiveRun, startGeneration]);
```

### File: `supabase/functions/resume-report-run/index.ts`

Update the validation section (around line 310-317) for better error messaging:

```typescript
// 11-PHASE ARCHITECTURE: Accept any checkpoint from steps 1-10
const resumeFromStep = reportRun.current_step;

// Specific error for step 0 (Step 1 never completed)
if (resumeFromStep === 0) {
  return new Response(
    JSON.stringify({ 
      error: "No checkpoint available. Step 1 did not complete. Please cancel this run and start a new report.",
      code: "NO_CHECKPOINT"
    }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

if (resumeFromStep < 1 || resumeFromStep > 10 || reportRun.status !== "pending") {
  return new Response(
    JSON.stringify({ error: "Report run is not at a valid checkpoint" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

## Testing Plan

1. **Test Step 0 Failure Recovery**:
   - Create a new report
   - Simulate Step 1 failure (network timeout, etc.)
   - Click "Try Again"
   - Verify: Old run is cancelled, new run starts successfully

2. **Test Normal Resume (Step 1+)**:
   - Create a report that completes Step 1 then fails at Step 3
   - Click "Try Again"
   - Verify: Generation resumes from Step 3 checkpoint

3. **Test No Infinite Loop**:
   - Ensure clicking "Try Again" when at Step 0 does NOT result in repeated 400 errors

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useReportGeneration.ts` | Add logic to detect step 0 and restart fresh instead of resume |
| `supabase/functions/resume-report-run/index.ts` | Add specific error message for step 0 case |

This fix ensures users can always recover from a failed generation, whether it failed at Step 1 or any later step.
