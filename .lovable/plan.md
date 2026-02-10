

## Researcher "Report Submitted" Popup + Failure Notification Email

### Overview
Two changes:
1. **Researchers** who click "Generate Report" will see a popup dialog (not the progress page) telling them the report will be emailed in ~15 minutes. Clicking "Close" returns them to the dashboard. **Admins** continue to see the full progress UI as today.
2. When a report run transitions to **failed**, an email is sent to `grantgenius@disruptorsco.com` with a link to the failed report.

---

### Change 1: Researcher Popup

**File: `src/pages/ApplicationWorkspace.tsx`**

- Destructure `isAdmin` from `useAuth()` (currently only `isSuperAdmin` is used)
- Add a new state: `showSubmittedDialog` (boolean, default false)
- In `handleGenerateReport`:
  - After `await startGeneration()` succeeds, if the user is **not** an admin (`!isAdmin`), set `showSubmittedDialog = true` instead of staying on the page
- Add a `Dialog` component that shows when `showSubmittedDialog` is true:
  - Icon: Mail/CheckCircle
  - Title: "Report Generation Started"
  - Body: "Your report is being generated and will be sent to your email in approximately 15 minutes. You can also check back on your dashboard to view the completed report."
  - A single "Close" button that calls `navigate("/dashboard")`
- For **admins** (`isAdmin === true`), the current behavior is preserved -- they see the full progress tracker, step logs, cancel/resume controls, etc.
- The progress section (`GenerationProgress` component and related UI) will be conditionally rendered only when `isAdmin` is true, so researchers never see it even if they navigate back to the page while a run is active (they already get the email).

### Change 2: Failure Notification Email

**File: `supabase/functions/worker-proxy/index.ts`**

- In the `update_run` handler, after a run status is set to `"failed"` (around line 532 where the DB update succeeds), send a notification email to `grantgenius@disruptorsco.com` using the existing Brevo API integration:
  - Subject: "Report Generation Failed - [Run ID]"
  - Body: includes the run ID, application ID, halt reason, and a link to the admin report review page
  - Uses the `BREVO_API_KEY` secret (already available)
  - This is a fire-and-forget call -- failure to send the email does not block the response
- The link format will be: `{APP_URL}/admin/manual-queue` (or a direct link if available)

---

### Technical Details

| Item | Detail |
|---|---|
| New state in ApplicationWorkspace | `showSubmittedDialog: boolean` |
| Auth check | `isAdmin` from `useAuth()` (true for both admin and super_admin) |
| Dialog component | Uses existing `Dialog` from `@/components/ui/dialog` |
| Progress visibility | `GenerationProgress` and related progress UI wrapped in `isAdmin` check |
| Failure email recipient | `grantgenius@disruptorsco.com` (hardcoded) |
| Failure email sender | Uses existing Brevo sender config |
| Edge function modified | `worker-proxy/index.ts` -- add email dispatch after failed status update |
| No DB changes needed | None |

