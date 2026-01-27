
# Add "Email Me When Ready" Feature

## Overview

Add an "Email me the report when ready" button during report generation. When the report completes, the system will automatically send an email with the generated report (PDF) to the user's registered email address.

## Current System Context

Based on my exploration:
- **Email system**: The project uses Brevo for transactional emails (PRD confirms this). The `email_outbox` and `email_templates` tables exist but have no templates configured yet.
- **Report completion**: The `createFinalReport()` function in `resume-report-run/index.ts` creates the final report and marks it complete at step 10.
- **User email access**: Available via `profiles.email` table, linked to the authenticated user.
- **PDF generation**: Currently placeholder (`pdf_path` is null) - actual PDF generation will need to be implemented separately.

## What We'll Build

### 1. Frontend: "Email Me When Ready" Button

Add a checkbox/button to the `GenerationProgress` component that appears during generation:

| Element | Behavior |
|---------|----------|
| Checkbox with mail icon | "Email me the report when ready" |
| Toggle state persisted | Saved to `report_runs.email_on_complete` |
| Confirmation when toggled | Toast: "We'll email you when your report is ready" |

### 2. Database: Track Email Preference

Add a column to track if user wants email notification:

```sql
ALTER TABLE report_runs ADD COLUMN email_on_complete boolean DEFAULT false;
```

### 3. Backend: Send Email on Completion

When `createFinalReport()` is called:
1. Check if `email_on_complete = true`
2. Fetch user's email from `profiles` table
3. Create entry in `email_outbox` with `template_key = 'REPORT_READY'`
4. Call Brevo API to send the email with a link to download the report

### 4. Email Template Setup

Register the `REPORT_READY` template in `email_templates`:

| Field | Value |
|-------|-------|
| template_key | REPORT_READY |
| brevo_template_id | (User will configure in Brevo) |

## Architecture Flow

```text
User clicks "Email me when ready"
        │
        ▼
Frontend: UPDATE report_runs SET email_on_complete = true
        │
        ▼
... Report generation continues through steps 1-10 ...
        │
        ▼
Step 10 completes → createFinalReport() runs
        │
        ▼
Backend checks: email_on_complete === true?
        │
        ├─ No → Done
        │
        └─ Yes ──┐
                 ▼
        Fetch user email from profiles
                 │
                 ▼
        Insert into email_outbox (REPORT_READY)
                 │
                 ▼
        Call Brevo API to send email
                 │
                 ▼
        Email sent with link to view/download report
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx.sql` | Create | Add `email_on_complete` column to `report_runs` |
| `src/components/workspace/GenerationProgress.tsx` | Modify | Add email opt-in checkbox |
| `src/hooks/useReportGeneration.ts` | Modify | Add function to toggle email preference |
| `src/pages/ApplicationWorkspace.tsx` | Modify | Pass email toggle handler to progress component |
| `supabase/functions/resume-report-run/index.ts` | Modify | Send email in `createFinalReport()` when enabled |
| `supabase/functions/send-report-email/index.ts` | Create | New edge function to handle Brevo email sending |

## Technical Details

### Email Content
The email will include:
- Subject: "Your Grant Genius Report is Ready"
- Body: Personalized greeting, link to view report in the app, brief summary
- **Note**: Actual PDF attachment will require PDF generation to be implemented first. For MVP, email will contain a link to view the report in-app.

### Brevo Integration
- Uses Brevo Transactional Email API (as per PRD)
- Template variables: `{user_name}`, `{report_link}`, `{grant_name}`
- Status tracking via `email_outbox` table

### Security
- Email only sent to authenticated user's verified email
- Report link requires authentication to access
- RLS ensures users can only update their own runs

## Dependencies

**Required before full implementation:**
- Brevo API key needs to be configured as a secret (`BREVO_API_KEY`)
- Brevo transactional email template needs to be created in Brevo dashboard

## User Experience

1. User starts report generation
2. During generation, sees checkbox: "☐ Email me when my report is ready"
3. User checks the box → Toast confirms: "We'll email you when your report is ready"
4. User can close the browser/navigate away
5. When report completes, email is sent automatically
6. Email contains personalized message with link to view the report
