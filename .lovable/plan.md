
# Fix Report Viewer for Sections-Based Content Format

## Problem Identified
The "View" button shows nothing because there's a **format mismatch** between how the Replit worker saves reports and what the frontend viewer expects.

### What the Worker Saves
```json
{
  "sections": [
    { "title": "build_source_pack", "content": "```json\n{sources...}```" },
    { "title": "extract_context", "content": "..." },
    { "title": "assemble_sections", "content": "<html content>" },
    ...
  ]
}
```

### What the Viewer Expects
```json
{
  "assembledReport": {
    "report_html": "<h1>Report content...</h1>",
    "tables": [...],
    "all_sources": [...],
    "data_gaps": [...]
  }
}
```

## Solution: Update Frontend to Handle Both Formats

Modify `src/lib/htmlReportUtils.ts` to add a fallback that extracts content from the `sections` array format. This ensures backward compatibility with both formats.

### Changes to `extractReportHtml()`

Add a third case to handle the sections-based format:

```text
1. Try new HTML format: content.assembledReport.report_html ✓
2. Try legacy markdown format: content.assembledReport.report_markdown ✓  
3. NEW: Try sections format: find the "assemble_sections" or "finalize_report" 
   section and extract its HTML/markdown content
```

### Implementation Details

1. **Search for final assembly sections** - Look in the `sections` array for entries with titles like:
   - `assemble_sections`
   - `build_tables_sources`
   - `finalize_report`

2. **Extract HTML or markdown** - The content in these sections may be:
   - Raw HTML (preferred)
   - Markdown that needs conversion
   - JSON-wrapped content that needs parsing

3. **Extract sources separately** - Look for `build_source_pack` section to populate the references list

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/htmlReportUtils.ts` | Add sections format handler to `extractReportHtml()` |

### Code Logic (Pseudocode)

```typescript
// After existing checks for assembledReport...

// Case 3: Sections array format (from Replit worker)
if (content.sections && Array.isArray(content.sections)) {
  // Find the final assembled content
  const assemblySection = content.sections.find(s => 
    s.title === 'finalize_report' || 
    s.title === 'assemble_sections' ||
    s.title === 'build_tables_sources'
  );
  
  if (assemblySection?.content) {
    // Extract HTML from the section content
    const html = extractHtmlFromSectionContent(assemblySection.content);
    
    // Extract sources from build_source_pack if present
    const sourceSection = content.sections.find(s => 
      s.title === 'build_source_pack'
    );
    const sources = extractSourcesFromSection(sourceSection?.content);
    
    return {
      html: html || convertMarkdownToHtml(assemblySection.content),
      sources,
      dataGaps: [],
      isLegacy: true,
    };
  }
}
```

## Benefits

- Reports from Replit worker will display immediately
- Backward compatible with existing report formats
- No changes needed to the Replit worker
- Graceful degradation if some sections are missing

## Future Improvement

Once this is working, we should also update the Replit worker to save in the correct `assembledReport` format for optimal rendering with tables and structured data.
