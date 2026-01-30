# Simplify Report Output: HTML-First Approach

## Status: ✅ Implemented

## Changes Made

### 1. AI Prompts (Steps 12-14) - Updated
- **Step 12**: Now outputs `report_html` with semantic HTML instead of markdown
- **Step 13**: Outputs HTML tables with inline styles
- **Step 14**: Merges everything into final HTML structure

### 2. New Components Created
- `src/lib/htmlReportUtils.ts` - HTML sanitization with DOMPurify, extraction utilities
- `src/components/workspace/HtmlReportViewer.tsx` - New HTML-based report viewer

### 3. Updated Components
- `src/components/workspace/ReportsList.tsx` - Uses new HTML viewer, print-based PDF

### 4. Edge Functions Updated
- `supabase/functions/resume-report-run/index.ts` - HTML output prompts
- `supabase/functions/generate-docx/index.ts` - Handles both HTML and legacy markdown

## New Data Flow
```
AI Step 14 → report_html → sanitize with DOMPurify → render in-app
                        → window.print() for PDF (Save as PDF)
                        → convert to text for DOCX
```

## Backward Compatibility
- Legacy reports with `report_markdown` are still supported
- `htmlReportUtils.ts` includes markdown-to-HTML conversion for old reports
