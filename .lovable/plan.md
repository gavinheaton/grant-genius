

# Add Dismiss Button to Completed Report Generation Card

## Overview

After a report finishes generating, the "Generating Report" card remains visible showing the 100% completed state. This change adds a dismiss button so users can hide the card and focus on their completed reports.

---

## Changes Required

### 1. Add `onDismiss` Prop to GenerationProgress Component

**File: `src/components/workspace/GenerationProgress.tsx`**

| Change | Description |
|--------|-------------|
| Add prop | `onDismiss?: () => void` - callback to hide the card |
| Add UI | Show an "X" or "Dismiss" button in the completed state |

The dismiss button will appear in the card header when `status === "completed"`, positioned next to the elapsed time indicator.

### 2. Add State and Handler in ApplicationWorkspace

**File: `src/pages/ApplicationWorkspace.tsx`**

| Change | Description |
|--------|-------------|
| Add state | `const [dismissedRunId, setDismissedRunId] = useState<string \| null>(null)` |
| Add handler | `handleDismissProgress` sets the dismissed run ID |
| Update condition | Hide the progress card when `activeRun.id === dismissedRunId` |
| Reset state | Clear `dismissedRunId` when a new generation starts |

---

## UI Design

When the report is completed, the card header will look like:

```text
┌─────────────────────────────────────────────────────────────┐
│  ✓ Generating Report              ⏱ 12m 34s    [Dismiss ✕] │
├─────────────────────────────────────────────────────────────┤
│  Report generation complete!                          100%  │
│  ████████████████████████████████████████████████████████  │
└─────────────────────────────────────────────────────────────┘
```

The dismiss button uses a ghost variant with an X icon, positioned in the top-right area.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/workspace/GenerationProgress.tsx` | Add `onDismiss` prop and dismiss button UI for completed state |
| `src/pages/ApplicationWorkspace.tsx` | Add dismissed state tracking and pass handler to component |

---

## Summary

A simple, focused change that adds a dismiss button visible only when the report generation is complete, allowing users to clean up the UI after their report is ready.

