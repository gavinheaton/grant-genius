
# Extend Timeout for Step 0 in Report Generation

## Problem

Step 0 (Build Source Pack) keeps timing out because:
1. The AI call timeout is 45 seconds
2. Successful Step 0 runs take 50-70 seconds total
3. Step 0 uses `google/gemini-3-pro-preview` (configured via prompt bundle) which needs more time for the complex source curation task

Recent data shows:
- Successful Step 0: 50-70 seconds
- Failed/stuck runs: Still running after 97+ seconds or cancelled after 5+ minutes

## Solution

Extend the AI call timeout specifically for Step 0, similar to how Step 12 already has an extended timeout (120 seconds as noted in memory).

## Current Timeouts

| Operation | Current Timeout |
|-----------|-----------------|
| Firecrawl scrape | 60 seconds |
| AI calls (general) | 45 seconds |
| Step 12 (assembly) | 120 seconds (in resume-report-run) |

## Proposed Changes

| Operation | New Timeout |
|-----------|-------------|
| Step 0 AI call | 90 seconds |
| Steps 1-11 AI calls | 45 seconds (unchanged) |
| Step 12 AI call | 120 seconds (unchanged) |

## Implementation

### File to Modify

`supabase/functions/generate-report/index.ts`

### Changes

1. **Modify `callAIWithRetry` to accept a custom timeout parameter**:

```typescript
async function callAIWithRetry(
  prompt: string, 
  stepNumber: number, 
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  modelOverride?: string | null,
  timeoutMs?: number  // NEW: optional custom timeout
): Promise<string> {
```

2. **Add timeout logic based on step number**:

```typescript
// Determine timeout based on step complexity
function getTimeoutForStep(stepNumber: number): number {
  if (stepNumber === 0) return 90000;  // 90s for source pack
  if (stepNumber === 12) return 120000; // 120s for assembly
  return 45000; // 45s default
}
```

3. **Update the `fetchWithTimeout` call inside `callAIWithRetry`**:

```typescript
const timeout = timeoutMs ?? getTimeoutForStep(stepNumber);

const response = await fetchWithTimeout(
  "https://ai.gateway.lovable.dev/v1/chat/completions",
  { ... },
  timeout  // Use step-specific timeout
);
```

4. **Also increase Firecrawl timeout for reliability**:

Change line 497 from `60000` to `75000` (75 seconds) since the article scrape happens before Step 0 AI call and can sometimes be slow.

## Summary of Changes

```text
File: supabase/functions/generate-report/index.ts

1. Add getTimeoutForStep() function:
   - Step 0: 90 seconds (source pack needs time to curate 12-25 sources)
   - Step 12: 120 seconds (assembly of full report)
   - Others: 45 seconds (simpler tasks)

2. Update callAIWithRetry() to use step-specific timeouts

3. Increase Firecrawl timeout: 60s → 75s
```

## Expected Outcome

- Step 0 will have 90 seconds to complete the source pack curation
- Combined with the 75-second Firecrawl timeout, the total Step 0 phase can take up to ~165 seconds before failing
- This accommodates the observed 50-70 second successful runs with comfortable margin
- Retry logic remains in place for rate limits
