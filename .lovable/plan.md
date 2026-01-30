
# Fix Report Viewer and PDF Renderer for New Content Structure

## Problem Analysis
The report generation now produces content in a new structure:
```json
{
  "assembledReport": {
    "report_markdown": "# Full markdown report...",
    "tables": [...],
    "all_sources": [...],
    "data_gaps": [...]
  },
  "sourcePack": {...},
  ...other checkpoint data...
}
```

But the `ReportViewer` and `PdfReportRenderer` components expect the old structure:
```json
{
  "researchContext": "...",
  "marketSegments": [...],
  "tam": {...},
  ...
}
```

This causes the report to display raw JSON/markdown instead of rendered content.

## Solution
Update both viewer components to detect and handle the new `assembledReport` structure:

1. **Check for `assembledReport.report_markdown`** - if present, use the unified markdown format
2. **Render markdown as formatted content** - parse and display sections from the markdown
3. **Display tables from `assembledReport.tables`** - use the structured tables array
4. **Show sources from `assembledReport.all_sources`** - use the MLA-formatted citations
5. **Fall back to old structure** - for backward compatibility with existing reports

## Technical Changes

### 1. ReportViewer.tsx
Add detection for the new structure and a markdown-based rendering path:

```typescript
// Detect new unified format
const hasAssembledReport = content.assembledReport?.report_markdown;

if (hasAssembledReport) {
  // Render the unified markdown report
  return <MarkdownReportView assembledReport={content.assembledReport} />;
}

// Fall back to structured field rendering for old reports
return <StructuredReportView content={content} />;
```

### 2. PdfReportRenderer.tsx
Similar update to handle the `assembledReport.report_markdown` format:

```typescript
// Extract from assembledReport if present
const assembledReport = content.assembledReport;
if (assembledReport?.report_markdown) {
  // Parse markdown into sections for PDF
  sections = parseMarkdownSections(assembledReport.report_markdown);
}
```

### 3. New Helper Function
Add a utility to parse markdown sections:

```typescript
function parseMarkdownSections(markdown: string): ReportSection[] {
  // Split by ## headings
  // Extract title, content pairs
  // Handle tables within sections
}
```

## Files to Modify
1. `src/components/workspace/ReportViewer.tsx` - Add detection and rendering for new format
2. `src/components/workspace/PdfReportRenderer.tsx` - Add parsing for assembledReport
3. `src/lib/markdownUtils.ts` - Add section parsing utility

## Backward Compatibility
- Old reports with structured fields (researchContext, marketSegments, etc.) continue to work
- New reports with `assembledReport.report_markdown` use the new rendering path
- Both formats produce properly formatted output

## Testing
After implementation:
1. View the latest report to verify it renders correctly
2. Export to PDF to verify the document structure
3. Test an older report (if available) to verify backward compatibility
