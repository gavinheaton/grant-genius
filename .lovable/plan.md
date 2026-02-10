

## Hide Reports Under Review from Researchers

### Problem
When a report enters the review workflow (`review_status = 'pending_review'` or `'in_review'`), the researcher can still see and download it via the Reports List. The "In Review" status card is shown, but the report itself remains visible and accessible below it.

### Solution
Filter out reports that are under review so researchers only see approved or non-reviewed reports. Two changes are needed:

### 1. Update the reports query to include `review_status`

In `src/hooks/useReportGeneration.ts`, add `review_status` to the `Report` interface and the SELECT query so the frontend knows which reports are in review.

### 2. Filter reports in `ApplicationWorkspace.tsx`

Before passing reports to `<ReportsList>`, filter out any report where `review_status` is `'pending_review'` or `'in_review'`. This means:
- Reports under review are completely hidden from the user (no View, no PDF, no DOCX download)
- The "Report Under Review" status card continues to display as it already does
- Once an admin approves the final review step (setting `review_status = 'approved'`), the report becomes visible automatically

### Technical Details

**File: `src/hooks/useReportGeneration.ts`**
- Add `review_status` to the `Report` interface (as `string | null`)
- Add `review_status` to the `.select()` call on line 108

**File: `src/pages/ApplicationWorkspace.tsx`**
- Create a filtered list: `const visibleReports = reports.filter(r => !r.review_status || r.review_status === 'approved')`
- Pass `visibleReports` to `<ReportsList>` instead of `reports`
- Keep using the unfiltered `reports` array for the "In Review" status card check (so the card still appears)

