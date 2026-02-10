

## Fix: Add Email Notification to Cloud Run Worker Report Flow

### Problem

When reports complete via the Cloud Run worker, the `worker-proxy` `save_report` action saves the report but never triggers the `send-report-email` function. Email notifications only fire for:
- Edge engine runs (handled in `resume-report-run`)
- Review workflow approvals (handled in `approve-review`)

This means all Cloud Run-generated reports silently skip the email notification, even when `email_on_complete` is true.

### Changes

**`supabase/functions/worker-proxy/index.ts`** -- Add email trigger at the end of `handleSaveReport`

After the report is successfully saved (around line 931), add the same email-triggering pattern used in `resume-report-run`:

1. Fetch the run to check `email_on_complete`
2. Look up the grant version to check for a review workflow
3. If a review workflow exists, start it (same as `resume-report-run` does) and skip the email
4. If no workflow and `email_on_complete` is true, call `send-report-email` with the report details

The logic mirrors lines 864-894 of `resume-report-run/index.ts`:

```text
// After report saved successfully (line 931):
// 1. Check email_on_complete on the run
// 2. Check for review workflow on the grant
// 3. If no workflow + email_on_complete → call send-report-email
// 4. Update application status to 'completed'
```

Specifically:

- Query `report_runs` for `email_on_complete` using `report_run_id`
- Query `grant_review_workflows` to check if a review workflow is enabled for the grant
- If workflow exists: set `report.review_status = 'pending_review'` and create the first `report_reviews` entry
- If no workflow and email enabled: `fetch` the `send-report-email` edge function with `{ reportRunId, reportId, applicationId, userId }`
- Update `applications.status = 'completed'`

### Technical Details

| File | Change |
|------|--------|
| `supabase/functions/worker-proxy/index.ts` | Add email notification + review workflow check after `save_report` completes |

### What This Fixes

- Cloud Run worker-completed reports will now send email notifications
- Review workflows will also be triggered correctly for Cloud Run runs (currently also missing)
- Application status will be updated to 'completed' (also currently missing from the worker path)

