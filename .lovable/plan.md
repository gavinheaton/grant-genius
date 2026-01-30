

# Live Log Viewer Component for Replit Worker Debugging

## Overview

Create a collapsible real-time log viewer that displays status messages from the Replit worker during report generation. This will help debug issues like the Gemini API not being triggered.

## Architecture

The log viewer will:
1. Subscribe to `report_logs` table via Supabase Realtime
2. Display logs in a scrollable panel with color-coded levels (info/warn/error)
3. Auto-scroll to newest entries
4. Show timestamps and optional expandable details
5. Integrate into the existing `GenerationProgress` component

## Implementation Plan

### 1. Create Custom Hook: `useReportLogs`

**File:** `src/hooks/useReportLogs.ts`

This hook will:
- Accept a `reportRunId` parameter
- Fetch initial logs from the database
- Subscribe to realtime INSERT events on `report_logs` table
- Return logs array sorted by timestamp
- Handle cleanup on unmount

```typescript
interface ReportLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  details?: Record<string, unknown>;
}
```

### 2. Create Log Viewer Component

**File:** `src/components/workspace/ReportLogViewer.tsx`

Features:
- Collapsible card (collapsed by default, expands on click)
- Color-coded log entries:
  - `info` - gray/muted text
  - `warn` - amber/yellow styling
  - `error` - red/destructive styling
- Scrollable area with max height (~200px)
- Auto-scroll to bottom when new logs arrive
- Relative timestamps (e.g., "2s ago", "1m ago")
- Expandable details for entries with `details` JSON

UI Structure:
```text
+------------------------------------------+
| > Worker Logs (12 entries)         [^/v] |
+------------------------------------------+
| 10:32:15 [info]  Starting step 3...      |
| 10:32:18 [info]  Calling Gemini API...   |
| 10:32:19 [warn]  Rate limit approaching  |
| 10:32:25 [error] API key invalid!        |
|   > details: { code: 401, ... }          |
+------------------------------------------+
```

### 3. Integrate into GenerationProgress

**File:** `src/components/workspace/GenerationProgress.tsx`

- Import and render `ReportLogViewer` at the bottom of the card
- Pass `activeRunId` prop when available
- Only show during active generation or failed/stalled states

### 4. Pass Run ID from Workspace

**File:** `src/pages/ApplicationWorkspace.tsx`

- Pass `activeRun?.id` to `GenerationProgress` component
- Component will forward to `ReportLogViewer`

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useReportLogs.ts` | Create | Hook for fetching and subscribing to logs |
| `src/components/workspace/ReportLogViewer.tsx` | Create | Visual log display component |
| `src/components/workspace/GenerationProgress.tsx` | Modify | Add log viewer integration |
| `src/pages/ApplicationWorkspace.tsx` | Modify | Pass run ID prop |

## Technical Details

### Realtime Subscription Pattern

Following the existing pattern in `useReportGeneration.ts`:

```typescript
const channel = supabase
  .channel(`report-logs-${reportRunId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'report_logs',
      filter: `report_run_id=eq.${reportRunId}`,
    },
    (payload) => {
      // Add new log to state
    }
  )
  .subscribe();
```

### Log Display Logic

- Show newest logs at bottom (standard log convention)
- Limit display to most recent 100 logs to prevent memory issues
- Format timestamps relative to now for readability
- Truncate long messages with expand option

## Benefits

1. **Real-time visibility** - See exactly what the Replit worker is doing
2. **Debug API issues** - Immediately see if Gemini API calls are failing
3. **No code changes on Replit** - Uses existing `log_message` action in worker-proxy
4. **Non-intrusive** - Collapsed by default, doesn't clutter normal flow

