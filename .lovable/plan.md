

# Fix: Handle 504 Proxy Timeout Errors Gracefully

## Problem Summary

The report generation fails with "Proxy error: 504" when the external Cloud Run worker (hosted on Replit) makes a request to `worker-proxy` that stays open for 160 seconds, exceeding Supabase's gateway timeout.

## Evidence From Logs

| Timestamp | Event | Duration |
|-----------|-------|----------|
| 23:48:29 | Worker starts Step 2 (nrf_alignment_mapping) | - |
| 23:51:10 | 504 error returned | 160,026ms |

**Normal calls to `worker-proxy` complete in 200-1600ms.** The 160-second timeout suggests a network/connection issue between Replit and Supabase, not slow Edge Function logic.

## Root Cause

The Replit worker sends an HTTP request to `worker-proxy`, but either:
1. The connection hangs (TCP keepalive issue)
2. Replit worker is slow to send the request body (cold start)
3. Network path between Replit and Supabase has intermittent issues

Supabase's gateway terminates connections that exceed ~60 seconds with a 504, but the logged execution_time shows the request was held open for 160 seconds before the gateway killed it.

## Solution

Two-pronged approach:

**1. Frontend: Auto-retry on 504 errors (resilience)**
- When the frontend detects a "stalled" run with a 504 error, offer automatic retry
- Already partially implemented via the stale detection logic

**2. Worker: Add request timeouts and retry logic (source fix)**
- Configure HTTP client timeouts to 30 seconds (fail fast)
- Implement exponential backoff retry for transient failures
- This requires changes to the external Replit worker (outside Lovable)

## Technical Implementation

### Changes to `src/hooks/useReportGeneration.ts`

Improve the error handling to detect 504 errors and provide better UX:

1. **Add 504 detection in step monitoring** - When a step fails with a 504-related error, offer immediate retry
2. **Reduce stale threshold for active runs** - If a run was recently active (steps progressing), detect stalls faster
3. **Auto-resume on transient failures** - If the last error was a 504 and we have a valid checkpoint, auto-trigger resume

### Changes to Frontend Error Display

Update `GenerationProgress.tsx` to show specific messaging for 504 errors:
- "Network hiccup detected. Retrying automatically..."
- Auto-trigger resume for steps after the first checkpoint

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useReportGeneration.ts` | Add 504 detection and auto-retry logic |
| `src/components/workspace/GenerationProgress.tsx` | Show 504-specific error message with auto-retry |

## External Worker Recommendation

The Replit worker (`genius-worker-flow.replit.app`) should be updated to:

```javascript
// Add timeout to fetch calls
const response = await fetch(workerProxyUrl, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30000), // 30 second timeout
});
```

This prevents the worker from holding connections open indefinitely.

## Validation

After the fix:
1. Run a report and observe behavior during Step 2+
2. If a 504 occurs, the frontend should detect it within 30 seconds and auto-resume
3. The run should continue from the last checkpoint without user intervention

## Impact

- **Current behavior:** 504 → run fails → user must manually retry
- **After fix:** 504 → auto-detected → auto-resume from checkpoint → run continues

