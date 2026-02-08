
# Fix: Cancel Button Reliability

## Problem Summary

The Cancel button doesn't work reliably because:

1. **No loading state** - Users can click multiple times while the request is pending
2. **Silent failures** - If the cancel request fails, users see a vague "Failed to cancel" toast
3. **Race condition with Realtime** - The UI updates before the cancel completes, making the button disappear
4. **Status check fails on retry** - After the first cancel attempt changes status to "failed", subsequent clicks get rejected with a 400 error

## Root Cause Analysis

```text
User clicks Cancel
        │
        ├─── Request sent to cancel-report-run
        │              │
        │              ├─── SUCCESS: Status → "failed", activeRun → null
        │              │
        │              └─── SLOW/FAIL: Button still visible, user clicks again
        │                              │
        │                              └─── 400 error: "already completed or failed"
        │                                              (because first click worked)
        │
        └─── Realtime picks up "failed" status
                       │
                       └─── isInProgress becomes false
                                      │
                                      └─── Cancel button section doesn't render
                                           (user thinks nothing happened)
```

## Solution

### 1. Add Loading State to Cancel Operation

**File: `src/hooks/useReportGeneration.ts`**

Add a new `isCancelling` state and expose it, then use it to disable the button during the operation:

```typescript
const [isCancelling, setIsCancelling] = useState(false);

const cancelRun = useCallback(async (runId: string) => {
  if (isCancelling) return; // Prevent double-clicks
  
  setIsCancelling(true);
  try {
    const { error } = await supabase.functions.invoke("cancel-report-run", {
      body: { reportRunId: runId },
    });

    if (error) {
      throw error;
    }

    setActiveRun(null);
    setIsGenerating(false);
    setSteps([]);
    toast({
      title: "Generation cancelled",
      description: "Your credit has been refunded. You can try again when ready.",
    });
  } catch (error) {
    console.error("Error cancelling run:", error);
    
    // Check if error is "already completed or failed" - this means cancel worked
    const errorMessage = error instanceof Error ? error.message : "";
    if (errorMessage.includes("already completed") || errorMessage.includes("already failed")) {
      // This is actually success - the run was cancelled
      setActiveRun(null);
      setIsGenerating(false);
      setSteps([]);
      toast({
        title: "Generation cancelled",
        description: "You can try again when ready.",
      });
    } else {
      toast({
        title: "Failed to cancel",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    }
  } finally {
    setIsCancelling(false);
  }
}, [toast, isCancelling]);

// Return isCancelling in the hook's return object
return {
  // ... existing returns
  isCancelling,
  cancelRun,
};
```

### 2. Update GenerationProgress to Accept Loading State

**File: `src/components/workspace/GenerationProgress.tsx`**

Add `isCancelling` prop and disable the button when cancelling:

```typescript
interface GenerationProgressProps {
  // ... existing props
  isCancelling?: boolean;
}

// In the component body, update both cancel buttons:

{/* Cancel button for in-progress runs */}
{onCancel && (
  <Button 
    variant="ghost" 
    size="sm" 
    onClick={onCancel}
    disabled={isCancelling}
    className="gap-2 text-muted-foreground hover:text-destructive"
  >
    {isCancelling ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <XCircle className="h-4 w-4" />
    )}
    {isCancelling ? "Cancelling..." : "Cancel Generation"}
  </Button>
)}

// Also update the "Cancel & Start Over" button in the stalled section:
{onCancel && (
  <Button 
    variant="outline" 
    size="sm" 
    onClick={onCancel}
    disabled={isCancelling}
    className="gap-2"
  >
    {isCancelling ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <XCircle className="h-4 w-4" />
    )}
    {isCancelling ? "Cancelling..." : "Cancel & Start Over"}
  </Button>
)}
```

### 3. Pass isCancelling to GenerationProgress

**File: `src/pages/ApplicationWorkspace.tsx`**

Update the destructuring and prop passing:

```typescript
const { 
  // ... existing destructuring
  isCancelling,
  cancelRun,
} = useReportGeneration(id, { onNoCredits: handleNoCredits });

// In the GenerationProgress component:
<GenerationProgress
  // ... existing props
  isCancelling={isCancelling}
  onCancel={() => cancelRun(activeRun.id)}
/>
```

### 4. Fix Edge Function Status Check

**File: `supabase/functions/cancel-report-run/index.ts`**

Make the status check more lenient - if already failed, return success instead of error:

```typescript
// Only allow cancelling pending or running reports
// If already failed/completed, treat as success (idempotent)
if (reportRun.status !== "pending" && reportRun.status !== "running") {
  console.log(`Report run ${reportRunId} already in status ${reportRun.status}, treating as cancelled`);
  return new Response(
    JSON.stringify({ 
      success: true, 
      message: "Report generation already stopped",
      alreadyStopped: true
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useReportGeneration.ts` | Add `isCancelling` state, improve error handling |
| `src/components/workspace/GenerationProgress.tsx` | Add `isCancelling` prop, disable button + show spinner |
| `src/pages/ApplicationWorkspace.tsx` | Pass `isCancelling` prop |
| `supabase/functions/cancel-report-run/index.ts` | Make idempotent (return success if already stopped) |

## Expected Behavior After Fix

1. User clicks "Cancel Generation"
2. Button shows spinner and "Cancelling..." text
3. Button is disabled - no double-clicks possible
4. Request completes (or fails with "already stopped")
5. Toast confirms cancellation
6. UI resets to allow new generation

## Testing Checklist

1. [ ] Click Cancel once - verify spinner appears immediately
2. [ ] Click Cancel rapidly - verify only one request sent
3. [ ] Cancel a running report - verify credit refunded
4. [ ] Cancel a stalled report - verify UI resets
5. [ ] Verify toast message appears after successful cancel
