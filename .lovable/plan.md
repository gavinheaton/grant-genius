

## Report Review Workflow

Add a configurable multi-step review workflow to grants, so that completed reports go through admin reviewers before being sent to the user.

### How It Works

1. Admin configures a review workflow on a grant (1-3 reviewers, each an admin user)
2. When a report completes (automated or manual), instead of emailing the user directly, the system puts the report into "review" status
3. The first reviewer gets an email with a link to review the report
4. The reviewer opens a WYSIWYG editor (similar to the email template editor but for the report HTML) where they can edit and then either "Save Changes" or "Approve & Send to Next Reviewer"
5. When the last reviewer approves, the report is finalized and sent to the user via the normal REPORT_READY email flow

### User-Facing Flow

```text
Report Generated
      |
      v
[Workflow enabled?] --No--> Send email to user (current behavior)
      |
     Yes
      |
      v
Status: "pending_review" (step 1 of N)
Email reviewer 1
      |
      v
Reviewer 1 opens link --> WYSIWYG editor
Reviewer 1 edits/approves
      |
      v
[More reviewers?] --No--> Finalize & send to user
      |
     Yes
      |
      v
Status: "pending_review" (step 2 of N)
Email reviewer 2
      ...and so on
```

### Database Changes

**New table: `grant_review_workflows`**
- `id` (uuid, PK)
- `grant_id` (uuid, FK to grants, unique -- one workflow per grant)
- `is_enabled` (boolean, default false)
- `step_count` (integer, 1-3)
- `created_at`, `updated_at`

**New table: `grant_review_workflow_steps`**
- `id` (uuid, PK)
- `workflow_id` (uuid, FK to grant_review_workflows)
- `step_number` (integer, 1-3)
- `reviewer_user_id` (uuid, FK to profiles.user_id)
- Unique constraint on (workflow_id, step_number)

**New table: `report_reviews`**
- `id` (uuid, PK)
- `report_id` (uuid, FK to reports)
- `workflow_step_id` (uuid, FK to grant_review_workflow_steps)
- `reviewer_user_id` (uuid)
- `step_number` (integer)
- `status` (text: pending, in_progress, approved)
- `edited_html` (text, nullable -- reviewer's edits)
- `notes` (text, nullable)
- `started_at`, `completed_at`
- `created_at`

**New column on `reports`:**
- `review_status` (text, nullable: pending_review, in_review, approved, null for no workflow)
- `current_review_step` (integer, nullable)

**RLS Policies:**
- `grant_review_workflows` and `grant_review_workflow_steps`: Admins can manage, read-only for authenticated users
- `report_reviews`: Admins can read all; assigned reviewer can update their own review step

**New email template: `REVIEW_REQUESTED`**
- Shortcodes: `{{reviewer_name}}`, `{{grant_name}}`, `{{application_title}}`, `{{review_link}}`, `{{step_number}}`, `{{total_steps}}`

### Frontend Changes

**1. New "Workflow" tab on Grant Edit page (`src/pages/admin/GrantEdit.tsx`)**
- Toggle: Enable/disable review workflow
- Dropdown: Number of steps (1, 2, or 3)
- For each step: a dropdown showing admin users (email) fetched from `profiles` joined with `user_roles`
- Save button persists to `grant_review_workflows` and `grant_review_workflow_steps`

**2. New Review page (`src/pages/admin/ReportReview.tsx`)**
- Accessed via `/admin/reviews/:reviewId`
- Loads the report HTML into a WYSIWYG editor (using the same Edit/Preview tabs pattern as the email template editor and manual report editor)
- Reviewer can edit the HTML and preview changes
- Two actions: "Save Draft" and "Approve"
- On approve: updates `report_reviews` status, if last step then triggers the user email; otherwise emails the next reviewer

**3. Review status indicator on Application Workspace**
- Show a "In Review" badge when the report has `review_status = 'pending_review'` or `'in_review'`
- Users see that their report is being reviewed but cannot access it until approved

**4. Admin reviews dashboard (lightweight)**
- A badge/counter on the admin sidebar showing pending reviews for the logged-in admin
- Clicking navigates to a filtered list of their pending reviews

### Backend Changes

**1. Intercept report completion (`supabase/functions/resume-report-run/index.ts`)**
- After `save_report` succeeds, check if the grant has an enabled workflow
- If yes: set `reports.review_status = 'pending_review'`, create `report_reviews` record for step 1, email the first reviewer
- If no: proceed with current behavior (email user directly)

**2. Same intercept for manual reports (`supabase/functions/complete-manual-report/index.ts`)**
- After creating the report, check for workflow and route accordingly

**3. New edge function: `approve-review` (`supabase/functions/approve-review/index.ts`)**
- Validates the reviewer is the assigned admin
- Updates `report_reviews` status to "approved", saves any edited HTML
- If edited HTML provided, updates `reports.content_json` (or `manual_report_html`)
- If more steps remain: creates next `report_reviews` record, emails next reviewer
- If final step: sets `reports.review_status = 'approved'`, triggers `send-report-email` to the user

### What You Flagged vs. What's Added

Your description covers the core flow well. Here are a few additions in this plan:

- **Manual reports also go through workflow** -- since both automated and manual reports should be reviewable
- **Edited HTML is versioned per review step** -- each reviewer's edits are tracked in `report_reviews.edited_html` so there's an audit trail
- **Review status visible to users** -- they see "In Review" rather than nothing, so they know their report is being processed
- **Reviewer notification email** -- a new `REVIEW_REQUESTED` template configurable in the admin email templates section

### Files to Create/Edit

| File | Change |
|------|--------|
| Migration SQL | Create 3 new tables + add columns to reports |
| `src/pages/admin/GrantEdit.tsx` | Add "Workflow" tab with toggle, step count, reviewer dropdowns |
| `src/pages/admin/ReportReview.tsx` | New page: WYSIWYG report review editor |
| `src/App.tsx` | Add route for `/admin/reviews/:reviewId` |
| `src/components/admin/AdminSidebar.tsx` | Add "Reviews" link with pending count badge |
| `supabase/functions/resume-report-run/index.ts` | Check workflow before sending user email |
| `supabase/functions/complete-manual-report/index.ts` | Check workflow before sending user email |
| `supabase/functions/approve-review/index.ts` | New edge function for review approval |
| `supabase/config.toml` | Add approve-review function config |
| `src/components/workspace/GenerationProgress.tsx` | Show "In Review" status |

### Phasing Suggestion

This is a large feature. Consider implementing in two phases:

**Phase A (this plan):** Workflow config UI, review interception, WYSIWYG review page, approve flow, email notifications

**Phase B (future):** AI-assisted review suggestions, review comments/annotations, review history dashboard, reviewer reassignment

