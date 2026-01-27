
# Add Report Viewing and Download Functionality

## The Problem

Your generated report contains all the research data in `content_json`, but:
- No "View Report" button exists to see the content
- PDF/DOCX files aren't being generated, so download buttons don't appear
- Users have no way to access their completed report

## Solution Overview

We'll implement a two-part solution:

1. **Immediate: "View Report" Button** - Let users view their report content in-app
2. **PDF Generation** - Create downloadable PDF files from the report content

## What You'll See

| Feature | Description |
|---------|-------------|
| "View Report" button | Opens a modal/page showing the full report content |
| Report sections | Market segments, TAM/SAM/SOM, competitors, partners, etc. |
| "Download PDF" button | Generates and downloads a formatted PDF |

## Architecture

```text
User clicks "View Report"
        │
        ▼
Fetch report content_json from database
        │
        ▼
Render formatted report in modal/page
        │
        ▼
User clicks "Download PDF"
        │
        ▼
Edge function generates PDF (using html-to-pdf service)
        │
        ▼
PDF stored in storage bucket → URL saved to pdf_path
        │
        ▼
Browser downloads the PDF
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/workspace/ReportsList.tsx` | Modify | Add "View Report" button for all reports (not just those with files) |
| `src/components/workspace/ReportViewer.tsx` | Create | Modal/dialog component to display formatted report content |
| `src/hooks/useReportGeneration.ts` | Modify | Fetch full report content including `content_json` |
| `supabase/functions/generate-pdf/index.ts` | Create | Edge function to generate PDF from report content |
| `supabase/migrations/xxx.sql` | Create | Create storage bucket for report files |

## Implementation Details

### 1. Update ReportsList to Show View Button

The current code only shows buttons when `pdf_path` or `docx_path` exist. We'll add a "View Report" button that always appears:

```typescript
// Always show View Report button
<Button variant="default" size="sm" onClick={() => onViewReport(report.id)}>
  <Eye className="h-4 w-4 mr-1" />
  View Report
</Button>

// Only show PDF download when file exists
{report.pdf_path && (
  <Button variant="outline" size="sm" onClick={() => onDownload(report.id, "pdf")}>
    <Download className="h-4 w-4 mr-1" />
    PDF
  </Button>
)}
```

### 2. Create ReportViewer Component

A dialog/modal that formats and displays the report sections:

- **Executive Summary** (from research context)
- **Market Segments** (3+ identified segments)
- **Competitive Landscape** (existing products/competitors)
- **TAM/SAM/SOM Analysis** (with tables and calculations)
- **Australian Economic Impact**
- **Potential Partners** (ANZSIC-mapped businesses)
- **Citations & References**

### 3. Fetch Full Report Data

Update the `fetchReports` query to include `content_json`:

```typescript
const { data, error } = await supabase
  .from("reports")
  .select("id, version_number, created_at, pdf_path, docx_path, content_json")
  .eq("application_id", applicationId)
  .order("version_number", { ascending: false });
```

### 4. PDF Generation (Phase 2)

Create an edge function that:
1. Fetches report content from database
2. Generates HTML from the content
3. Uses a PDF service (like PDFShift or html-pdf-edge) to create PDF
4. Stores PDF in Supabase storage bucket
5. Updates report record with the file path

### Storage Setup

Create a private bucket for report files:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false);

-- RLS: Users can only access their own report files
CREATE POLICY "Users can access own reports"
ON storage.objects FOR SELECT
USING (bucket_id = 'reports' AND auth.uid()::text = (storage.foldername(name))[1]);
```

## Recommended Phased Approach

**Phase 1 (Immediate):**
- Add "View Report" button
- Create ReportViewer component to display content_json
- Users can view and copy their report content

**Phase 2 (PDF Generation):**
- Set up storage bucket for report files
- Create PDF generation edge function
- Update report with pdf_path after generation
- Enable actual PDF downloads

This gives you immediate value (users can see their reports) while we build out the PDF functionality.
