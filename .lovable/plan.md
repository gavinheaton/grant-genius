
# Fix Manual Report Processing Issues

## Problems Identified

After investigating the database and code, I found three issues with the manual report processing flow:

### Issue 1: Emails Not Being Received (Sender Address)
The database shows emails are being sent with status "sent", but they're using an **unverified sender address** (`noreply@grantgenius.ai`) instead of the verified domain (`grantgenius@disruptorsco.com`). Emails from unverified senders typically get blocked or sent to spam.

**Evidence from database:**
- `MANUAL_SUBMISSION_ADMIN` email logged as "sent" to gavin@disruptorsco.com
- `MANUAL_REPORT_READY` email logged as "sent" to gavin@disruptorsco.com
- But both were sent from `noreply@grantgenius.ai`

### Issue 2: PDF/DOCX Not Generating
The report was created successfully (`is_manual = true`, `content_json` has the HTML), but both `pdf_path` and `docx_path` are NULL. The `complete-manual-report` function tries to generate files but:
1. PDF generation uses a **service role Bearer token** which bypasses user auth, but the `generate-pdf` function checks `user_id` ownership via RLS
2. The admin calling the function isn't the report owner, so RLS blocks the query

### Issue 3: Can't View Report (Viewer Not Handling Manual HTML)
The `HtmlReportViewer` and `extractReportHtml()` check for various formats but don't specifically check for `manual_report_html`. While the `content_json.report_html` path should work, the report HTML content stored for manual reports needs proper formatting to be extracted correctly.

---

## Solution

### 1. Fix Email Sender Address
**Files:** `supabase/functions/submit-manual-request/index.ts`, `supabase/functions/complete-manual-report/index.ts`

Change sender from:
```javascript
sender: { name: "Grant Genius", email: "noreply@grantgenius.ai" }
```
To verified address:
```javascript
sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" }
```

### 2. Fix PDF/DOCX Generation in complete-manual-report
**File:** `supabase/functions/complete-manual-report/index.ts`

The current code calls `generate-pdf` with the admin's auth token, but the PDF function requires the **report owner's** user ID. Two options:

**Option A (Recommended):** Generate PDF/DOCX inline using the service role client, bypassing the separate functions that have RLS checks.

**Option B:** Create a service-role version of the PDF/DOCX generation that doesn't rely on user auth.

I'll implement Option A for reliability - the `complete-manual-report` function will directly call PDFShift API and handle storage upload using the service role.

### 3. Fix Report Viewing for Manual Reports
**File:** `src/lib/htmlReportUtils.ts`

Update `extractReportHtml()` to also check for `manual_report_html` as a top-level field in the content, ensuring manual reports display correctly.

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/submit-manual-request/index.ts` | Fix sender email address |
| `supabase/functions/complete-manual-report/index.ts` | Fix sender email + inline PDF/DOCX generation |
| `src/lib/htmlReportUtils.ts` | Add support for `manual_report_html` field |

---

## Technical Details

### Email Fix
Both edge functions will use `grantgenius@disruptorsco.com` as the sender to ensure emails are delivered from the verified domain.

### PDF Generation Fix
The `complete-manual-report` function will:
1. Build HTML document from the manual report content
2. Call PDFShift API directly with the HTML
3. Upload to storage using service role (bypasses RLS)
4. Update report record with file paths

### DOCX Generation Fix
Similarly, the function will call the docx generation logic directly or skip it for now (since the edge function already has DOCX generation code that failed due to auth issues).

### Viewer Fix
Add a check in `extractReportHtml()`:
```javascript
// Check for manual report HTML at top level
if (content.manual_report_html && typeof content.manual_report_html === "string") {
  return {
    html: content.manual_report_html,
    isLegacy: false,
  };
}
```
