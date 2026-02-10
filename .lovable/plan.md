

## Fix: Missing Review Notification Email in Worker-Proxy

### Problem
When a report completes via the Cloud Run worker and enters the review workflow, the `worker-proxy` function creates the review record but does **not** send a notification email to the assigned reviewer. This means the reviewer has no way of knowing a report is waiting for them unless they manually check the admin dashboard.

The other two code paths that create review steps (`approve-review` and `complete-manual-report`) both send the `REVIEW_REQUESTED` email correctly -- `worker-proxy` is the only one missing it.

### Fix

**File: `supabase/functions/worker-proxy/index.ts`**

Add reviewer notification email logic to the `workerProxyCheckReviewWorkflow` function, after the `report_reviews` insert succeeds (around line 1072). The implementation will:

1. Look up the reviewer's email from the `profiles` table using `firstStep.reviewer_user_id`
2. Look up the grant name (already have `grantVersion.grant_id`)
3. Fetch the `REVIEW_REQUESTED` email template from `email_templates`
4. Send the email via Brevo API (using `BREVO_API_KEY`, same pattern as `approve-review`)
5. Log the sent email to `email_outbox`
6. This is fire-and-forget -- a failure to send the email should not break the review workflow

The email will include:
- Subject: "Report Review Required - {grant_name}"
- Reviewer name, grant name, and a link to the review page
- Uses the same shortcode interpolation as the existing implementations

### No other changes needed
- Database schema is already correct
- The `REVIEW_REQUESTED` template already exists in `email_templates`
- The `email_outbox` table is ready to receive the log entry

