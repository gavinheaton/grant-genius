

# Simplify Report Output: Replace PDF/DOCX with HTML

## Problem Analysis

The current PDF and DOCX generation system has multiple failure points:

1. **Nested JSON Problem**: The AI outputs `report_markdown` as a JSON string containing another JSON object, requiring fragile parsing
2. **Multiple Extraction Layers**: Both client-side (PDF) and server-side (DOCX) have separate extraction logic that can fail independently
3. **Complex Dependencies**: PDF uses html2canvas + jsPDF (client-side), DOCX uses a Deno edge function with docx library

### Current Data Flow (Problematic)
```text
AI Step 14 Output
       |
       v
content_json.assembledReport.report_markdown = '{"report_markdown": "# Heading...", "section_metadata": {...}}'
       |
       +---> extractNestedReportMarkdown() [client-side for PDF]
       |         |
       |         v
       |    Parse nested JSON -> Plain markdown -> HTML -> html2canvas -> jsPDF
       |
       +---> extractAssembledReport() [edge function for DOCX]
                 |
                 v
            Parse nested JSON -> Plain markdown -> docx library -> DOCX blob
```

## Proposed Solution

Switch to a simpler HTML-first approach:

1. **Store HTML directly** in the report instead of markdown
2. **Render HTML in-app** using sanitized dangerouslySetInnerHTML
3. **Print to PDF** using browser's native print-to-PDF or a simple HTML-to-PDF approach
4. **Optionally keep DOCX** but simplify by converting from HTML

### Simplified Data Flow
```text
AI Step 14 Output
       |
       v
content_json.assembledReport.report_html = '<h1>Heading</h1><p>Content...</p>'
       |
       +---> View in-app: dangerouslySetInnerHTML with DOMPurify
       |
       +---> PDF: window.print() or html2pdf library
       |
       +---> DOCX (optional): html-to-docx conversion
```

## Implementation Steps

### Phase 1: Update Report Generation (AI Prompt Changes)
- Modify Step 12/14 prompts to output clean HTML instead of markdown
- Structure: `report_html` field with semantic HTML (h1, h2, p, ul, li, table)
- Include inline styles for portability

### Phase 2: Simplify Viewer Components
- Update `ReportViewer.tsx` to render HTML directly
- Update `PdfReportRenderer.tsx` to use the HTML as-is
- Remove `extractNestedReportMarkdown` complexity

### Phase 3: Simplify Export
- **PDF**: Use CSS print styles + `window.print()` or html2pdf.js
- **DOCX**: Either remove (users print to PDF then convert) or use simplified html-docx-js

### Phase 4: Clean Up
- Remove fragile JSON extraction utilities
- Simplify edge functions
- Update tests

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/generate-report/index.ts` | Update Step 12-14 prompts to output HTML |
| `src/components/workspace/ReportViewer.tsx` | Render HTML directly |
| `src/components/workspace/PdfReportRenderer.tsx` | Use HTML content directly |
| `src/lib/generatePdfClient.ts` | Simplify to use HTML content |
| `src/lib/markdownUtils.ts` | Can be removed or greatly simplified |
| `supabase/functions/generate-docx/index.ts` | Convert from HTML or deprecate |

## Alternative: Quick Fix (If Full Rewrite is Too Large)

Instead of switching to HTML, we could:
1. Fix the Step 14 prompt to output **plain markdown** (not nested JSON)
2. Simplify extraction to expect consistent format
3. Keep existing PDF/DOCX logic

This is faster but doesn't address the fundamental fragility.

## Recommendation

**Go with the HTML approach** because:
- Browser-native PDF printing is more reliable than html2canvas
- HTML is more portable than markdown
- Removes multiple layers of format conversion
- Easier to style and brand

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| AI outputs malformed HTML | Use DOMPurify for sanitization |
| Styling inconsistency | Use inline CSS + CSS reset |
| DOCX users lose functionality | Provide PDF as primary, DOCX as "copy to Word" option |
| Migration of existing reports | Keep backward compatibility for legacy markdown format |

## Technical Notes

### Recommended Libraries
- **DOMPurify**: Sanitize HTML before rendering
- **html2pdf.js**: Clean HTML-to-PDF conversion (alternative to current approach)
- **print-js**: For print-to-PDF functionality

### CSS Print Styles
```css
@media print {
  .no-print { display: none; }
  body { font-size: 12pt; }
  h1 { page-break-after: avoid; }
  table { page-break-inside: avoid; }
}
```

