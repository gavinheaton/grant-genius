
# Fix Auto-Retry Timer for Report Generation Failures

## Summary

The "Retrying in 30 seconds" countdown timer has stopped working on report generation failures. The issue is a timing/state synchronization problem between the parent component (`ApplicationWorkspace`) and the child component (`GenerationProgress`).

## Root Cause Analysis

The countdown timer displays when `shouldShowAutoRetry` is `true`:

```typescript
const shouldShowAutoRetry = (status === "failed" || status === "stalled") && onRestart && !hasAutoRetried;
```

The problem is that `onRestart` is conditionally passed from `ApplicationWorkspace`:

```typescript
onRestart={
  (activeRun.status === "failed" || activeRun.status === "stalled") 
    ? () => retryFromFailedStep(activeRun.id) 
    : undefined
}
```

This creates a race condition where:
1. Realtime subscription updates `activeRun.status` to `"failed"` 
2. React schedules a re-render
3. During the next render, `onRestart` becomes defined
4. However, if any intermediate render has `onRestart = undefined`, the countdown effect exits early

Additionally, the current logic has a component mount/unmount issue - when the component re-mounts after a run cycle, `hasAutoRetried` resets to `false` but the countdown may not properly restart.

## Solution

### Option A: Decouple `onRestart` from the visibility condition (Recommended)

Make `onRestart` always passed as a function, and only use `status` to determine visibility:

**ApplicationWorkspace.tsx** - Always pass `onRestart`:
```typescript
onRestart={() => retryFromFailedStep(activeRun.id)}
```

**GenerationProgress.tsx** - Use status alone for visibility:
```typescript
const shouldShowAutoRetry = (status === "failed" || status === "stalled") && !hasAutoRetried;
```

### Option B: Add a stable run ID dependency for countdown reset

Track when a **new** failure occurs using the `activeRunId` prop to reset the countdown state more reliably.

**GenerationProgress.tsx** - Update the reset effect:
```typescript
// Reset countdown when a new failure occurs (tracked by run ID + status)
useEffect(() => {
  if (status === "failed" || status === "stalled") {
    setCountdown(AUTO_RETRY_SECONDS);
    setIsPaused(false);
    setHasAutoRetried(false);
  }
}, [status, activeRunId]); // Add activeRunId to dependencies
```

## Implementation Details

### File: `src/pages/ApplicationWorkspace.tsx`

**Line 370-373** - Change conditional `onRestart` to always pass the function:

Before:
```typescript
onRestart={
  (activeRun.status === "failed" || activeRun.status === "stalled") 
    ? () => retryFromFailedStep(activeRun.id) 
    : undefined
}
```

After:
```typescript
onRestart={() => retryFromFailedStep(activeRun.id)}
```

### File: `src/components/workspace/GenerationProgress.tsx`

**Line 83** - Remove `onRestart` from the visibility condition:

Before:
```typescript
const shouldShowAutoRetry = (status === "failed" || status === "stalled") && onRestart && !hasAutoRetried;
```

After:
```typescript
const shouldShowAutoRetry = (status === "failed" || status === "stalled") && !hasAutoRetried;
```

**Line 86-93** - Add `activeRunId` to dependencies for more reliable reset:

Before:
```typescript
useEffect(() => {
  if (status === "failed" || status === "stalled") {
    setCountdown(AUTO_RETRY_SECONDS);
    setIsPaused(false);
    setHasAutoRetried(false);
  }
}, [status]);
```

After:
```typescript
useEffect(() => {
  if (status === "failed" || status === "stalled") {
    setCountdown(AUTO_RETRY_SECONDS);
    setIsPaused(false);
    setHasAutoRetried(false);
  }
}, [status, activeRunId]);
```

**Lines 222-223** - Remove redundant `onRestart` check (already guaranteed by props):

Before:
```typescript
{onRestart && shouldShowAutoRetry && (
```

After:
```typescript
{shouldShowAutoRetry && (
```

## Why This Fixes the Issue

1. **Always passing `onRestart`** eliminates the race condition where the prop could be undefined for a render cycle
2. **Adding `activeRunId` to the reset effect** ensures that when the same run fails multiple times (after retries), the countdown properly resets
3. **Removing redundant checks** simplifies the logic and prevents potential mismatches

## Testing

After implementation, verify:
1. When a report fails, the "Retrying in 30 seconds" countdown appears
2. The countdown decrements every second
3. At 0, the retry is triggered automatically
4. Pause/Resume buttons work correctly
5. If the retry fails again, the countdown resets and shows again
