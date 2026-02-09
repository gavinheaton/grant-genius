
# Report Export Quality Improvements

## Problem Summary

The PDF and DOCX exports have three key issues:

1. **Duplicate "References" Sections**: The report HTML from the AI pipeline already contains a references section, but the export functions add their own references sections, causing duplication.

2. **PDF Lacks Design/Template Elements**: The current PDF export uses a basic print-to-browser approach rather than the configured PDF template with branding, fonts, colors, and cover page.

3. **Citations/Hyperlinks Break in Exports**: Links are stripped to plain text in DOCX, and citation formatting is inconsistent between formats.

---

## Proposed Solution

### Phase 1: Fix Duplicate References (High Impact, Low Effort)

**Problem**: References appear twice because:
- The AI's `report_html` includes a References section
- Export functions manually append another References section from `all_sources`

**Solution**: Detect if References section already exists in HTML before appending

**Files to modify**:
- `src/components/workspace/ReportsList.tsx` - Remove duplicate references in print PDF
- `src/components/workspace/HtmlReportViewer.tsx` - Conditionally hide sources section if present in HTML
- `supabase/functions/generate-docx/index.ts` - Check for existing references before adding

**Detection logic**:
```typescript
const hasReferencesInHtml = (html: string): boolean => {
  return /<h[12][^>]*>.*(?:References|Citations|Bibliography).*<\/h[12]>/i.test(html);
};

// Only append references if not already in the HTML
if (!hasReferencesInHtml(sanitizedHtml) && sources.length > 0) {
  // Add references section
}
```

---

### Phase 2: Upgrade PDF Generation to Use Templates (Medium Effort)

**Problem**: Current PDF uses browser print with minimal styling, ignoring the admin-configured PDF template settings (fonts, colors, logos, cover page).

**Solution**: Switch from print-to-PDF to using the server-side `generate-pdf` edge function

**Option A: Server-Side PDFShift (Recommended)**
- Modify `generate-pdf/index.ts` to use the actual `report_html` from the AI output instead of building from legacy fields
- Client calls this function and downloads the resulting PDF

**Option B: Client-Side html2canvas**
- Use the existing `generatePdfClient.ts` with proper template integration
- Requires preloading fonts and applying template styles before capture

**Recommended Approach (Option A)**:

1. Update `generate-pdf/index.ts` to:
   - Extract `report_html` from `content_json` using same logic as viewer
   - Inject template CSS (fonts, colors, margins) around the HTML
   - Add cover page with logo and branding
   - Pass to PDFShift for professional conversion

2. Update `ReportsList.tsx` to:
   - Call the server-side function instead of window.print()
   - Download the returned PDF blob

**Files to modify**:
- `supabase/functions/generate-pdf/index.ts` - Major refactor to use report_html
- `src/components/workspace/ReportsList.tsx` - Switch to server-side generation

---

### Phase 3: Fix Hyperlinks in DOCX (Medium Effort)

**Problem**: The `parseInlineFormatting` function in `generate-docx/index.ts` extracts link text but discards the URL, creating plain text instead of clickable links.

**Solution**: Use docx library's `ExternalHyperlink` component for proper link support

**Current Code (broken)**:
```typescript
if (match[4]) {
  // Link [text](url) - just extract text
  runs.push(new TextRun({ text: match[4], size: STYLES.fontSize.body }));
}
```

**Fixed Code**:
```typescript
import { ExternalHyperlink } from "docx";

// In parseInlineFormatting, return a union type:
if (match[4] && match[5]) { // match[5] is the URL
  return new ExternalHyperlink({
    link: match[5],
    children: [
      new TextRun({
        text: match[4],
        style: "Hyperlink",
        size: STYLES.fontSize.body,
      }),
    ],
  });
}
```

**Files to modify**:
- `supabase/functions/generate-docx/index.ts` - Update link parsing logic

---

### Phase 4: Improve Citation Formatting (Low-Medium Effort)

**Problem**: In-text citations like `[1]` may not be properly hyperlinked to the references section.

**Solution**: 
1. For HTML/PDF: Citations should be `<a href="#ref-1">[1]</a>` linking to `<p id="ref-1">...</p>`
2. For DOCX: Use Word's internal bookmark/hyperlink system

This may require updates to the AI prompt to ensure citations are generated with proper anchor tags, or post-processing in the export functions.

---

## Implementation Priority

| Phase | Impact | Effort | Recommendation |
|-------|--------|--------|----------------|
| 1. Fix Duplicate References | High | Low | Do First |
| 2. PDF Template Support | High | Medium | Do Second |
| 3. DOCX Hyperlinks | Medium | Medium | Do Third |
| 4. Citation Anchoring | Medium | Medium | Do Fourth (Optional) |

---

## Technical Details

### Files Requiring Changes

**Frontend (TypeScript/React)**:
- `src/components/workspace/ReportsList.tsx` - PDF generation flow
- `src/components/workspace/HtmlReportViewer.tsx` - Conditional sources display

**Backend (Edge Functions)**:
- `supabase/functions/generate-pdf/index.ts` - Major refactor to use report_html
- `supabase/functions/generate-docx/index.ts` - Fix links, dedupe references

**Shared Utilities**:
- `src/lib/htmlReportUtils.ts` - Add references detection helper

---

## Summary

The core fix involves:
1. Adding detection logic to prevent duplicate references sections
2. Upgrading PDF to use the server-side generator with template support
3. Fixing the DOCX link parser to preserve hyperlinks
4. Ensuring consistent citation formatting across all export formats

This will result in professionally formatted exports that match the admin-configured branding and don't have duplicated content.
