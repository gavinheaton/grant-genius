
# Update "Starting Generation" Message for Accuracy

## Overview

Change the message shown during the `pending` status to accurately reflect whether the system is starting fresh or continuing between steps.

## Current vs. New Behavior

| Scenario | Current Step | Current Message | New Message |
|----------|--------------|-----------------|-------------|
| Initial start | 0 | "Starting generation..." | "Starting generation..." (unchanged) |
| Between steps | 1-9 | "Starting generation..." | "Preparing next step..." |

## What You'll See

- When you first click "Generate Report", you'll see "Starting generation..."
- Between steps (e.g., after step 5 completes, before step 6 starts), you'll see "Preparing next step..."

## File to Modify

| File | Changes |
|------|---------|
| `src/components/workspace/GenerationProgress.tsx` | Update pending status message based on currentStep value |

## Implementation

Update line 53 to show context-aware messaging:

```typescript
{status === "pending" && (currentStep === 0 
  ? "Starting generation..." 
  : `Preparing step ${currentStep + 1}...`)}
```

This will show:
- "Starting generation..." when `currentStep === 0` (fresh start)
- "Preparing step 6..." when `currentStep === 5` (continuing to next step)

## Why This Works

The 10-phase architecture sets `status = "pending"` after each step completes as a checkpoint. The `currentStep` value tells us how far we've progressed:
- `0` = Haven't started any steps yet
- `1-9` = Completed that step, waiting to start the next one

By checking `currentStep`, we can display an accurate message that reflects the actual stage of the process.
