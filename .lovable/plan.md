

## Fix: Resume/Restart Parameter Name Mismatch

### Root Cause

The `StalledRunsTable` sends `{ runId }` in the request body, but both edge functions expect a different field name:

- `resume-report-run` expects `{ reportRunId }` (line 323)
- `clear-and-restart-run` expects `{ reportRunId }` (line 36)

Since `reportRunId` is `undefined`, the function returns a 400 error: "Report run ID is required".

### Fix

**File: `src/components/admin/StalledRunsTable.tsx`**

Change the request body field from `runId` to `reportRunId` in both handlers:

```typescript
// handleResume: change { runId } to { reportRunId: runId }
await supabase.functions.invoke("resume-report-run", {
  body: { reportRunId: runId },
});

// handleRestart: change { runId } to { reportRunId: runId }
await supabase.functions.invoke("clear-and-restart-run", {
  body: { reportRunId: runId },
});
```

### Files Changed

| File | Change |
|---|---|
| `src/components/admin/StalledRunsTable.tsx` | Fix body parameter name from `runId` to `reportRunId` in both `handleResume` and `handleRestart` |

