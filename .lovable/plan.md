
# PDF Generation with Admin-Configurable Templates

## Overview

Build a complete PDF generation system where administrators can configure the visual design and branding of generated reports, and researchers can download professionally formatted PDFs.

## What You'll Get

| Component | Description |
|-----------|-------------|
| **PDF Template Settings** | New admin page to configure branding, fonts, colors, and layout |
| **Logo Upload** | Storage bucket for organization logos |
| **Live Preview** | Visual preview of template changes |
| **PDF Generation** | Edge function that converts reports to branded PDFs |
| **Storage for PDFs** | Secure bucket storing generated PDF files |

## Admin PDF Template Settings

### Form Fields

| Field | Type | Description |
|-------|------|-------------|
| **Page Format** | Select | A4, Letter, Legal |
| **Margins** | Number inputs | Top, Right, Bottom, Left (mm) |
| **Logo** | File upload | Organization logo (PNG/JPG/SVG, max 2MB) |
| **Header Text** | Input | Text shown in page headers |
| **Footer Text** | Input | Text shown in page footers (supports {page}, {pages}, {date} variables) |
| **Disclaimer** | Textarea | Legal/compliance text for last page |
| **Primary Color** | Color picker | Brand color for headings, borders, accents |
| **Secondary Color** | Color picker | Secondary accent color |
| **Font Family** | Select | Google Font selection (Open Sans, Roboto, Lato, Inter, etc.) |
| **H1 Size** | Select | Heading 1 size (24px - 36px) |
| **H2 Size** | Select | Heading 2 size (18px - 28px) |
| **H3 Size** | Select | Heading 3 size (14px - 22px) |
| **Body Size** | Select | Body text size (10px - 14px) |
| **Include Cover Page** | Toggle | Show title page with logo and report metadata |
| **Include Table of Contents** | Toggle | Auto-generate TOC from sections |
| **Section Page Breaks** | Toggle | Start each major section on new page |
| **Watermark Text** | Input | Optional diagonal watermark (e.g., "DRAFT") |

## Architecture

```text
Admin configures template
        |
        v
Settings saved to pdf_templates table
        |
        v
User clicks "Download PDF"
        |
        v
Frontend calls generate-pdf edge function
        |
        v
Edge function:
  1. Fetches report content + template settings
  2. Builds branded HTML
  3. Calls PDF API (PDFShift) to convert HTML to PDF
  4. Uploads PDF to reports bucket
  5. Updates report record with pdf_path
  6. Returns signed download URL
        |
        v
Browser downloads the PDF
```

## Database Changes

### New Table: pdf_templates

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Template name (e.g., "Default", "Formal") |
| is_default | boolean | Whether this is the default template |
| page_format | text | A4, Letter, Legal |
| margins_json | jsonb | {top, right, bottom, left} in mm |
| logo_path | text | Storage path to logo file |
| header_text | text | Page header content |
| footer_text | text | Page footer content |
| disclaimer_text | text | Last page disclaimer |
| primary_color | text | Hex color code |
| secondary_color | text | Hex color code |
| font_family | text | Google Font name |
| heading_sizes_json | jsonb | {h1, h2, h3, body} in px |
| include_cover_page | boolean | Show cover page |
| include_toc | boolean | Generate table of contents |
| section_page_breaks | boolean | New page per section |
| watermark_text | text | Optional watermark |
| created_at | timestamptz | Creation time |
| updated_at | timestamptz | Last update time |

### New Storage Buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| pdf-assets | Yes | Logos and template assets |
| reports | No | Generated PDF files (private) |

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/pages/admin/PDFTemplates.tsx` | Admin page for managing PDF templates |
| `src/components/admin/PDFTemplateForm.tsx` | Form component with all template fields |
| `src/components/admin/PDFTemplatePreview.tsx` | Live preview component |
| `src/components/admin/LogoUploader.tsx` | Logo upload component (similar to GuidelinesUploader) |
| `src/components/admin/ColorPicker.tsx` | Color picker input component |
| `supabase/functions/generate-pdf/index.ts` | Edge function to generate PDFs |
| `supabase/migrations/xxx.sql` | Database schema + storage buckets |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add route for `/admin/pdf-templates` |
| `src/components/admin/AdminSidebar.tsx` | Add "PDF Templates" navigation item under new "Reports" section |
| `src/components/workspace/ReportsList.tsx` | Wire up PDF download button to call generate-pdf function |
| `supabase/config.toml` | Add generate-pdf function configuration |

## Implementation Details

### 1. PDF Template Admin Form

The form will be organized into collapsible sections:

- **Page Setup** - Format, margins
- **Branding** - Logo, colors, fonts
- **Typography** - Font sizes for headings and body
- **Header/Footer** - Text content with variable support
- **Layout Options** - Cover page, TOC, section breaks
- **Legal** - Disclaimer text, watermark

### 2. Logo Uploader Component

Similar pattern to existing GuidelinesUploader:
- Drag-and-drop upload
- Preview of uploaded logo
- Validation: PNG/JPG/SVG, max 2MB
- Stores to `pdf-assets` bucket

### 3. Live Preview Component

A scaled-down preview panel showing:
- Sample page with current font and color settings
- Logo placement
- Header/footer rendering
- Heading hierarchy visualization

### 4. PDF Generation Edge Function

The function will:

1. Accept `reportId` and optional `templateId`
2. Fetch report content from database
3. Fetch template settings (or use default)
4. Fetch logo from storage if configured
5. Build complete HTML document with:
   - Embedded Google Font CSS
   - Inline styles using template colors/sizes
   - Cover page (if enabled)
   - Table of contents (if enabled)
   - All report sections with proper formatting
   - Footer/header placeholders
   - Disclaimer page (if content exists)
6. Call PDFShift API to convert HTML to PDF
7. Upload PDF to `reports` bucket
8. Update `reports` record with `pdf_path`
9. Generate signed URL and return

### 5. Google Fonts Integration

Curated list of professional fonts:
- Open Sans
- Roboto
- Lato
- Inter
- Source Sans Pro
- Nunito
- Montserrat
- Merriweather (serif option)
- Playfair Display (serif option)

### 6. Color Picker Component

Using a lightweight approach:
- Input type="color" with hex display
- Preset brand colors as quick-select swatches
- Live preview of color changes

## Secret Requirements

| Secret | Purpose |
|--------|---------|
| `PDFSHIFT_API_KEY` | API key for PDFShift service (or alternative) |

Note: PDFShift offers 250 free PDFs/month which should be sufficient for initial testing. Alternative services include API2PDF, DocRaptor, or CloudConvert.

## Security Considerations

- PDF template management restricted to Admin/Super Admin roles
- Reports bucket has RLS: users can only access their own PDFs
- Logo bucket is public (for embedding in PDFs) but only admins can upload
- Signed URLs for PDF downloads expire after 1 hour
- Template changes logged to audit_logs table

## Phased Rollout

**Phase 1 (This Implementation):**
- Database schema and storage buckets
- Admin PDF Templates page with all form fields
- Logo upload functionality
- Generate-pdf edge function with full HTML templating
- PDF download integration in ReportsList

**Phase 2 (Future):**
- Multiple named templates (e.g., "Formal", "Modern", "Minimal")
- Per-grant template assignment
- DOCX generation using similar approach
- Batch PDF generation for multiple reports

## Technical Notes

### PDF Generation Approach

Using PDFShift API:
```typescript
const response = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
  method: "POST",
  headers: {
    "Authorization": `Basic ${btoa("api:" + PDFSHIFT_API_KEY)}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    source: htmlContent,
    landscape: false,
    format: template.page_format,
    margin: {
      top: `${template.margins.top}mm`,
      right: `${template.margins.right}mm`,
      bottom: `${template.margins.bottom}mm`,
      left: `${template.margins.left}mm`,
    },
    css: "@page { size: A4; }",
    use_print: true,
  }),
});
```

### HTML Template Structure

The generated HTML will include:
- Full DOCTYPE and HTML5 structure
- Google Fonts link in head
- CSS variables for colors and sizes
- Print-specific CSS for page breaks
- Semantic HTML for sections
- MLA-formatted citations

This gives you a fully branded PDF output that matches your organization's visual identity while remaining flexible enough for future template variations.
