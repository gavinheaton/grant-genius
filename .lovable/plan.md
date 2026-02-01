

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

## Solution ✅ IMPLEMENTED

Two-pronged approach:

**1. Frontend: Auto-retry on 504 errors (resilience)** ✅
- Added `isTransientError()` helper to detect 504/network errors
- Exposed `is504Error` flag on `ReportRun` interface
- Detects transient errors via Realtime step updates
- Shows "Network hiccup detected" messaging with auto-retry countdown
- Already partially implemented via the stale detection logic

**2. Worker: Add request timeouts and retry logic (source fix)**
- Configure HTTP client timeouts to 30 seconds (fail fast)
- Implement exponential backoff retry for transient failures
- This requires changes to the external Replit worker (outside Lovable)

## Technical Implementation

### Changes to `src/hooks/useReportGeneration.ts` ✅

1. **Added TRANSIENT_ERROR_PATTERNS** - Regex patterns for 504, proxy error, gateway timeout, network, etc.
2. **Added isTransientError() helper** - Detects transient errors from step error messages
3. **Extended ReportRun interface** - Added `is504Error?: boolean` flag
4. **Updated checkActiveRun()** - Sets `is504Error` based on failed step error messages
5. **Updated Realtime step listener** - Immediately flags 504 errors when detected

### Changes to `src/components/workspace/GenerationProgress.tsx` ✅

1. **Added `is504Error` prop** - Passed from ApplicationWorkspace
2. **Added `showNetworkErrorMessage` flag** - Shows special messaging for 504 errors
3. **Network hiccup UI** - Yellow warning box with friendly message
4. **Updated auto-retry messaging** - "Your progress is saved" for network errors
5. **Updated button text** - "Retry Now" instead of "Resume Report" for 504 errors

### Changes to `src/pages/ApplicationWorkspace.tsx` ✅

1. **Passes `is504Error`** - Forwards the flag to GenerationProgress

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
- **After fix:** 504 → auto-detected → friendly message → auto-resume from checkpoint → run continues
