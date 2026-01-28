
# Fix DOCX Generation: Handle Nested JSON in report_markdown

## Problem Identified

The Step 11 output stores the `report_markdown` field incorrectly. Instead of containing clean markdown like:

```markdown
## 1. Executive Summary
- Market opportunity is...
```

It contains a JSON code block wrapping the entire report structure:

```
```json
{
  "title": "...",
  "report_markdown": "## 1. Executive Summary...",
  "tables": [...],
  "all_sources": [...]
}
```
```

When the markdown parser encounters this, it sees:
1. Line starting with ` ``` ` → enters code block mode, skips everything
2. Code block ends at closing ` ``` ` 
3. No actual content gets parsed
4. Result: Only cover page + footer appear in DOCX

## Solution

Update the `generate-docx` edge function to:

1. **Detect JSON wrapper** in `report_markdown`
2. **Parse the nested JSON** to extract the actual markdown content
3. **Use the correctly extracted data** for document generation

## Technical Changes

### File: `supabase/functions/generate-docx/index.ts`

Add a function to handle the nested JSON case:

```typescript
// Extract assembled report from potentially nested JSON
function extractAssembledReport(content: ReportContent): AssembledReport | null {
  const assembledReport = content.assembledReport;
  if (!assembledReport) return null;

  // Check if report_markdown contains a JSON code block
  const markdownContent = assembledReport.report_markdown;
  if (!markdownContent) return null;

  // Pattern: ```json\n{...}\n```
  const jsonBlockMatch = markdownContent.match(/^```json?\s*\n([\s\S]*?)\n```\s*$/);
  
  if (jsonBlockMatch) {
    try {
      const nestedJson = JSON.parse(jsonBlockMatch[1]);
      // Merge the nested structure with the outer structure
      return {
        title: nestedJson.title || assembledReport.title,
        report_markdown: nestedJson.report_markdown || "",
        tables: nestedJson.tables || assembledReport.tables || [],
        all_sources: nestedJson.all_sources || assembledReport.all_sources || [],
        data_gaps: nestedJson.data_gaps || assembledReport.data_gaps || [],
      };
    } catch (e) {
      console.error("Failed to parse nested JSON in report_markdown:", e);
      // Fall back to original structure
      return assembledReport;
    }
  }

  // No nested JSON, use as-is
  return assembledReport;
}
```

Then update the main handler to use this extraction:

```typescript
// Replace this:
const content = (report.content_json || {}) as ReportContent;
const assembledReport = content.assembledReport;

// With this:
const content = (report.content_json || {}) as ReportContent;
const assembledReport = extractAssembledReport(content);
```

## Expected Outcome

After this fix:

1. The edge function will detect the ` ```json ``` ` wrapper
2. Parse the nested JSON to extract the real `report_markdown` (the actual markdown content starting with `# Commercialisation Assessment...`)
3. Also extract `tables` and `all_sources` from the nested structure
4. Generate a complete DOCX with all 11 sections, tables, and references

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-docx/index.ts` | Add `extractAssembledReport()` function and update main handler |

## Additional Logging

Add diagnostic logging to help troubleshoot future issues:

```typescript
console.log("Raw report_markdown length:", assembledReport.report_markdown.length);
console.log("report_markdown starts with:", assembledReport.report_markdown.substring(0, 100));
console.log("Extracted sections count:", sections.length);
console.log("Tables count:", tables.length);
console.log("Sources count:", sources.length);
```

## Long-term Fix (Separate Task)

The root cause is that Step 11 is outputting the wrong format. Ideally, `content_json.assembledReport` should already contain:
- `report_markdown` as clean markdown text
- `tables` as a proper array
- `all_sources` as a proper array

This should be fixed at the Step 11 prompt/processing level to avoid this workaround. However, the edge function fix handles the current data gracefully.

## Testing

After deployment:
1. Download DOCX for the existing report
2. Verify all 11 sections appear
3. Verify tables are rendered (Table 1: Partners, Table 2: SOM Breakdown)
4. Verify References section appears with all sources
