

# Use REPORT_READY Template for Manual Reports

## Overview

Currently, the `complete-manual-report` function uses hardcoded email HTML (lines 300-313) instead of the editable REPORT_READY template. This means manual reports don't benefit from the new template system with `{{report_html}}` and `{{report_summary}}` shortcodes.

## Current vs Proposed Flow

| Aspect | Current | Proposed |
|--------|---------|----------|
| Email HTML | Hardcoded in function | Uses REPORT_READY template from database |
| Shortcodes | Not supported | Full support for `{{user_name}}`, `{{grant_name}}`, `{{report_link}}`, `{{report_html}}`, `{{report_summary}}` |
| Subject line | Hardcoded | Editable via admin panel |
| Sender | Hardcoded | Configurable via admin panel |
| Attachments | PDF + DOCX attached | Preserved (no change) |

## Implementation

### Update `complete-manual-report/index.ts`

Replace the hardcoded email section (lines 296-368) with template-aware logic:

```text
Changes:
1. Add the same helper functions from send-report-email:
   - extractExecutiveSummary()
   - sanitizeForEmail()
   - substituteVariables()
   - getFallbackHtml()

2. Fetch REPORT_READY template from database:
   SELECT subject, html_content, sender_name, sender_email, brevo_template_id
   FROM email_templates WHERE template_key = 'REPORT_READY'

3. Build templateVariables with all shortcodes:
   - user_name: userProfile.full_name
   - grant_name: grant.name
   - report_link: full URL to application
   - report_html: sanitized full report content
   - report_summary: sanitized executive summary

4. Apply 3-tier priority:
   Priority 1: Custom html_content from DB (with variable substitution)
   Priority 2: Brevo template ID
   Priority 3: Hardcoded fallback

5. Keep existing attachment logic (PDF + DOCX)

6. Update email_outbox logging to use REPORT_READY template_key
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/complete-manual-report/index.ts` | Add template helpers, fetch template, apply variable substitution, keep attachments |

## Example Result

After implementation, when an admin edits the REPORT_READY template with:
```html
<h1>Hi {{user_name}},</h1>
<p>Your {{grant_name}} report is complete!</p>
{{report_summary}}
<p><a href="{{report_link}}">View Full Report</a></p>
```

Both automated AND manual reports will use this template, ensuring consistent email formatting across all report types.

## Technical Details

### Helper Functions to Add

```typescript
// Extract Executive Summary section from report HTML
function extractExecutiveSummary(html: string): string {
  // Find section between Executive Summary h2 and next h2
}

// Sanitize HTML for email compatibility  
function sanitizeForEmail(html: string): string {
  // Remove <style> and <script> blocks
  // Add inline styles to images
  // Wrap in safe font container
}

// Replace {{variable}} placeholders
function substituteVariables(content: string, variables: Record<string, string>): string {
  // Loop through variables and replace
}

// Legacy fallback template
function getFallbackHtml(userName: string, grantName: string, reportLink: string): string {
  // Return hardcoded HTML template
}
```

### Template Priority Logic

```text
if (template.html_content exists) {
  → Use custom template with variable substitution
  → Apply attachments
}
else if (template.brevo_template_id > 0) {
  → Use Brevo template with params
  → Apply attachments  
}
else {
  → Use hardcoded fallback
  → Apply attachments
}
```

### Key Benefit

Admins can now manage ONE template (REPORT_READY) that works for:
- Automated AI-generated reports
- Manual human-authored reports

Both get the same styling, shortcode support, and consistent branding.

