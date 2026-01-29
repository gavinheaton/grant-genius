
# Fix Step 12 Timeout Issue

## Problem Summary

Step 12 (final report assembly) consistently stalls because:
1. It uses the most complex AI model (gemini-3-pro-preview) with ~50KB of context
2. The AI response takes 60-90 seconds - exceeding the 45s timeout in `callAIWithRetry`
3. When timeout occurs, the step is left in "running" state with no output
4. Recovery logic resets and retries, but hits the same timeout

## Root Cause

The `fetchWithTimeout` for AI calls in `resume-report-run` is set to **45 seconds**:

```typescript
const response = await fetchWithTimeout(
  "https://ai.gateway.lovable.dev/v1/chat/completions",
  { ... },
  45000 // 45s timeout for AI calls
);
```

Step 12 with gemini-3-pro-preview typically needs **60-90 seconds** to process all 11 prior step outputs and generate the structured JSON report.

## Solution

### 1. Increase AI timeout for Step 12

Update `callAIWithRetry` to accept a custom timeout parameter, and increase it for Step 12:

```typescript
// In callAIWithRetry function signature
async function callAIWithRetry(
  prompt: string, 
  stepNumber: number,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  modelOverride?: string | null,
  timeoutMs: number = 45000  // NEW: configurable timeout
): Promise<string>

// In Step 12 execution
const assemblyResult = await callAIWithRetry(
  assemblyPrompt, 
  12, 
  systemPrompt, 
  getStepModel(12),
  120000  // 2 minute timeout for final assembly
);
```

### 2. Add explicit timeout logging

Log when Step 12 is starting so we can track duration:

```typescript
console.log(`Step 12: Final assembly starting, timeout set to 120s`);
```

### 3. Consider chunking the Step 12 prompt

If timeouts persist, the Step 12 prompt could be optimized:
- Reduce the amount of raw JSON passed (summarize prior steps first)
- Use a smaller model that responds faster

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/resume-report-run/index.ts` | Increase Step 12 timeout to 120s, add timeout parameter to `callAIWithRetry` |

## Implementation Details

### Update callAIWithRetry signature

```typescript
async function callAIWithRetry(
  prompt: string, 
  stepNumber: number,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  modelOverride?: string | null,
  customTimeoutMs?: number  // Optional custom timeout
): Promise<string> {
  // ...
  
  // Use custom timeout for specific steps, default 45s
  const timeoutMs = customTimeoutMs || 45000;
  
  // Log the timeout being used
  console.log(`Step ${stepNumber}: Using model ${model}, timeout ${timeoutMs/1000}s`);
  
  // ... use timeoutMs in fetchWithTimeout
}
```

### Update Step 12 call

```typescript
case 12:
  await executeStep(supabase, reportRunId, 12, async () => {
    console.log(`Step 12: Final assembly starting with extended timeout`);
    
    const assemblyPrompt = getStepPrompt(12, defaultAssemblyPrompt);
    
    // Use 120s timeout for final assembly (2x normal)
    const assemblyResult = await callAIWithRetry(
      assemblyPrompt, 
      12, 
      systemPrompt, 
      getStepModel(12),
      120000  // 2 minute timeout
    );
    
    // ... rest of parsing logic
  });
```

## Expected Outcome

- Step 12 will have adequate time (2 minutes) to complete the complex final assembly
- Timeout logs will help diagnose any remaining issues
- Recovery logic will continue to work for genuine failures
- Current stuck run will need manual reset or will resolve on next retry

## Alternative Approach (if 2 min still fails)

If the 2-minute timeout still isn't enough, we could:
1. Split Step 12 into two sub-steps:
   - Step 12a: Generate report_markdown and tables
   - Step 12b: Generate sources and data_gaps
2. Use a faster model (gemini-3-flash-preview) with explicit instructions
3. Pre-summarize step outputs before passing to Step 12
