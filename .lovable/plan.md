
# PDF Report Design Enhancement Plan

## Current State Analysis

The PDF templating system exists but has several issues preventing it from working properly:

| Component | Status | Issue |
|-----------|--------|-------|
| Template Admin UI | Working | Can configure settings |
| Color/Font Settings | Stored but not applied | Font not loaded, logo URL broken |
| Page Breaks | Not working | html2canvas ignores CSS page-break |
| Cover Page | Hardcoded | No designer interface |
| Custom Palettes | Missing | Only one template, no save/load |
| Branding | Missing | No "Grant Genius" or "Powered by" on reports |

## Solution Overview

### 1. Fix Template Application Issues

**Problem**: The template settings are stored but not properly applied to the PDF output.

**Fixes needed**:
- **Logo URL**: Convert `logo_path` (filename) to full public URL in `PdfReportRenderer`
- **Google Fonts**: Load the selected font before html2canvas capture
- **Colors**: Already working, but need to ensure they propagate to all elements

**Files to modify**:
- `src/components/workspace/PdfReportRenderer.tsx`
- `src/components/workspace/ReportsList.tsx` (add font preloading)

### 2. Implement Proper Page Breaks

**Problem**: CSS `page-break-before: always` doesn't work with html2canvas because it captures the entire HTML as a single image then slices it at arbitrary pixel boundaries.

**Solution**: Restructure the PDF generation to render each major section as a separate page element, then slice at section boundaries:

1. Add `data-page-break` attributes to section divs in `PdfReportRenderer`
2. Modify `generatePdfFromElement` to:
   - Find all elements with `data-page-break="true"`
   - Calculate their Y positions
   - Slice the canvas at those positions instead of at fixed pixel intervals
3. When `section_page_breaks` is enabled, each section starts on a new page

**Files to modify**:
- `src/components/workspace/PdfReportRenderer.tsx`
- `src/lib/generatePdfClient.ts`

### 3. Custom Color Palette System

**Problem**: Users can only modify the default template, no way to save/switch palettes.

**Solution**: 
1. Add a `color_palettes` table to store reusable palettes
2. Add a "Save Palette" button in the PDF Template form
3. Add a palette selector dropdown to quickly apply saved palettes
4. Include preset palettes (Professional Navy, Modern Green, Academic Burgundy, etc.)

**Database changes**:
```sql
CREATE TABLE color_palettes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  secondary_color TEXT NOT NULL,
  is_preset BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Files to create/modify**:
- New migration for `color_palettes` table
- `src/hooks/useColorPalettes.ts` - CRUD hooks for palettes
- `src/components/admin/ColorPicker.tsx` - Add palette selector
- `src/components/admin/PDFTemplateForm.tsx` - Add palette dropdown and save button

### 4. Cover Page Designer

**Problem**: Cover page layout is hardcoded - users can't customize it.

**Solution**: Add a cover page design section to the PDF Template admin with:
- Logo position (top/center/left/right)
- Title text override (default: "Commercialisation Research Report")
- Subtitle template (can include {grant_name}, {date}, {version})
- Background color/gradient option
- Optional hero banner image

**Add new columns to `pdf_templates`**:
```sql
ALTER TABLE pdf_templates ADD COLUMN cover_layout_json JSONB DEFAULT '{
  "logo_position": "center",
  "title_text": "Commercialisation Research Report",
  "subtitle_template": "{grant_name}",
  "show_date": true,
  "show_version": true,
  "background_style": "solid"
}'::jsonb;
```

**Files to modify**:
- New migration for cover_layout_json
- `src/components/admin/PDFTemplateForm.tsx` - Add cover page design section
- `src/components/admin/PDFTemplatePreview.tsx` - Update preview to show cover design
- `src/components/workspace/PdfReportRenderer.tsx` - Use cover layout settings

### 5. Add Report Branding

**Problem**: No branding on generated reports.

**Solution**: Add "Grant Genius" branding and "Powered by Disruptors Co" footer:
- Header: Optional organization logo (from template) + "Grant Genius" branding
- Footer: Page numbers + "Powered by Disruptors Co" or custom footer text
- Option to hide/show Grant Genius branding (for white-label)

**Add columns to `pdf_templates`**:
```sql
ALTER TABLE pdf_templates ADD COLUMN show_grant_genius_branding BOOLEAN DEFAULT true;
ALTER TABLE pdf_templates ADD COLUMN powered_by_text TEXT DEFAULT 'Powered by Disruptors Co';
```

**Files to modify**:
- New migration
- `src/components/workspace/PdfReportRenderer.tsx` - Add branding elements
- `src/components/admin/PDFTemplateForm.tsx` - Add branding toggles
- `src/lib/generatePdfClient.ts` - Add branding to footer

## Implementation Order

**Phase 1: Fix What's Broken** (Critical)
1. Fix logo URL resolution in PdfReportRenderer
2. Implement Google Font preloading
3. Fix page breaks with smart slicing algorithm

**Phase 2: Branding** 
4. Add Grant Genius branding to reports
5. Add "Powered by Disruptors Co" to footer

**Phase 3: Enhancements**
6. Custom color palette system
7. Cover page designer

## Technical Details

### Page Break Algorithm

```text
Current (broken):
┌─────────────────────┐
│ Cover Page          │
│ TOC                 │  <- html2canvas captures
│ Section 1           │     entire element
│ Section 2           │
│ Section 3           │
└─────────────────────┘
        ↓
    Fixed pixel slicing (ignores section boundaries)
        ↓
   Sections get cut in half

Proposed (fixed):
┌─────────────────────┐
│ [data-page-break]   │
│ Cover Page          │
├─────────────────────┤ <- Slice point
│ [data-page-break]   │
│ TOC                 │
├─────────────────────┤ <- Slice point  
│ [data-page-break]   │
│ Section 1           │
├─────────────────────┤ <- Slice point
│ Section 2           │
└─────────────────────┘
        ↓
    Slice at data-page-break positions
        ↓
   Each section starts on new page
```

### Font Preloading

```typescript
// Before generating PDF, load the Google Font
async function preloadGoogleFont(fontFamily: string): Promise<void> {
  const link = document.createElement('link');
  link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(' ', '+')}:wght@400;600;700&display=swap`;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
  
  // Wait for font to load
  await document.fonts.ready;
}
```

### Logo URL Resolution

```typescript
// In PdfReportRenderer
const logoUrl = template.logo_path
  ? supabase.storage.from('pdf-assets').getPublicUrl(template.logo_path).data.publicUrl
  : null;
```

## Summary of Changes

| File | Changes |
|------|---------|
| `src/components/workspace/PdfReportRenderer.tsx` | Fix logo URL, add data-page-break attributes, add branding |
| `src/lib/generatePdfClient.ts` | Smart page break slicing, font preloading, footer branding |
| `src/components/workspace/ReportsList.tsx` | Call font preload before PDF generation |
| `src/components/admin/PDFTemplateForm.tsx` | Add cover designer section, palette selector, branding toggles |
| `src/hooks/useColorPalettes.ts` | New hook for palette CRUD |
| `src/hooks/usePdfTemplates.ts` | Add new template fields |
| Database migration | Add color_palettes table, cover_layout_json, branding columns |

This plan addresses all the issues: fonts/colors not applying, page breaks not working, missing custom palettes, no cover page designer, and missing branding.
