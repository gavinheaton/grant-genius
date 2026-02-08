

# Fix DOCX Generation for Manual Reports

## Problem Identified

The `generate-docx` Edge Function cannot generate DOCX files for manual reports because the `extractAssembledReport` function doesn't handle the `content_json.report_html` field format that manual reports use.

**Current manual report structure:**
```json
{
  "report_html": "<html>...Word document HTML...</html>"
}
```

**What the function expects:**
```json
{
  "assembledReport": {
    "report_html": "...",
    "report_markdown": "..."
  }
}
```

The function checks `content.assembledReport.report_html` but not `content.report_html` at the top level.

---

## Solution

Update the `extractAssembledReport` function in `generate-docx/index.ts` to check for top-level `report_html` field before other patterns. This matches the pattern already implemented in the frontend's `extractReportHtml` function.

---

## Change Details

### File: `supabase/functions/generate-docx/index.ts`

| Location | Change |
|----------|--------|
| `extractAssembledReport` function (around line 147) | Add a new case at the beginning to check for top-level `report_html` field |

**Before (current flow):**
1. Check for `sections` array format
2. Check for `assembledReport.report_html`
3. Check for `assembledReport.report_markdown`

**After (updated flow):**
1. **NEW: Check for top-level `report_html` field (manual reports)**
2. Check for `sections` array format
3. Check for `assembledReport.report_html`
4. Check for `assembledReport.report_markdown`

---

## Code Changes

Add this block at the start of `extractAssembledReport`:

```typescript
// Case 0: Top-level report_html (manual reports)
if (content.report_html && typeof content.report_html === "string") {
  console.log("Detected top-level report_html (manual report format)");
  return {
    title: undefined,
    report_markdown: convertHtmlToSimpleText(content.report_html),
    report_html: content.report_html,
    tables: [],
    all_sources: [],
    data_gaps: [],
  };
}
```

---

## Summary

A single addition to the DOCX generation function to recognize manual reports stored with `report_html` at the content root level, consistent with how the frontend already handles this format.

