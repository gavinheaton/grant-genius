

# Improved Credit-Required Messaging

## Problem Statement

When a paying customer runs out of report credits and tries to generate:
1. The current toast shows "Service unavailable" - confusing and unhelpful
2. No automatic prompt to purchase more credits
3. Users don't know what went wrong or how to fix it

## Solution

Enhance the error handling to detect the 402 "no credits" response specifically and:
1. **Show a clear, friendly toast message** explaining credits are needed
2. **Automatically open the Purchase Modal** so users can buy more instantly
3. **Refresh entitlements data** to ensure the UI is in sync

## User Experience Flow

```text
CURRENT FLOW (Poor UX):
┌──────────────────────────────┐
│  User clicks "Generate"      │
│  (thinks they have credits)  │
└──────────────────┬───────────┘
                   ▼
┌──────────────────────────────┐
│  Edge function returns 402   │
└──────────────────┬───────────┘
                   ▼
┌──────────────────────────────┐
│  Toast: "Service unavailable"│  ← Confusing!
│  Nothing else happens        │
└──────────────────────────────┘

IMPROVED FLOW (Good UX):
┌──────────────────────────────┐
│  User clicks "Generate"      │
└──────────────────┬───────────┘
                   ▼
┌──────────────────────────────┐
│  Edge function returns 402   │
└──────────────────┬───────────┘
                   ▼
┌──────────────────────────────┐
│  Toast: "You're out of       │  ← Clear!
│  credits! Let's get you more"│
└──────────────────┬───────────┘
                   ▼
┌──────────────────────────────┐
│  Purchase Modal opens        │  ← Actionable!
│  automatically               │
└──────────────────────────────┘
```

## Technical Changes

### 1. Update `useReportGeneration.ts` 

Add a callback parameter to notify the workspace component when credits are exhausted:

| Change | Details |
|--------|---------|
| Add `onNoCredits` callback | New optional parameter to hook |
| Parse 402 error specifically | Check for "credits" in error message |
| Call callback on 402 | Triggers purchase flow |
| Improve toast message | Clear, friendly wording |

### 2. Update `ApplicationWorkspace.tsx`

Pass a callback that opens the purchase modal when credits run out:

| Change | Details |
|--------|---------|
| Add `handleNoCredits` callback | Opens purchase modal + refetches entitlements |
| Pass to `useReportGeneration` | Hook calls it on 402 error |

### 3. Toast Message Improvements

**Current toast for 402:**
```
Title: "Service unavailable"
Description: "Please add credits to your workspace and try again."
```

**Improved toast for 402:**
```
Title: "Report credits needed"
Description: "You're out of credits! Purchase more to generate your report."
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useReportGeneration.ts` | Add `onNoCredits` callback, improve 402 handling |
| `src/pages/ApplicationWorkspace.tsx` | Pass callback to open purchase modal on credit error |

## Code Preview

**useReportGeneration.ts** - Updated `startGeneration`:
```typescript
// Add parameter to hook
export function useReportGeneration(
  applicationId: string | undefined,
  options?: { onNoCredits?: () => void }
) {
  // In startGeneration catch block:
  } else if (
    errorMessage.includes("402") || 
    errorMessage.toLowerCase().includes("no report credits")
  ) {
    toast({
      title: "Report credits needed",
      description: "You're out of credits! Purchase more to generate your report.",
      variant: "destructive",
    });
    // Trigger purchase modal
    options?.onNoCredits?.();
  }
}
```

**ApplicationWorkspace.tsx** - Updated hook call:
```typescript
const handleNoCredits = useCallback(() => {
  refetchEntitlements();
  setPurchaseModalOpen(true);
}, [refetchEntitlements]);

const { 
  isGenerating, 
  // ... other values
} = useReportGeneration(id, { onNoCredits: handleNoCredits });
```

## Testing

After implementation:
1. Use all available credits on a test account
2. Try to generate a report
3. Verify:
   - Toast shows "Report credits needed" (not "Service unavailable")
   - Purchase modal opens automatically
   - After purchasing, generation can proceed

