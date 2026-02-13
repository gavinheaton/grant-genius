

## Two Changes: Fix the Gap + Add Resend Button

### Problem Summary

Gavin's run completed via the admin Resume button's "final step recovery" path, which marks the run as completed but skips both the email notification and the application status update. There is also no way for admins to manually resend an email from the Email Logs page.

This plan addresses both issues, plus sends Gavin his email immediately.

---

### Change 1: Fix final-step-recovery to send email

**File: `supabase/functions/resume-report-run/index.ts`**

In the "report already exists" branch (around lines 392-409), after marking the run as completed, add:

1. Update the application status to `ready`
2. If `email_on_complete` is true, call `send-report-email` with the report details

This ensures any future resumed-at-final-step runs will properly notify the user.

### Change 2: Add "Resend" button to Email Logs

**File: `src/pages/admin/EmailLogs.tsx`**

Add a "Resend" action column to the email logs table. The button will:

- Call the `send-report-email` function using the `user_id` from the email_outbox row to look up the most recent completed report for that user and re-trigger the notification
- Since the existing `email_outbox` rows don't store `reportRunId`/`reportId` in `variables_json`, the resend approach will instead create a new edge function call

**New edge function: `supabase/functions/resend-email/index.ts`**

A simpler approach -- this function accepts an `emailOutboxId`, reads the original outbox row, and re-dispatches the same email via Brevo using the stored template_key, to_email, subject, and variables. This works generically for any email type, not just report-ready.

Flow:
1. Admin clicks "Resend" on an email row
2. Frontend calls `resend-email` with `{ emailOutboxId }`
3. Function reads the original outbox entry, re-sends via Brevo API, and creates a new outbox row linked to the original

### Change 3: Immediately send Gavin's email

After deploying, manually invoke `send-report-email` for Gavin's completed report to resolve the immediate issue.

---

### Technical Details

**resume-report-run/index.ts** -- lines 392-409, after the run status update:

```typescript
// Update application status
await supabaseAdmin
  .from("applications")
  .update({ status: "ready" })
  .eq("id", reportRun.application_id);

// Send email if enabled
if (reportRun.email_on_complete) {
  const ownerUserId = (reportRun.application as any).user_id;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    await fetch(`${SUPABASE_URL}/functions/v1/send-report-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        reportRunId: reportRun.id,
        reportId: existingReport.id,
        applicationId: reportRun.application_id,
        userId: ownerUserId,
      }),
    });
  } catch (e) {
    console.error("Failed to send recovery email:", e);
  }
}
```

**resend-email/index.ts** -- new edge function:
- Accepts `{ emailOutboxId }` 
- Validates caller is admin via `is_admin` RPC
- Reads original outbox row (template_key, to_email, subject, variables_json)
- Re-sends via Brevo API using same template/variables
- Inserts a new outbox row with status tracking

**EmailLogs.tsx** -- add Resend button:
- New "Actions" column in the table
- "Resend" button calls `resend-email` function
- Shows loading spinner during send
- Toast on success/failure
- Refetches email logs after resend

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/resume-report-run/index.ts` | Add email + app status update to final-step-recovery branch |
| `supabase/functions/resend-email/index.ts` | New edge function to resend any email from outbox |
| `src/pages/admin/EmailLogs.tsx` | Add Resend button column |
