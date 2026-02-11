

## Fix: Report Generation Failure - Root Cause and Notification Gap

### What happened

The most recent report run (`4043a0e5`) failed at Step 5 with two cascading issues:

1. **Invalid model name**: The AI API rejected `gemini-3-flash-preview` because it requires the `google/` prefix (`google/gemini-3-flash-preview`). This caused Steps 3 and 5 to fail with `400 Bad Request` errors.
2. **JSON truncation**: After auto-resume routed to the Cloud Run worker, Step 5 produced truncated JSON that the JSON Guard couldn't repair after 3 attempts, resulting in the final halt.

### Why no failure email was sent

The failure notification email is **only implemented in the `worker-proxy` edge function** (triggered when an external worker reports a failure via the `update_run` action). However, this run failed inside the **`resume-report-run` edge function**, which updates the database directly but **does not send a failure notification email**. This is the gap.

### Fix 1: Add failure notification to `resume-report-run`

**File: `supabase/functions/resume-report-run/index.ts`**

After the `updateRunStatus(supabase, reportRunId, "failed", errorMessage)` call (around line 761), add the same failure notification logic that exists in `worker-proxy`:

- Fetch the `BREVO_API_KEY` and `APP_URL` environment variables
- Send an email to `grantgenius@disruptorsco.com` with the run ID, halt reason, and a link to the admin manual queue
- Keep it fire-and-forget (non-blocking) so it doesn't affect error handling flow

### Fix 2: Fix model name prefix

**File: `supabase/functions/resume-report-run/index.ts`**

In the `callAIWithRetry` function (or where the model name is resolved), add a normalization step that ensures model names from the prompt bundle always include the provider prefix. If a model name like `gemini-3-flash-preview` is provided without a prefix, automatically prepend `google/`.

Logic:
```text
if model starts with "gemini" -> prepend "google/"
if model starts with "gpt" -> prepend "openai/"
otherwise -> use as-is
```

### Summary of changes

| File | Change |
|------|--------|
| `supabase/functions/resume-report-run/index.ts` | Add failure notification email after `updateRunStatus(..., "failed", ...)` |
| `supabase/functions/resume-report-run/index.ts` | Add model name prefix normalization in AI call logic |

### No database changes needed

Both fixes are purely in edge function code.

