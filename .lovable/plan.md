

# Fix: Credit Consumption Timing and Failed Step Resume Logic

## Problems Identified

### Problem 1: 400 Error on Resume
When a step fails, the system sets `status: "failed"` but keeps `current_step` at an intermediate value (e.g., step 2). The frontend sees `current_step` in range 1-9 and tries to auto-resume, but `resume-report-run` rejects it with a 400 error because `status !== "pending"`.

The issue: The auto-resume detection in the frontend only checks `current_step`, not `status`. It should NOT auto-resume failed runs.

### Problem 2: Credits Consumed on Failure
Credits are consumed at the START of generation (in `generate-report`), not at successful completion. When generation fails, the credit is NOT refunded automatically - refund logic only exists in the `cancel-report-run` function.

## Solution

### 1. Fix Frontend Auto-Resume Logic

The frontend should NOT attempt to auto-resume failed runs. Currently it only checks `current_step`:

```typescript
// CURRENT (broken)
if (activeRun && activeRun.status === "pending") {
  if (activeRun.current_step >= 1 && activeRun.current_step <= 9) {
    resumeFromCheckpoint(activeRun.id);
  }
}
```

This is actually already correct - it checks `status === "pending"`. But there's a race condition: the polling might see `pending` status briefly before the failure is detected.

### 2. Add Credit Refund on Failure

When a step fails in `resume-report-run`, refund the credit automatically (same logic as `cancel-report-run`).

### 3. Remove Auto-Resume Loops

Add tracking to prevent infinite resume attempts when errors occur.

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/resume-report-run/index.ts` | Add credit refund logic when step fails |
| `src/hooks/useReportGeneration.ts` | Add resume attempt tracking to prevent loops, exclude failed status from auto-resume |

## Implementation Details

### 1. resume-report-run/index.ts - Add Credit Refund on Failure

In the `processSingleStep` catch block (around line 450), add refund logic:

```typescript
catch (error) {
  console.error(`10-PHASE: Step ${nextStep} failed:`, error);
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  
  // Mark as failed
  await updateRunStatus(supabase, reportRunId, "failed", errorMessage);
  
  // Refund credit on failure
  await refundCredit(supabase, reportRunId);
}
```

Add a helper function:

```typescript
async function refundCredit(supabase: any, reportRunId: string) {
  try {
    const { data: consumption } = await supabase
      .from("entitlement_consumptions")
      .select("id, entitlement_id")
      .eq("report_run_id", reportRunId)
      .maybeSingle();

    if (consumption) {
      // Decrement used_quantity
      await supabase.rpc("decrement_entitlement", { 
        ent_id: consumption.entitlement_id 
      });
      
      // Delete the consumption record
      await supabase
        .from("entitlement_consumptions")
        .delete()
        .eq("id", consumption.id);
        
      console.log(`Credit refunded for failed run ${reportRunId}`);
    }
  } catch (e) {
    console.error("Failed to refund credit:", e);
  }
}
```

### 2. useReportGeneration.ts - Prevent Infinite Resume Loops

Add a ref to track which runs we've already attempted to resume, preventing rapid-fire retries:

```typescript
const resumeAttemptedRef = useRef<Set<string>>(new Set());

// In the auto-resume effect:
useEffect(() => {
  if (activeRun && activeRun.status === "pending") {
    const attemptKey = `${activeRun.id}-${activeRun.current_step}`;
    
    // Only resume if we haven't already attempted this specific checkpoint
    if (!resumeAttemptedRef.current.has(attemptKey)) {
      if (activeRun.current_step >= 1 && activeRun.current_step <= 9) {
        resumeAttemptedRef.current.add(attemptKey);
        resumeFromCheckpoint(activeRun.id);
      }
    }
  }
  
  // Clear tracking when run completes or fails
  if (activeRun && (activeRun.status === "completed" || activeRun.status === "failed")) {
    resumeAttemptedRef.current.clear();
  }
}, [activeRun, resumeFromCheckpoint]);
```

### 3. Also Add Refund Logic to generate-report Failure Path

In `generate-report/index.ts`, the `processStep1Only` function should also refund credits when Step 1 fails.

## Expected Outcome

After these changes:
- Failed runs will NOT trigger infinite resume attempts (400 errors eliminated)
- Credits are automatically refunded when ANY step fails
- The "Try Again" button will work correctly because it explicitly resets status to "pending"
- Users see accurate credit balance after failures

## Flow Diagram

```text
Report Generation Start
        │
        ▼
  Credit Consumed
        │
        ▼
  Step 1 runs ───────► Failure? ──Yes──► Credit Refunded
        │                                      │
        ▼                                      ▼
  Step 2-9 runs ─────► Failure? ──Yes──► Credit Refunded
        │                                      │
        ▼                                      ▼
  Step 10 completes                    Status: "failed"
        │                              User clicks "Try Again"
        ▼                                      │
  Report Created                               ▼
  Credit stays consumed              Reset to "pending"
                                     New credit consumed
                                     Resume from checkpoint
```

