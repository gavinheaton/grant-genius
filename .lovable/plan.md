

# Fix Step 6 Timeout: Refactor Edge Function for 60s Platform Limit

## Problem Analysis

Step 6 (`calculate_tam`) is failing silently because:

1. **AI timeout of 45s + processing overhead = >60s total execution time**
2. **Retry mechanism on timeout extends function life past platform limit**
3. Platform kills function at ~60s wall-clock time with no error logged
4. Checkpoint never saves, step appears stuck

### Timeline from Logs
```text
03:56:43 - Function boots
03:56:46 - Step 6 starts with 45s AI timeout
03:57:17 - Shutdown (killed at ~34s of AI wait)
03:57:47 - Shutdown (another attempt killed)
03:58:18 - Shutdown (another attempt killed)
```

The function gets killed before the AI call completes, and the retry logic keeps it alive past the 60s limit.

---

## Solution: Remove Timeout Retries + Reduce AI Timeouts

### Change 1: Remove Timeout Retries from `callAIWithRetry`

**Current behavior**: Retries on timeout (up to 3 attempts)
**New behavior**: Only retry on rate limits (429), fail immediately on timeout

```typescript
// BEFORE - Retries timeouts
if (msg.includes("timed out") && attempt < RETRY_DELAYS.length) {
  console.log(`Request timed out on attempt ${attempt + 1}, will retry`);
  continue;
}

// AFTER - Fail immediately on timeout
if (msg.includes("timed out")) {
  throw new Error(`AI request timed out for step ${stepNumber}`);
}
```

**Rationale**: Retrying a timeout within an edge function doesn't help because the platform limit is per-invocation. The frontend auto-resume mechanism will trigger a new edge function call anyway.

### Change 2: Reduce Default AI Timeouts to 35-40 seconds

Current timeouts don't leave enough headroom for:
- Function boot time (~100-200ms)
- Database queries (fetch prompt bundle, grant context)
- Response parsing
- Checkpoint save

**New timeout structure:**

| Step | Current Timeout | New Timeout | Rationale |
|------|-----------------|-------------|-----------|
| 0 | 55s | 40s | Source pack, heavy but one attempt |
| 1-4 | 45s | 35s | Context extraction, lighter tasks |
| 5 | 45s | 35s | Market sizing pack |
| 6-8 | 45s | 38s | TAM/SAM/SOM calculations |
| 9-11 | 45s | 35s | Impact, tables, partners |
| 12-13 | 55s | 42s | Assembly steps |
| 14 | 45s | 35s | Final merge (simple) |

### Change 3: Update `getTimeoutForStep` Function

```typescript
function getTimeoutForStep(stepNumber: number, overrideSeconds: number | null = null): number {
  if (overrideSeconds !== null) {
    return overrideSeconds * 1000;
  }
  
  // Reduced timeouts to leave headroom within 60s platform limit
  // Steps 0, 12, 13 are complex - 42s max
  if (stepNumber === 0 || stepNumber === 12 || stepNumber === 13) return 42000;
  
  // TAM/SAM/SOM calculations - 38s
  if (stepNumber >= 6 && stepNumber <= 8) return 38000;
  
  // All other steps - 35s
  return 35000;
}
```

---

## Files to Modify

### 1. `supabase/functions/resume-report-run/index.ts`

- Update `getTimeoutForStep()` function with reduced default timeouts
- Modify `callAIWithRetry()` to NOT retry on timeouts (only rate limits)
- Add more aggressive fail-fast behavior

### 2. `supabase/functions/generate-report/index.ts`

- Apply same changes for Step 0 consistency

---

## Expected Outcome

| Before | After |
|--------|-------|
| 45s AI timeout + retry = 50-90s execution | 35-42s AI timeout, no retry = ~50s max |
| Platform kills function mid-request | Function completes within 60s limit |
| Silent death, no checkpoint | Clean timeout error, checkpoint on failure |
| Stuck at step indefinitely | Fails fast, frontend retries cleanly |

---

## Alternative Consideration: Use Lighter Models

If timeouts persist after this fix, consider switching Steps 6-8 (TAM/SAM/SOM) to `gemini-2.5-flash-lite` instead of `gemini-3-flash-preview`. The lighter model responds faster, trading some quality for reliability.

This can be done via database update:
```sql
UPDATE prompt_bundle_steps 
SET model_override = 'google/gemini-2.5-flash-lite'
WHERE bundle_id = '90e0e5bd-f625-47c9-83a0-08821153c895'
  AND step_number IN (6, 7, 8);
```

---

## Post-Fix Testing

1. Mark the current stuck run as failed
2. Generate a new report
3. Monitor logs for Step 6 completing within 40-50 seconds
4. Verify all 15 steps complete successfully

