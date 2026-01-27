

# Multi-Phase Checkpoint and Circuit-Break Implementation

## Overview

Two improvements to further reduce rate limits and timeouts:
1. Add a second checkpoint after Step 8, splitting the current Phase 2 into two smaller phases
2. Implement a circuit-breaker that switches to Gemini for the remainder of a run after OpenAI returns a 429

---

## Current Flow

```text
Phase 1 (generate-report)     →  Checkpoint at Step 5
     Steps 1-5
         ↓
Phase 2 (resume-report-run)   →  Steps 6-10 (currently all in one call)
```

## New Flow

```text
Phase 1 (generate-report)         →  Checkpoint at Step 5
     Steps 1-5
         ↓
Phase 2 (resume-report-run)       →  Checkpoint at Step 8
     Steps 6-8
         ↓
Phase 3 (resume-report-run)       →  Completion
     Steps 9-10
```

---

## Implementation Details

### 1. Checkpoint After Step 8

**What changes:**
- After completing Step 8 (Economic Impact), save checkpoint data and set status to `pending` with `current_step: 8`
- Frontend detects Step 8 checkpoint and calls `resume-report-run` again
- `resume-report-run` will detect Step 8 and execute only Steps 9–10

**File: `supabase/functions/resume-report-run/index.ts`**

Update the checkpoint logic:
- After Step 8 completes, save checkpoint data and return early
- Add conditional logic to detect whether resuming from Step 5 or Step 8:
  - If `current_step === 5`: Execute Steps 6–8, then save checkpoint at Step 8
  - If `current_step === 8`: Execute Steps 9–10, then complete the report

```typescript
// After Step 8 completes:
if (resumeFromStep === 5) {
  // Save checkpoint at step 8
  await supabase.from("report_runs").update({
    checkpoint_data_json: reportContent,
    checkpoint_citations_json: citations,
    current_step: 8,
    status: "pending",
  }).eq("id", reportRunId);
  
  console.log(`Checkpoint saved at step 8 for run ${reportRunId}`);
  return; // Frontend will detect and resume
}
```

**File: `src/hooks/useReportGeneration.ts`**

Update the checkpoint detection:

```typescript
// Detect checkpoint status and auto-resume
useEffect(() => {
  if (activeRun && activeRun.status === "pending") {
    // Checkpoint at step 5 OR step 8 - trigger resume
    if (activeRun.current_step === 5 || activeRun.current_step === 8) {
      resumeFromCheckpoint(activeRun.id);
    }
  }
}, [activeRun, resumeFromCheckpoint]);
```

### 2. Circuit-Breaker for OpenAI 429

**Problem:** The current retry logic retries OpenAI 3 times per step, but if OpenAI is rate-limited, every subsequent step will also fail/retry, wasting time.

**Solution:** Track a "circuit-breaker" flag that, once OpenAI returns a 429, switches to Gemini for all remaining AI calls in that run.

**Implementation approach:**

Create a closure or module-level flag within each edge function execution:

```typescript
// At the start of processing:
let useGeminiFallback = false;

async function callAIWithRetry(prompt: string): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  // If circuit-breaker tripped OR no OpenAI key, use Gemini directly
  if (useGeminiFallback || !OPENAI_API_KEY) {
    return await callLovableAI(prompt);
  }

  // Try OpenAI with retries
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callOpenAI(OPENAI_API_KEY, prompt);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("429") || errorMessage.includes("timed out")) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`OpenAI error (${errorMessage}), waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  
  // All retries exhausted - trip the circuit breaker
  console.log("OpenAI rate limited - circuit breaker tripped, using Gemini for remaining calls");
  useGeminiFallback = true;
  return await callLovableAI(prompt);
}
```

This flag persists for the duration of that function execution, so all subsequent steps in that phase will use Gemini without attempting OpenAI.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/resume-report-run/index.ts` | Add checkpoint after Step 8, detect resume point (5 vs 8), add circuit-breaker flag |
| `supabase/functions/generate-report/index.ts` | Add circuit-breaker flag for Phase 1 consistency |
| `src/hooks/useReportGeneration.ts` | Update checkpoint detection to include Step 8 |
| `src/components/workspace/GenerationProgress.tsx` | Optional: show phase labels in progress UI |

---

## Flow Diagram

```text
User clicks "Generate Report"
         ↓
┌─────────────────────────┐
│  generate-report        │
│  Steps 1-5              │
│  Save checkpoint (5)    │
└─────────────────────────┘
         ↓
Frontend detects step=5, status=pending
         ↓
┌─────────────────────────┐
│  resume-report-run      │
│  Steps 6-8              │
│  Save checkpoint (8)    │
└─────────────────────────┘
         ↓
Frontend detects step=8, status=pending
         ↓
┌─────────────────────────┐
│  resume-report-run      │
│  Steps 9-10             │
│  Complete report        │
└─────────────────────────┘
         ↓
Report ready!
```

---

## Circuit-Breaker Behavior

```text
Step 6: Try OpenAI → 429 → Retry 1 → 429 → Retry 2 → 429
        → Trip circuit breaker → Use Gemini
Step 7: Circuit breaker tripped → Use Gemini directly (no OpenAI attempts)
Step 8: Circuit breaker tripped → Use Gemini directly
...and so on
```

---

## Benefits

| Before | After |
|--------|-------|
| Phase 2 runs 5 steps in one call | Phase 2a (3 steps) + Phase 3 (2 steps) |
| ~5+ min risk per phase | ~2-3 min per phase |
| OpenAI retries every step even if rate limited | One rate limit trips circuit breaker for entire run |
| Wasted time on repeated 429 retries | Immediate fallback to Gemini after first failure |

---

## Technical Notes

- The circuit-breaker flag is scoped to each function execution (not persistent across runs)
- Each edge function call gets a fresh circuit-breaker state
- The flag is set when retries are exhausted, not on the first 429 (to allow transient recovery)
- Frontend polling interval (3s) will detect checkpoint changes quickly

