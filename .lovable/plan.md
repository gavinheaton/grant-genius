

# Manual Processing Grant Type - Implementation Plan

## Overview

This feature introduces a **manual processing mode** for grants where reports are prepared by humans (admin) rather than the automated AI pipeline. This is ideal for grants requiring specialized expertise or bespoke analysis.

---

## User Journey

### Researcher Experience

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  1. User selects a "Manual" grant type                                 │
│     ↓                                                                   │
│  2. User fills in the usual inputs (URL, summary, TRL, IP status)      │
│     ↓                                                                   │
│  3. User clicks "Submit for Review" (instead of "Generate Report")     │
│     ↓                                                                   │
│  4. Email sent to configured admin address with all submission details │
│     ↓                                                                   │
│  5. User sees "Pending Admin Review" status                            │
│     ↓                                                                   │
│  6. When admin completes report, user receives email with:             │
│     • Link to view report in-app                                       │
│     • PDF and DOCX attachments                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Admin Experience

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  1. Admin receives email notification of new manual submission         │
│     ↓                                                                   │
│  2. Admin opens "Manual Queue" page in Admin Console                   │
│     ↓                                                                   │
│  3. Admin views submission details (user info, inputs, article URL)    │
│     ↓                                                                   │
│  4. Admin pastes/writes report content in Rich Text Editor             │
│     ↓                                                                   │
│  5. Admin clicks "Complete & Send to User"                             │
│     ↓                                                                   │
│  6. System generates PDF/DOCX, creates report record                   │
│     ↓                                                                   │
│  7. Email sent to user with view link + attachments                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database Changes

### 1. Add `processing_mode` to `grants` table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `processing_mode` | text | `'automated'` | `'automated'` or `'manual'` |
| `admin_notification_email` | text | null | Email to notify for manual submissions |

### 2. Add `manual_status` to `applications` table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `manual_status` | text | null | `'pending_review'`, `'in_progress'`, `'completed'` |
| `manual_submitted_at` | timestamptz | null | When user submitted for manual review |

### 3. Add `manual_report_html` to `reports` table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `is_manual` | boolean | false | Marks this as a manually-created report |
| `manual_report_html` | text | null | Admin-authored HTML content |

---

## New Admin Page: Manual Queue

### Route: `/admin/manual-queue`

**Features:**
- List of pending manual submissions with user email, grant name, submission date
- Expandable view of each submission showing:
  - Project name, Article URL, Summary, TRL, IP Status
  - User's email address
- Rich text editor (using the existing HTML-first architecture) for entering report content
- "Save Draft" and "Complete & Send" actions
- Status indicators: Pending, In Progress, Completed

---

## Edge Functions Required

### 1. `submit-manual-request`
Called when user submits a manual grant application:
- Updates application `manual_status` to `'pending_review'`
- Sends email notification to `admin_notification_email` with:
  - User's email
  - All input fields
  - Link to admin manual queue

### 2. `complete-manual-report`
Called when admin completes and sends the report:
- Creates report record with `is_manual = true`
- Generates PDF using existing `generate-pdf` function
- Generates DOCX using existing `generate-docx` function
- Sends email to user with:
  - Link to view in-app
  - PDF and DOCX as attachments (via Brevo)
- Updates `manual_status` to `'completed'`

---

## Frontend Changes

### Grant Admin (GrantEdit.tsx)
- Add toggle: **Processing Mode** (Automated / Manual)
- For Manual mode: Add text field for **Admin Notification Email**

### Application Workspace (ApplicationWorkspace.tsx)
- Detect if grant is manual mode
- Replace "Generate Report" button with "Submit for Review"
- Show "Pending Admin Review" status instead of generation progress
- Display completed manual reports in the existing Reports List

### New Admin Page (ManualQueue.tsx)
- Table of pending submissions
- Detail/editor panel with:
  - Submission info (read-only)
  - Rich text editor for report content
  - Save Draft / Complete & Send buttons

---

## Email Templates

### 1. `MANUAL_SUBMISSION_ADMIN` (to admin)
**Subject:** New Manual Report Request from {user_email}
**Content:**
- User details
- Grant name
- All submitted inputs
- Link to Manual Queue

### 2. `MANUAL_REPORT_READY` (to user)
**Subject:** Your Report is Ready - {grant_name}
**Content:**
- Confirmation message
- Link to view report
- PDF and DOCX attachments

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/admin/ManualQueue.tsx` | Admin queue listing and editor |
| `src/components/admin/ManualReportEditor.tsx` | Rich text editor component for reports |
| `supabase/functions/submit-manual-request/index.ts` | Handle user manual submission |
| `supabase/functions/complete-manual-report/index.ts` | Handle admin completion + email |

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/admin/GrantEdit.tsx` | Add processing mode toggle + notification email field |
| `src/pages/ApplicationWorkspace.tsx` | Detect manual mode, show different UI |
| `src/components/admin/AdminSidebar.tsx` | Add Manual Queue nav link |
| `src/pages/admin/AdminDashboard.tsx` | Add pending manual count widget (optional) |

---

## Technical Notes

### Rich Text Editor
We'll use a simple HTML-based approach consistent with the existing HTML-first architecture:
- `textarea` with preview for V1, or integrate a lightweight rich text editor
- Content stored as HTML in `manual_report_html`
- Reuse existing PDF/DOCX generation which already handles HTML input

### Email Attachments
Brevo supports attachments via base64-encoded content. The `complete-manual-report` function will:
1. Generate PDF and DOCX using existing functions
2. Encode files as base64
3. Include in Brevo API call as attachments

### Entitlements
Manual reports will consume entitlements the same as automated reports - credit is consumed when the user submits (not when admin completes).

---

## Summary

This implementation adds a parallel "manual" track alongside the existing automated pipeline, giving you flexibility to handle specialized grants that require human expertise while maintaining the same user-facing experience (submit inputs → receive report).

