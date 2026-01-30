

# Fix Report Viewer to Handle `report_markdown` in JSON Content

## Root Cause Identified

The report data **is** being received from Replit - the `finalize_report` section contains valid content. However, the extraction fails because:

1. The `finalize_report` content is JSON wrapped in markdown code fences
2. Inside the JSON, the report is stored as `report_markdown`, not `report_html`
3. Our `extractHtmlFromSectionContent()` function only checks for `report_html` and `html` keys - it ignores `report_markdown`

### Current Code (Lines 72-77)
```typescript
if (parsed.report_html && typeof parsed.report_html === "string") {
  return parsed.report_html;
}
if (parsed.html && typeof parsed.html === "string") {
  return parsed.html;
}
// Falls through and tries to convert the ENTIRE JSON as markdown (fails)
```

### What the Data Looks Like
```json
{
  "title": "Commercialisation Potential of Novel Cancer Diagnostic Technology",
  "report_markdown": "# Commercialisation Potential of Novel Cancer..."
}
```

## Solution

Update `extractHtmlFromSectionContent()` to also check for `report_markdown` and convert it to HTML.

### File to Modify
`src/lib/htmlReportUtils.ts`

### Changes Required

In the JSON parsing section (around lines 71-80), add a check for `report_markdown`:

```typescript
if (parsed.report_html && typeof parsed.report_html === "string") {
  return parsed.report_html;
}
if (parsed.html && typeof parsed.html === "string") {
  return parsed.html;
}
// NEW: Handle report_markdown - convert to HTML
if (parsed.report_markdown && typeof parsed.report_markdown === "string") {
  return convertMarkdownToHtml(parsed.report_markdown);
}
```

## Summary

| Issue | Fix |
|-------|-----|
| `report_markdown` key not checked | Add fallback to extract and convert markdown to HTML |

This is a one-line fix that will make existing reports display correctly.

