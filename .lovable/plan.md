

## Fix: Email Not Sent After Claude Report Completion

### Problem
The `run-claude-report` function calls `send-report-email` with the wrong payload shape:

**What it sends:**
```json
{ "report_run_id": "..." }
```

**What `send-report-email` expects:**
```json
{ "reportRunId": "...", "reportId": "...", "applicationId": "...", "userId": "..." }
```

The function receives no `reportId`, `applicationId`, or `userId`, so it immediately returns a 400 "Missing required fields" error.

### Fix
Update the email dispatch block in `run-claude-report/index.ts` (around line 220) to:
1. Capture the report ID after the insert (query it back since the insert doesn't return it directly, or use `.select().single()`)
2. Send the correct camelCase payload with all four required fields: `reportRunId`, `reportId`, `applicationId`, `userId`

### Technical Details

In `supabase/functions/run-claude-report/index.ts`:

1. Change the report insert to return the new report's ID:
```typescript
const { data: newReport, error: reportError } = await supabase
  .from("reports")
  .insert({ ... })
  .select("id")
  .single();
```

2. Update the email sending block to pass the full payload:
```typescript
await fetch(`${supabaseUrl}/functions/v1/send-report-email`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${serviceRoleKey}`,
  },
  body: JSON.stringify({
    reportRunId: report_run_id,
    reportId: newReport.id,
    applicationId: app.id,
    userId: app.user_id,
  }),
});
```

No other files need changes.
