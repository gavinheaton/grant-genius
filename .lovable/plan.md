

## Improve Progress Reporting for Claude Single-Prompt Runs

### Problem
When generating a report with the Claude (Single Prompt) engine, the progress indicator shows "Step 1/1: Claude Single Prompt" with a bar stuck at 0% until it jumps to 100%. There's no sense of progress during what can be a 2-5 minute wait.

### Solution: Virtual Progress Phases
Break the single API call into visible phases that advance based on **log messages** from the backend. The edge function already writes logs at key moments -- we add a few more, and the frontend maps them to virtual progress stages.

### Changes

**1. Backend: Add more log messages to `run-claude-report/index.ts`**

Insert additional `logMessage` calls at each logical phase:
- "Preparing prompt and context..." (after building variables)
- "Prompt assembled (N chars). Calling Claude API..." (already exists)
- "Waiting for AI response..." (right after the fetch call starts)
- "Claude response received (N chars). Saving report..." (already exists)
- "Report saved. Finalizing..." (after report insert)
- "Report generation complete" (already exists)

This gives 5-6 distinct log events the frontend can react to.

**2. Frontend: Add a phase-based progress display for single-step runs in `GenerationProgress.tsx`**

When `totalSteps <= 1` and `status === "running"`:
- Define virtual phases: Preparing -> Calling AI -> Waiting for Response -> Processing Result -> Saving Report -> Complete
- Map incoming log messages (from `ReportLogViewer`'s data) to phase transitions
- Show the current phase name instead of "Step 1/1: Claude Single Prompt"
- Advance the progress bar proportionally (e.g., 10% -> 25% -> 50% -> 75% -> 90% -> 100%)
- Add a gentle animated pulse/shimmer on the progress bar during the long "Waiting for Response" phase to signal activity

**3. Frontend: Pass logs data up from `useReportLogs` into `GenerationProgress`**

- Add a `logs` prop to `GenerationProgress` (or use the hook directly inside it)
- The component already renders `ReportLogViewer` and has `activeRunId` -- we'll use the same hook internally to read log messages and derive the current phase

### Technical Details

**Phase mapping logic** (inside `GenerationProgress.tsx`):
```text
Log message contains         -> Phase index (0-5) -> Progress %
"Preparing prompt"           -> 1                  -> 15%
"Calling Claude API"         -> 2                  -> 30%
"Waiting for AI"             -> 3                  -> 50%
"Claude response received"   -> 4                  -> 75%
"Report saved"               -> 5                  -> 90%
"complete"                   -> 6                  -> 100%
```

Between phases, the progress bar will smoothly animate using a CSS transition (already in place via the Progress component's `transition-all`). During the longest phase ("Waiting for Response"), a subtle time-based interpolation will inch the bar forward to prevent it from appearing frozen.

**Files to modify:**
- `supabase/functions/run-claude-report/index.ts` -- add 2-3 new log messages
- `src/components/workspace/GenerationProgress.tsx` -- add single-step phase detection and display
- `src/hooks/useReportLogs.ts` -- expose logs for consumption (may already be suitable)

No database changes required.

