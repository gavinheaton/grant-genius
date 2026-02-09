

# Add `{{report_html}}` and `{{report_summary}}` Shortcodes

## Overview

Implement two new email template shortcodes that allow admins to embed report content directly in emails:

| Shortcode | Content | Typical Size |
|-----------|---------|--------------|
| `{{report_html}}` | Full rendered report | 50-80KB |
| `{{report_summary}}` | Executive Summary section only | 2-5KB |

## How It Works

When the `send-report-email` function runs, it will:
1. Fetch the report from the `reports` table using the `reportId`
2. Extract the HTML from `content_json.assembledReport.report_html`
3. For `{{report_summary}}` - extract just the Executive Summary section (H2 heading + content)
4. Sanitize the HTML for email compatibility (inline styles, constrained images)
5. Add both variables to the template substitution

## Implementation

### 1. Update Edge Function (`send-report-email/index.ts`)

Add report fetching and HTML extraction:

```text
Changes:
1. Fetch report: SELECT content_json FROM reports WHERE id = reportId
2. Add extractReportHtml() function (port core logic from htmlReportUtils.ts)
3. Add extractExecutiveSummary() function to get just the summary section
4. Add sanitizeForEmail() function:
   - Remove <style> and <script> tags
   - Add max-width: 100% to images
   - Wrap in container with safe fonts
5. Add to templateVariables:
   - report_html: sanitized full report
   - report_summary: sanitized executive summary
```

### 2. Update Admin UI (`EmailTemplates.tsx`)

Extend the variables list with the new shortcodes:

```text
Variables List:
- {{user_name}} → Recipient's name
- {{grant_name}} → Name of the grant  
- {{report_link}} → URL to view the report
- {{report_summary}} → Executive summary section (recommended for emails)
- {{report_html}} → Full report content (⚠️ Gmail clips >102KB)
```

Also update the preview to show placeholder boxes for report content:
```text
{{report_summary}} → [Executive Summary would appear here]
{{report_html}} → [Full report would appear here - large content]
```

### 3. HTML Extraction Logic

Port simplified extraction from `htmlReportUtils.ts`:

```text
function extractReportHtml(contentJson):
  1. Check for manual_report_html
  2. Check for report_html at root
  3. Check step keys: finalize_report_html, assemble_sections_html
  4. Check assembledReport.report_html
  Return HTML string or empty
  
function extractExecutiveSummary(html):
  1. Find <h2>.*Executive Summary.*</h2> section
  2. Extract content until next <h2> or end
  3. Return the summary HTML
```

### 4. Email Sanitization

Make the report HTML email-client safe:

```text
function sanitizeForEmail(html):
  1. Remove <style>...</style> blocks
  2. Remove <script>...</script> blocks
  3. Add inline styles for images: max-width: 100%; height: auto;
  4. Wrap content in <div style="font-family: sans-serif; line-height: 1.6;">
  5. Return sanitized HTML
```

## Example Email Template

After implementation, admins can create templates like:

**Option A: Summary Only (Recommended)**
```html
<html>
<body>
  <h1>Hi {{user_name}},</h1>
  <p>Your {{grant_name}} report is ready!</p>
  
  <h2>Key Findings Preview</h2>
  {{report_summary}}
  
  <p><a href="{{report_link}}">View Full Report →</a></p>
</body>
</html>
```

**Option B: Full Report**
```html
<html>
<body>
  <h1>Hi {{user_name}},</h1>
  {{report_html}}
  <p><a href="{{report_link}}">View online</a></p>
</body>
</html>
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/send-report-email/index.ts` | Fetch report, extract HTML/summary, sanitize, add variables |
| `src/pages/admin/EmailTemplates.tsx` | Add new variables to list with warnings |

## Considerations

1. **Gmail Size Limit**: Gmail clips emails >102KB. Reports are 50-80KB, so `{{report_html}}` is borderline. `{{report_summary}}` is always safe (~2-5KB).

2. **CSS Compatibility**: Email clients have limited CSS support. The sanitization strips external styles and adds basic inline styling.

3. **Images**: External images (from sources like Google, etc.) will display if they're absolute URLs. Self-hosted images may need adjustment.

4. **Recommendation**: The admin UI will highlight `{{report_summary}}` as the recommended option for emails, with a warning on `{{report_html}}` about size limits.

