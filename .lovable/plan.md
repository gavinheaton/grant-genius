

# Ultra-Resilient 10-Phase Architecture: 1 Step Per Edge Function

## Problem

Even with the current Phase 1 running Steps 1-4, timeouts are still occurring. The Firecrawl call alone can take 60 seconds, and each AI call with potential retries can add another 30-60 seconds. Four steps in one invocation is too much.

## Solution: 10 Phases (1 Step Each)

Each edge function invocation runs exactly **1 step**, then checkpoints and exits. The frontend auto-resumes until completion.

```text
┌─────────────────────────────────────────────────────────────────┐
│                    NEW 10-PHASE ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│ Phase 1:  Step 1 (generate-report)     → checkpoint at step 1   │
│ Phase 2:  Step 2 (resume from 1)       → checkpoint at step 2   │
│ Phase 3:  Step 3 (resume from 2)       → checkpoint at step 3   │
│ Phase 4:  Step 4 (resume from 3)       → checkpoint at step 4   │
│ Phase 5:  Step 5 (resume from 4)       → checkpoint at step 5   │
│ Phase 6:  Step 6 (resume from 5)       → checkpoint at step 6   │
│ Phase 7:  Step 7 (resume from 6)       → checkpoint at step 7   │
│ Phase 8:  Step 8 (resume from 7)       → checkpoint at step 8   │
│ Phase 9:  Step 9 (resume from 8)       → checkpoint at step 9   │
│ Phase 10: Step 10 (resume from 9)      → COMPLETE               │
└─────────────────────────────────────────────────────────────────┘
```

Each phase: ~30-60 seconds max (plenty of headroom for retries)

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-report/index.ts` | Run only Step 1, checkpoint immediately after |
| `supabase/functions/resume-report-run/index.ts` | Accept any step 1-9 as checkpoint, run only the next step |
| `src/hooks/useReportGeneration.ts` | Detect checkpoints at any step 1-9, trigger auto-resume |

## Detailed Implementation

### 1. generate-report/index.ts

**Current:** Runs Steps 1-4, checkpoints at step 4
**Change:** Run Step 1 only, checkpoint at step 1

Remove Steps 2-4 from this function. After Step 1 completes:

```typescript
// Step 1: Extract context from article
await executeStep(supabase, reportRunId, 1, async () => {
  // ... existing Firecrawl + context extraction logic ...
});

// CHECKPOINT: Save progress after step 1
await supabase.from("report_runs").update({
  checkpoint_data_json: reportContent,
  checkpoint_citations_json: citations,
  current_step: 1,
  status: "pending",
}).eq("id", reportRunId);

console.log(`Checkpoint saved at step 1`);
return; // resume-report-run will continue from step 2
```

### 2. resume-report-run/index.ts

**Current:** Accepts checkpoints at 4, 5, 8; runs multiple steps per phase
**Change:** Accept any step 1-9 as checkpoint; run exactly 1 step per invocation

Update checkpoint validation:
```typescript
// Accept any step from 1-9 as valid checkpoint
const resumeFromStep = reportRun.current_step;
if (resumeFromStep < 1 || resumeFromStep > 9 || reportRun.status !== "pending") {
  return new Response(
    JSON.stringify({ error: "Report run is not at checkpoint" }),
    ...
  );
}
```

Refactor `processReportPhase` to be step-based:

```typescript
async function processReportPhase(..., resumeFromStep: number) {
  const nextStep = resumeFromStep + 1;
  
  // Execute exactly one step based on nextStep
  switch (nextStep) {
    case 2:
      await executeStep(supabase, reportRunId, 2, async () => {
        // Competitor Research prompt
        const result = await callAIWithRetry(competitorPrompt, 2);
        reportContent.competitorResearch = result;
        return { competitors: result };
      });
      break;
    case 3:
      await executeStep(supabase, reportRunId, 3, async () => {
        // Market Segments prompt
        const result = await callAIWithRetry(marketPrompt, 3);
        reportContent.marketSegments = result;
        return { segments: result };
      });
      break;
    case 4:
      // ... Find Competitors
      break;
    case 5:
      // ... Calculate TAM
      break;
    case 6:
      // ... Calculate SAM
      break;
    case 7:
      // ... Calculate SOM
      break;
    case 8:
      // ... Economic Impact
      break;
    case 9:
      // ... Competitor Table
      break;
    case 10:
      // ... Partner Businesses
      // After step 10: Create final report, mark complete
      await createFinalReport(...);
      return; // No checkpoint needed - we're done
  }
  
  // Checkpoint after each step (except step 10)
  if (nextStep < 10) {
    await supabase.from("report_runs").update({
      checkpoint_data_json: reportContent,
      checkpoint_citations_json: citations,
      current_step: nextStep,
      status: "pending",
    }).eq("id", reportRunId);
    console.log(`Checkpoint saved at step ${nextStep}`);
  }
}
```

### 3. src/hooks/useReportGeneration.ts

**Current (line 182):** Only detects checkpoints at steps 5 and 8
```typescript
if (activeRun.current_step === 5 || activeRun.current_step === 8) {
  resumeFromCheckpoint(activeRun.id);
}
```

**Change:** Detect checkpoints at any step from 1-9
```typescript
// Auto-resume from any checkpoint (steps 1-9)
if (activeRun.current_step >= 1 && activeRun.current_step <= 9) {
  resumeFromCheckpoint(activeRun.id);
}
```

## Step-by-Step Mapping

| Checkpoint | Next Step | Description | Model |
|------------|-----------|-------------|-------|
| 0 → 1 | Step 1 | Extract research context (Firecrawl + AI) | gemini-2.5-flash-lite |
| 1 → 2 | Step 2 | Competitor research | gemini-2.5-flash-lite |
| 2 → 3 | Step 3 | Market segments | gemini-2.5-flash-lite |
| 3 → 4 | Step 4 | Find competitors | gemini-3-flash-preview |
| 4 → 5 | Step 5 | Calculate TAM | gemini-3-flash-preview |
| 5 → 6 | Step 6 | Calculate SAM | gemini-3-flash-preview |
| 6 → 7 | Step 7 | Calculate SOM | gemini-3-flash-preview |
| 7 → 8 | Step 8 | Economic impact | gemini-2.5-flash-lite |
| 8 → 9 | Step 9 | Competitor table | gemini-2.5-flash-lite |
| 9 → 10 | Step 10 | Partner businesses → COMPLETE | gemini-2.5-flash-lite |

## Technical Considerations

1. **All step prompts remain identical** - we're just splitting execution, not changing the AI prompts

2. **Checkpoint data accumulates** - each step adds to `reportContent`, preserved across phases

3. **Citations persist** - the citations array is checkpointed and restored each phase

4. **Frontend polling continues** - the 3-second poll interval detects each checkpoint and triggers resume

5. **Model selection stays the same** - complex steps (4-7) use heavier model, simple steps use lighter model

## Expected Outcome

- Each edge function invocation: 30-60 seconds maximum
- Total generation time: ~5-7 minutes (10 phases with polling gaps)
- Massive reliability improvement - if any phase times out, all previous work is preserved
- Self-healing - frontend automatically resumes from any checkpoint

## Migration Notes

- The stalled report run (ce9118b0) at step 4 will work with the new system once deployed
- No database schema changes required
- Existing checkpoint data format is compatible

