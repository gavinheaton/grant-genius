

# Fix Rate Limiting Issues: Multi-Pronged Approach

## Root Cause Analysis

Looking at the data, the latest report run (`fb0c0c23...`) has been stuck at Step 1 "running" status since 11:48 AM - over 2 hours ago. This indicates the AI call is either:
1. Timing out silently
2. Rate limited and the retry logic isn't handling it properly
3. The edge function completed but the status wasn't updated

The current retry logic uses 1s, 2s, 4s delays (7 seconds total) which is too aggressive. If the rate limit window is 60+ seconds, these retries will all fail.

Switching between OpenAI and Gemini won't help because **both providers have rate limits** and the fundamental issue is:
- **Too many requests too quickly** (5 steps back-to-back in Phase 1)
- **Backoff delays too short** to let rate limits reset
- **No delays between successful steps** to spread out the load

---

## Proposed Solution: Four Changes

### 1. Add Delays Between Steps (Throttling)

Add a 3-second pause between each successful step to spread requests over time:

```typescript
async function executeStep(...) {
  // ... existing logic ...
  await updateStep(supabase, reportRunId, stepNumber, "completed", outputs);
  
  // Throttle: wait 3 seconds before next step
  console.log(`Step ${stepNumber} complete, waiting 3s before next step`);
  await new Promise(r => setTimeout(r, 3000));
}
```

**Why this helps**: Instead of 5 AI calls in ~30 seconds, they're spread over ~45-60 seconds, staying under rate limits.

### 2. Increase Backoff Delays

Change from 1s/2s/4s to 5s/15s/30s for rate limit retries:

```typescript
// Current: Math.pow(2, attempt) * 1000 → 1s, 2s, 4s
// New: delays that actually give time for rate limits to reset
const delays = [5000, 15000, 30000]; // 5s, 15s, 30s
const delay = delays[attempt] || 30000;
```

**Why this helps**: Rate limit windows are typically 60 seconds. A 30-second delay on the third retry gives the window time to reset.

### 3. Simplify to Gemini-Only (Remove OpenAI Complexity)

Remove the OpenAI fallback complexity since it's causing issues, and use Lovable AI (Gemini) directly with better error handling:

```typescript
async function callAIWithRetry(prompt: string): Promise<string> {
  const delays = [0, 5000, 15000, 30000]; // Initial, then 5s, 15s, 30s
  
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      console.log(`Retry ${attempt}/3, waiting ${delays[attempt] / 1000}s...`);
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
    
    try {
      return await callLovableAI(prompt);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      
      if (msg.includes("429")) {
        console.log(`Rate limited on attempt ${attempt + 1}`);
        continue; // Will wait via delays array on next iteration
      }
      
      throw error; // Other errors fail immediately
    }
  }
  
  throw new Error("AI service rate limited. Please try again in a few minutes.");
}
```

### 4. Use Lighter Model for Simple Steps

Use `gemini-2.5-flash-lite` (faster, lower cost) for simpler steps, and `gemini-3-flash-preview` for complex analysis:

| Steps | Model | Reason |
|-------|-------|--------|
| 1, 2, 3 | gemini-2.5-flash-lite | Context extraction, basic search |
| 4, 5, 6, 7 | gemini-3-flash-preview | Complex market analysis |
| 8, 9, 10 | gemini-2.5-flash-lite | Impact summary, table formatting |

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-report/index.ts` | Add throttling between steps, increase backoff, switch to Gemini-only, use lighter models for simple steps |
| `supabase/functions/resume-report-run/index.ts` | Same changes for consistency |

---

## Expected Improvement

| Before | After |
|--------|-------|
| 5 calls in ~30s | 5 calls over ~75s (with 3s delays) |
| 1s, 2s, 4s backoff | 5s, 15s, 30s backoff |
| OpenAI → Gemini fallback complexity | Simple Gemini-only with better retries |
| Same model for all steps | Lighter model for simple steps |

---

## Phase Timing Estimate

With 3-second inter-step delays:

- **Phase 1** (Steps 1-5): ~5 AI calls + 12s delays = ~1-2 min
- **Phase 2** (Steps 6-8): ~3 AI calls + 6s delays = ~45s-1 min
- **Phase 3** (Steps 9-10): ~2 AI calls + 3s delays = ~30s-45s

Total: ~3-4 minutes (spread out to avoid rate limits)

