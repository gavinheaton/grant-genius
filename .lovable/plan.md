

# Add Restart Button for Failed Report Generation

## Overview

When a report generation fails, users currently see a red error message but have no way to retry without refreshing the page. This adds a clear "Try Again" button that allows users to restart the generation process immediately.

## What You'll See

When a report fails, users will now see:
- The error message explaining what went wrong
- A prominent "Try Again" button to restart generation
- The button will consume another credit (since credits are refunded on failure, this is fair)

## Technical Changes

### 1. GenerationProgress Component

Add an `onRestart` prop and display a restart button when status is `failed`:

**New prop:**
- `onRestart?: () => void` - callback when user clicks restart

**UI Addition:**
- Show a "Try Again" button with a refresh icon when `status === "failed"`
- Include helpful text explaining that the user can retry

### 2. ApplicationWorkspace Integration

Pass the restart handler to `GenerationProgress`:

- When `status === "failed"`, pass `onRestart` prop that calls `startGeneration()`
- This reuses the existing generation flow, ensuring credits are checked before starting

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/workspace/GenerationProgress.tsx` | Add `onRestart` prop, show "Try Again" button on failure |
| `src/pages/ApplicationWorkspace.tsx` | Pass `onRestart` handler when status is `failed` |

## UI Preview

```text
┌─────────────────────────────────────────────────────┐
│ ⚠️ Generating Report                                │
├─────────────────────────────────────────────────────┤
│ Generation failed                              0%   │
│ ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                     │
│ AI service temporarily unavailable. Please retry.   │
│                                                     │
│ [🔄 Try Again]                                      │
│                                                     │
│ Your credit was refunded. You can try again now.   │
└─────────────────────────────────────────────────────┘
```

## Implementation Details

**GenerationProgress.tsx changes:**

```typescript
interface GenerationProgressProps {
  // ... existing props
  onRestart?: () => void;  // NEW
}

// In the component, add after the failed error message:
{status === "failed" && (
  <div className="space-y-3">
    {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
    {onRestart && (
      <>
        <Button variant="default" size="sm" onClick={onRestart} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
        <p className="text-xs text-muted-foreground">
          Your credit was refunded. You can try again now.
        </p>
      </>
    )}
  </div>
)}
```

**ApplicationWorkspace.tsx changes:**

```typescript
<GenerationProgress
  currentStep={activeRun.current_step}
  totalSteps={activeRun.total_steps}
  status={activeRun.status}
  onCancel={activeRun.status === "stalled" ? () => cancelRun(activeRun.id) : undefined}
  onRestart={activeRun.status === "failed" ? handleGenerateReport : undefined}  // NEW
/>
```

## Additional Consideration

The `GenerationProgress` component should also be shown when `activeRun.status === "failed"`. Currently, the component only renders when `isGenerating` is true, but failed runs set `isGenerating` to false. We need to also check for failed runs in the display condition.

**Fix in ApplicationWorkspace.tsx:**

```typescript
// Show progress for active runs OR recently failed runs
{(isGenerating || activeRun?.status === "failed") && activeRun && (
  <GenerationProgress ... />
)}
```

