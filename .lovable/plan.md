
# Fix Report Viewer and DOCX Generator for Nested JSON

## Problem Identified
The `assembledReport.report_markdown` field contains **nested JSON** instead of raw markdown. There are two variants:

| Report Type | `report_markdown` starts with | Currently Handled? |
|-------------|------------------------------|-------------------|
| Latest | `{ "report_markdown": ...` | Not handled |
| Older | ` ```json { ... ` | DOCX handles, viewer doesn't |

Both the **ReportViewer** and **DOCX generator** need to extract the actual markdown from this nested structure.

## Solution

### 1. Update `src/lib/markdownUtils.ts`
Add a shared extraction utility that handles both patterns:

```typescript
export function extractNestedReportMarkdown(markdownContent: string | unknown): {
  report_markdown: string;
  tables?: unknown[];
  all_sources?: unknown[];
  data_gaps?: unknown[];
} | null {
  // Case 1: Already a plain string starting with #
  if (typeof markdownContent === 'string' && markdownContent.trim().startsWith('#')) {
    return { report_markdown: markdownContent };
  }

  // Case 2: String that's actually JSON (starts with {)
  if (typeof markdownContent === 'string' && markdownContent.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(markdownContent);
      return parsed;
    } catch (e) {
      return null;
    }
  }

  // Case 3: Code-fenced JSON (```json ... ```)
  if (typeof markdownContent === 'string') {
    const match = markdownContent.match(/^```json?\s*\n([\s\S]*?)\n```\s*$/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (e) {
        return null;
      }
    }
  }

  // Case 4: Object passed directly
  if (typeof markdownContent === 'object' && markdownContent !== null) {
    return markdownContent as any;
  }

  return null;
}
```

### 2. Update `src/components/workspace/ReportViewer.tsx`
Add extraction logic before rendering:

```typescript
import { extractNestedReportMarkdown } from "@/lib/markdownUtils";

// Inside component, after getting content
function extractAssembledReport(content: ReportContent): AssembledReport | null {
  const assembledReport = content.assembledReport;
  if (!assembledReport?.report_markdown) return null;

  const extracted = extractNestedReportMarkdown(assembledReport.report_markdown);
  if (!extracted || !extracted.report_markdown) return null;

  return {
    report_markdown: extracted.report_markdown,
    tables: extracted.tables || assembledReport.tables || [],
    all_sources: extracted.all_sources || assembledReport.all_sources || [],
    data_gaps: extracted.data_gaps || assembledReport.data_gaps || [],
  };
}

// Then use extractedReport instead of content.assembledReport
const extractedReport = extractAssembledReport(content);
const hasAssembledReport = Boolean(extractedReport?.report_markdown);
```

### 3. Update `supabase/functions/generate-docx/index.ts`
Update the existing `extractAssembledReport` function to also handle raw JSON:

```typescript
function extractAssembledReport(content: ReportContent): AssembledReport | null {
  const assembledReport = content.assembledReport;
  if (!assembledReport) return null;

  const markdownContent = assembledReport.report_markdown;
  if (!markdownContent) return null;

  // Pattern 1: Code-fenced JSON (```json\n{...}\n```)
  const jsonBlockMatch = markdownContent.match(/^```json?\s*\n([\s\S]*?)\n```\s*$/);
  if (jsonBlockMatch) {
    try {
      const nestedJson = JSON.parse(jsonBlockMatch[1]);
      return mergeWithNested(assembledReport, nestedJson);
    } catch (e) { /* fall through */ }
  }

  // Pattern 2: Raw JSON object (starts with {)
  if (markdownContent.trim().startsWith('{')) {
    try {
      const nestedJson = JSON.parse(markdownContent);
      return mergeWithNested(assembledReport, nestedJson);
    } catch (e) { /* fall through */ }
  }

  // No nested JSON, use as-is
  return assembledReport;
}

function mergeWithNested(original: AssembledReport, nested: any): AssembledReport {
  return {
    title: nested.title || original.title,
    report_markdown: nested.report_markdown || "",
    tables: nested.tables || original.tables || [],
    all_sources: nested.all_sources || original.all_sources || [],
    data_gaps: nested.data_gaps || original.data_gaps || [],
  };
}
```

### 4. Update `src/components/workspace/PdfReportRenderer.tsx`
Apply the same extraction logic for PDF exports.

## Files to Modify
1. `src/lib/markdownUtils.ts` - Add extraction utility
2. `src/components/workspace/ReportViewer.tsx` - Use extraction before rendering
3. `src/components/workspace/PdfReportRenderer.tsx` - Use extraction for PDF
4. `supabase/functions/generate-docx/index.ts` - Handle raw JSON case

## Technical Details
- Both patterns (code-fenced and raw JSON) will be supported
- Existing reports with either format will render correctly
- No regeneration of reports required
- The DOCX edge function will need redeployment after the fix

## Testing
After implementation:
1. View the latest report (raw JSON format) - should show formatted sections
2. View an older report (code-fenced format) - should still work
3. Export latest report to DOCX - should show content, not JSON
4. Export to PDF - should render correctly
