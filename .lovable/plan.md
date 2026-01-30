
# Add Cancel Button During Report Generation

## Problem
Currently, the cancel button only appears when a report run is "stalled" (no progress for 5+ minutes). During normal "pending" or "running" status, users have no way to cancel and must wait for a timeout.

## Solution
Add a cancel button to the progress card that's visible during active generation, allowing users to immediately stop the process and get their credit refunded.

## Changes Required

### 1. ApplicationWorkspace.tsx
Pass `onCancel` for all in-progress states, not just "stalled":

**Before:**
```tsx
onCancel={activeRun.status === "stalled" ? () => cancelRun(activeRun.id) : undefined}
```

**After:**
```tsx
onCancel={() => cancelRun(activeRun.id)}
```

### 2. GenerationProgress.tsx
Add a cancel button to the in-progress section (where the email checkbox is shown):

**Add to the `isInProgress` block (after the email checkbox section):**
```tsx
{/* Cancel button for in-progress runs */}
{onCancel && (
  <Button 
    variant="ghost" 
    size="sm" 
    onClick={onCancel} 
    className="gap-2 text-muted-foreground hover:text-destructive"
  >
    <XCircle className="h-4 w-4" />
    Cancel Generation
  </Button>
)}
```

## UI Design
- **Location**: Below the email notification checkbox in the progress card
- **Style**: Ghost button with muted text, turns red on hover to indicate destructive action
- **Behavior**: Calls `cancel-report-run` edge function which:
  - Marks the run as "failed"
  - Marks all pending/running steps as failed
  - Refunds the consumed credit

## Technical Details
- The `cancel-report-run` edge function already handles credit refunds by calling `decrement_entitlement` and deleting the consumption record
- The hook's `cancelRun` function clears `activeRun` and `isGenerating` state after successful cancellation
- Toast notification confirms cancellation to the user
