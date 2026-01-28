
# DOCX Template-Based Report Generation Plan

## Overview

Replace the current html2canvas → PDF approach with a DOCX template-based system where:
1. Admin uploads a professionally designed DOCX template
2. The template uses placeholder tags (e.g., `{grant_name}`, `{research_context}`)
3. Server-side edge function fills the template with report data using **docxtemplater**
4. Users can download a high-quality DOCX that preserves the original template's fonts, styles, and layout

## Why This Is Better

| Current Approach | DOCX Template Approach |
|-----------------|------------------------|
| html2canvas captures HTML → pixelated images | Native Word formatting → crisp text |
| Fonts must be preloaded, often fail | Template fonts embedded in DOCX |
| Page breaks are complex workarounds | Word handles page breaks natively |
| Users can't edit the output easily | Users can edit in Word/Google Docs |
| No professional formatting control | Full control via Word template design |

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        DOCX Template Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. Admin uploads template.docx                                 │
│      ┌──────────────────────────────────────────┐               │
│      │  Template with placeholders:              │               │
│      │  • {grant_name}                           │               │
│      │  • {research_context}                     │               │
│      │  • {#market_segments}...{/market_segments}│               │
│      │  • {tam}, {sam}, {som}                    │               │
│      │  • {#citations}...{/citations}            │               │
│      └──────────────────────────────────────────┘               │
│                          │                                       │
│                          ▼                                       │
│   2. Template stored in Storage (docx-templates bucket)          │
│                          │                                       │
│                          ▼                                       │
│   3. User clicks "Download DOCX"                                 │
│      └── Frontend calls generate-docx edge function              │
│                          │                                       │
│                          ▼                                       │
│   4. Edge function:                                              │
│      • Fetches template from storage                             │
│      • Loads report content_json                                 │
│      • Uses docxtemplater to fill placeholders                   │
│      • Returns generated DOCX as download                        │
│                          │                                       │
│                          ▼                                       │
│   5. User receives professionally formatted DOCX                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### Phase 1: Database and Storage Setup

**New storage bucket:**
- Create `docx-templates` bucket (private)

**Database changes:**
```sql
-- Add DOCX template reference to pdf_templates table
ALTER TABLE pdf_templates ADD COLUMN docx_template_path TEXT;

-- Or create a separate docx_templates table if you want multiple templates:
CREATE TABLE docx_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_path TEXT NOT NULL,  -- path in docx-templates bucket
  is_default BOOLEAN DEFAULT false,
  placeholder_schema_json JSONB,  -- documents expected placeholders
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Phase 2: Admin Template Upload UI

**New admin page or section: DOCX Templates**
- Upload DOCX template file
- Preview list of detected placeholders (parse the template)
- Set as default template
- Download sample template with all supported placeholders

**Location:** Add to existing PDF Templates page or create `/admin/docx-templates`

**UI Components:**
- File dropzone for .docx upload
- Template list showing uploaded templates
- "Set as Default" action
- "Download Sample" button

### Phase 3: Edge Function for DOCX Generation

**New edge function:** `supabase/functions/generate-docx/index.ts`

```typescript
// Uses these ESM-compatible libraries:
import PizZip from "npm:pizzip";
import Docxtemplater from "npm:docxtemplater";

// Process:
// 1. Fetch template from storage
// 2. Load into PizZip
// 3. Create Docxtemplater instance
// 4. Map report content_json to template variables
// 5. Render and return as blob
```

**Template placeholder mapping:**
```typescript
const templateData = {
  // Cover page
  grant_name: grantName,
  generated_date: formattedDate,
  version: report.version_number,
  
  // Content sections
  research_context: content.researchContext,
  market_segments: formatMarketSegments(content.marketSegments),
  competitors: formatCompetitors(content.existingCompetitors),
  competitor_table: content.competitorTable,
  tam: formatMarketSize(content.tam),
  sam: formatMarketSize(content.sam),
  som: formatMarketSize(content.som),
  economic_impact: content.economicImpact,
  partners: formatPartners(content.partners),
  
  // Citations/References
  citations: formatCitations(content.citations),
  
  // Branding
  powered_by: template.powered_by_text,
};
```

### Phase 4: Frontend Integration

**Update ReportsList.tsx:**
- Add "DOCX" download button (always visible, not conditional on docx_path)
- Call `generate-docx` edge function
- Download the returned blob

**Update useReportGeneration.ts:**
- Add `downloadDocx(reportId)` function that calls the edge function

### Phase 5: Sample Template Creation

Create a professionally designed sample template that admins can download and customize:
- Cover page with logo placeholder and title
- Table of contents (Word can auto-generate)
- Each section with proper heading styles
- Tables for competitor comparison
- References section
- Footer with branding

## Template Placeholder Reference

| Placeholder | Description | Type |
|-------------|-------------|------|
| `{grant_name}` | Name of the grant | String |
| `{generated_date}` | Report generation date | String |
| `{version}` | Report version number | Number |
| `{research_context}` | Executive summary | String (rich text) |
| `{#market_segments}...{/market_segments}` | Loop over market segments | Array |
| `{#competitors}...{/competitors}` | Loop over competitors | Array |
| `{tam}` | Total Addressable Market | String |
| `{sam}` | Serviceable Addressable Market | String |
| `{som}` | Serviceable Obtainable Market | String |
| `{economic_impact}` | Economic impact analysis | String |
| `{#partners}...{/partners}` | Loop over partners | Array |
| `{#citations}...{/citations}` | Loop over citations | Array |
| `{powered_by}` | Branding text | String |

**Loop example in template:**
```
{#market_segments}
Segment: {name}
Description: {description}
Size: {size}
{/market_segments}
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/generate-docx/index.ts` | Create | Edge function for DOCX generation |
| `src/components/admin/DocxTemplateUploader.tsx` | Create | Admin UI for template upload |
| `src/pages/admin/DocxTemplates.tsx` | Create | Admin page for managing templates |
| `src/hooks/useDocxTemplates.ts` | Create | CRUD hooks for DOCX templates |
| `src/components/workspace/ReportsList.tsx` | Modify | Add DOCX download button |
| `src/hooks/useReportGeneration.ts` | Modify | Add downloadDocx function |
| Database migration | Create | Add docx_template_path column or table |
| Storage bucket creation | Migration | Create docx-templates bucket |

## Technical Considerations

### Deno/Edge Function Compatibility
- `docxtemplater` and `pizzip` work with Deno via npm: specifier
- Template binary handling in edge functions (fetch from storage → ArrayBuffer → PizZip)

### Template Validation
- Parse uploaded template to extract placeholders
- Warn admin if required placeholders are missing
- Show placeholder documentation in UI

### Fallback
- Keep current PDF generation as fallback
- If no DOCX template configured, generate PDF instead
- Show both buttons when DOCX template is available

## User Workflow

**Admin:**
1. Go to Admin → DOCX Templates
2. Download sample template or upload custom template
3. Set template as default

**Researcher:**
1. Generate report (existing flow)
2. Click "Download DOCX" button
3. Receive professionally formatted Word document
4. Edit in Word/Google Docs as needed

## Summary

This approach gives you:
- Professional-quality output matching your exact template design
- Native Word formatting (no image-based rendering)
- Full control over fonts, colors, headers, footers
- Editable documents for researchers
- Simple admin workflow for template updates
- Keeps PDF as fallback option
