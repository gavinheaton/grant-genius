

# Timeout and Error Handling Implementation

## Overview

Add comprehensive timeout detection and error handling to prevent report generation from getting stuck in a "running" state indefinitely.

---

## Current Gaps

| Gap | Impact |
|-----|--------|
| No fetch timeouts | AI/Firecrawl calls can hang forever |
| No step-level error recording | No visibility into which step failed |
| No stale detection on frontend | User stuck with spinning indicator |
| Silent failures in async processing | Run stays "running" even when backend crashed |

---

## Implementation Plan

### 1. Backend: Add Request Timeouts

Add a timeout wrapper for all fetch calls to prevent indefinite hangs:

```typescript
async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Apply to:
- OpenAI API calls (30s timeout)
- Lovable AI calls (30s timeout)  
- Firecrawl scrape calls (60s timeout)

### 2. Backend: Step-Level Error Handling

Wrap each step in its own try-catch and record errors:

```typescript
// For each step:
try {
  await updateStep(supabase, reportRunId, stepNumber, "running");
  const result = await callAIWithRetry(prompt);
  await updateStep(supabase, reportRunId, stepNumber, "completed", { result });
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : "Unknown error";
  await updateStep(supabase, reportRunId, stepNumber, "failed", null, errorMsg);
  throw error; // Re-throw to trigger overall failure
}
```

Update `updateStep` function to accept error message:
```typescript
async function updateStep(
  supabase: any,
  reportRunId: string,
  stepNumber: number,
  status: string,
  outputs?: Record<string, unknown>,
  errorMessage?: string  // NEW parameter
)
```

### 3. Frontend: Stale Run Detection

Add timeout detection to `useReportGeneration.ts`:

```typescript
interface ReportRun {
  // ... existing fields
  started_at: string;  // Add this field
}

// In checkActiveRun:
if (data) {
  const startedAt = new Date(data.started_at || data.created_at);
  const now = new Date();
  const staleThresholdMs = 5 * 60 * 1000; // 5 minutes
  
  if (now.getTime() - startedAt.getTime() > staleThresholdMs) {
    // Mark as stale - show different UI state
    setActiveRun({ ...data, status: "stalled" as any });
  } else {
    setActiveRun(data);
  }
  setIsGenerating(true);
}
```

### 4. Frontend: Add Cancel/Retry Button for Stalled Runs

Add a function to cancel stalled runs and update the UI:

```typescript
const cancelRun = useCallback(async (runId: string) => {
  const { error } = await supabase.functions.invoke("cancel-report-run", {
    body: { reportRunId: runId },
  });
  
  if (!error) {
    setActiveRun(null);
    setIsGenerating(false);
    toast({ title: "Generation cancelled", description: "You can try again." });
  }
}, [toast]);
```

### 5. New Edge Function: Cancel Report Run

Create `supabase/functions/cancel-report-run/index.ts`:

```typescript
// Marks a stuck report run as failed
// Allows user to retry generation
```

### 6. Update GenerationProgress Component

Show stalled state and retry button:

```tsx
{status === "stalled" && (
  <>
    <p className="text-sm text-warning">
      Generation appears to have stalled. This can happen due to high demand.
    </p>
    <Button variant="outline" onClick={onCancel}>
      Cancel & Retry
    </Button>
  </>
)}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-report/index.ts` | Add `fetchWithTimeout`, wrap steps in try-catch, update `updateStep` signature |
| `src/hooks/useReportGeneration.ts` | Add stale detection, add `started_at` field, add `cancelRun` function |
| `src/components/workspace/GenerationProgress.tsx` | Add stalled state UI with cancel/retry button |
| `supabase/functions/cancel-report-run/index.ts` | **NEW** - endpoint to mark runs as failed |

---

## Benefits

| Before | After |
|--------|-------|
| Runs can hang forever | 30-60s timeout on all external calls |
| User stuck in loading state | Stalled detection after 5 min with retry option |
| No visibility into failures | Step-level error messages recorded |
| Manual database fix required | Self-service cancel/retry |

