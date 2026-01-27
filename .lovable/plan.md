
# PDF Generation: Switching from PDFShift to Client-Side Generation

## Current Problem

PDFShift continues to fail with `"The requested page took too long to load."` (400 error) despite multiple fixes:
- Removed Google Fonts (use web-safe fallbacks)
- Added `sandbox: true`
- Added `wait_for_network: false`, `disable_javascript: true`, `ignore_long_polling: true`, `timeout: 20`

The error persists with an HTML payload of ~75KB, no external resources, and no JavaScript. This suggests PDFShift's rendering engine has internal issues we cannot control.

## Recommended Solution: Client-Side PDF Generation

Instead of relying on an external API that's proving unreliable, generate PDFs directly in the browser using **jsPDF** with the **html2canvas** library. This approach:

- **Eliminates API dependency** - No external service means no network timeouts or API failures
- **Faster for users** - No round-trip to edge function, then to PDFShift, then back
- **Cost-effective** - No per-PDF API charges
- **Works offline** - Can generate PDFs without internet after page loads

### Alternative: DocRaptor (if client-side quality is insufficient)

DocRaptor uses Prince XML engine with 99.99% uptime guarantee. It's more expensive but extremely reliable. This would be a fallback if client-side rendering quality doesn't meet requirements.

## Implementation Plan

### Step 1: Add Client-Side PDF Dependencies

Install jsPDF and html2canvas:
- `jspdf` - PDF document creation
- `html2canvas` - Capture HTML as canvas image

### Step 2: Create PDF Generation Utility

Create a new utility `src/lib/generatePdfClient.ts` that:
1. Renders the report content to a hidden div with proper styling
2. Uses html2canvas to capture the rendered content
3. Creates a jsPDF document with proper page sizing (A4)
4. Handles multi-page content automatically
5. Returns a downloadable blob

### Step 3: Create PDF Preview Component

Create `src/components/workspace/PdfReportRenderer.tsx`:
- Renders report content with print-optimized CSS
- Mirrors the branding from `pdf_templates` (colors, fonts, margins)
- Hidden from view but available for html2canvas capture

### Step 4: Update ReportsList to Use Client-Side Generation

Modify `src/components/workspace/ReportsList.tsx`:
- Replace edge function call with client-side generation
- Show loading state during PDF creation
- Handle errors gracefully

### Step 5: Optional - Keep Edge Function as Fallback

Keep the `generate-pdf` edge function but switch to DocRaptor API if high-fidelity PDFs are needed later.

## Files to Create/Modify

| File | Action |
|------|--------|
| `package.json` | Add `jspdf` and `html2canvas` dependencies |
| `src/lib/generatePdfClient.ts` | NEW - Client-side PDF generation utility |
| `src/components/workspace/PdfReportRenderer.tsx` | NEW - Hidden report renderer for PDF capture |
| `src/components/workspace/ReportsList.tsx` | Modify - Use client-side generation instead of edge function |

## Technical Details

### generatePdfClient.ts

```text
Purpose: Generate PDF from rendered HTML content

Functions:
- generatePdf(reportContent, template, grantName): Promise<Blob>
  - Creates hidden container with report HTML
  - Applies template styling (colors, fonts, margins)
  - Captures with html2canvas at high DPI (2x scale)
  - Creates jsPDF document with proper pagination
  - Returns PDF blob for download

- downloadPdf(blob, filename): void
  - Creates temporary link and triggers download
```

### PdfReportRenderer.tsx

```text
Purpose: Render report content with print-optimized styling

Props:
- report: Report data with content_json
- template: PDF template settings
- grantName: string
- ref: ForwardRef for html2canvas capture

Features:
- Cover page (if template.include_cover_page)
- Table of contents (if template.include_toc)
- Sections with proper headings
- Citations/references section
- Disclaimer section
- Print-optimized CSS (page breaks, margins)
```

### Multi-Page Handling

```text
Strategy for handling content longer than one page:
1. Render full content to canvas
2. Slice canvas into page-sized chunks
3. Add each chunk as separate PDF page
4. Maintain proper margins between pages
```

## Trade-offs

### Pros of Client-Side Generation
- No API costs or rate limits
- No network timeout issues
- Faster generation (no server round-trip)
- Works even if edge functions are down

### Cons of Client-Side Generation
- PDF quality depends on browser rendering (rasterized, not vector)
- Larger JavaScript bundle (~150KB for jsPDF + html2canvas)
- Text in PDF is not selectable (it's an image)

### Quality Mitigation
- Use high DPI capture (2x or 3x scale) for crisp output
- Consider adding jsPDF's html() method for hybrid approach where possible

## Future Enhancement: Hybrid Approach

If text selectability is required:
1. Use jsPDF's `html()` method for basic content
2. Fall back to html2canvas only for complex layouts
3. Or switch to DocRaptor for production-quality vector PDFs

## Summary

This plan replaces the unreliable PDFShift API with client-side PDF generation using jsPDF and html2canvas. The solution eliminates external dependencies that have proven problematic and provides a faster, more reliable PDF generation experience for users.
