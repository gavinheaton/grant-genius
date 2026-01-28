
# Fix DOCX Template Placeholder Mapping

## Problem Identified

The current `generate-docx` edge function uses placeholder mappings that don't match the actual report data structure. 

**What the function expects:**
```typescript
{
  researchContext: string,
  marketSegments: Array<{name, description, size}>,
  existingCompetitors: Array<{name, description, url}>,
  tam: {value, description},
  sam: {value, description},
  som: {value, description},
  economicImpact: string,
  partners: Array<{name, description, website}>,
}
```

**What the report actually contains (from Step 11 assembly):**
```typescript
{
  assembledReport: {
    title: string,
    report_markdown: string,  // The FULL formatted report with all sections
    tables: Array<{title, markdown, section}>,
    all_sources: Array<{id, mla, url}>,
    data_gaps: Array<{gap, why_missing, needed_source}>
  }
}
```

The `report_markdown` field already contains the **complete formatted report** with all 11 sections:
1. Executive Summary
2. Research Context and Innovation  
3. Unmet Need and Australian Relevance
4. Commercialisation Pathways
5. Competitive Landscape and Differentiation
6. Market Sizing (TAM/SAM/SOM)
7. Indicative Economic Impact to Australia
8. Potential Australian Partners
9. Key Risks and Mitigations
10. Data Gaps and Validation Needs
11. References

---

## Solution

Update the `generate-docx` function to use the actual report structure with these new placeholders:

| Placeholder | Description | Source |
|-------------|-------------|--------|
| `{report_title}` | Report title from assembly | `assembledReport.title` |
| `{report_content}` | Full markdown report | `assembledReport.report_markdown` |
| `{#tables}...{/tables}` | Loop over tables | `assembledReport.tables` |
| `{#sources}...{/sources}` | Loop over citations | `assembledReport.all_sources` |
| `{#data_gaps}...{/data_gaps}` | Loop over data gaps | `assembledReport.data_gaps` |

**For template flexibility**, we can also extract sections from the markdown to allow individual section placeholders:
- `{executive_summary}` - Extracted from markdown
- `{research_context}` - Extracted from markdown  
- `{market_sizing}` - Extracted from markdown
- etc.

---

## Implementation Plan

### 1. Update generate-docx Edge Function

**File:** `supabase/functions/generate-docx/index.ts`

**Changes:**
- Update `ReportContent` interface to match actual structure
- Add markdown section extraction utility
- Map both full report and individual sections to placeholders
- Support both simple template (just `{report_content}`) and advanced template (individual sections)

```typescript
interface AssembledReport {
  title?: string;
  report_markdown: string;
  tables?: Array<{ title: string; markdown: string; section: string }>;
  all_sources?: Array<{ id: string; mla: string; url: string }>;
  data_gaps?: Array<{ gap: string; why_missing: string; needed_source: string }>;
}

interface ReportContent {
  assembledReport?: AssembledReport;
  // Legacy fields for backwards compatibility
  researchContext?: string;
  // ...
}

// Extract section from markdown
function extractSection(markdown: string, sectionTitle: string): string {
  const regex = new RegExp(`## \\d+\\. ${sectionTitle}[\\s\\S]*?(?=## \\d+\\.|$)`, 'i');
  const match = markdown.match(regex);
  return match ? match[0] : '';
}
```

### 2. Update Placeholder Documentation

**File:** `src/components/admin/DocxTemplateUploader.tsx`

Update the placeholder reference to show the correct placeholders:

**Simple Template Approach:**
```
{grant_name}
{application_title}
{generated_date}
{version}

{report_content}   <- The entire formatted report

{#sources}
[{id}] {mla}
{url}
{/sources}

{powered_by}
```

**Advanced Template Approach (optional):**
```
{executive_summary}
{research_context}
{unmet_need}
{commercialisation_pathways}
{competitive_landscape}
{market_sizing}
{economic_impact}
{australian_partners}
{risks_mitigations}
{data_gaps_section}
{references}
```

### 3. Handle Markdown to DOCX Conversion

Since `report_markdown` is markdown format, we need to handle this properly. Options:

**Option A: Simple text insertion** (current approach)
- Just insert the markdown as plain text
- User designs their template assuming text content

**Option B: Use docxtemplater-html-module** (better)
- Convert markdown to HTML
- Use HTML module to insert formatted content
- Preserves headings, bold, lists, tables

**Recommendation:** Start with Option A (simple) since users can design their templates accordingly, then optionally add HTML module support later.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-docx/index.ts` | Update content interface, add section extraction, fix placeholder mapping |
| `src/components/admin/DocxTemplateUploader.tsx` | Update placeholder documentation |

---

## Updated Placeholder Reference

### Cover Page / Metadata
- `{grant_name}` - Name of the grant
- `{application_title}` - Application title
- `{report_title}` - Generated report title
- `{generated_date}` - Report generation date
- `{version}` - Report version number

### Full Report Content
- `{report_content}` - The entire formatted report (markdown as text)

### Individual Sections (extracted from report_markdown)
- `{executive_summary}` - Section 1: Executive Summary
- `{research_context}` - Section 2: Research Context and Innovation
- `{unmet_need}` - Section 3: Unmet Need and Australian Relevance
- `{commercialisation_pathways}` - Section 4: Commercialisation Pathways
- `{competitive_landscape}` - Section 5: Competitive Landscape
- `{market_sizing}` - Section 6: Market Sizing (TAM/SAM/SOM)
- `{economic_impact}` - Section 7: Economic Impact to Australia
- `{australian_partners}` - Section 8: Potential Australian Partners
- `{risks_mitigations}` - Section 9: Key Risks and Mitigations
- `{data_gaps_section}` - Section 10: Data Gaps and Validation Needs
- `{references_section}` - Section 11: References

### Tables (loop)
```
{#tables}
Table: {title}
{markdown}
{/tables}
```

### Citations (loop)
```
{#sources}
[{id}] {mla}
{url}
{/sources}
```

### Data Gaps (loop)
```
{#data_gaps}
Gap: {gap}
Why: {why_missing}
Needed: {needed_source}
{/data_gaps}
```

### Branding
- `{powered_by}` - Footer branding text (default: "Powered by Disruptors Co")

---

## Example Template Approaches

### Minimal Template
Just insert the full report:
```
{grant_name}
Generated: {generated_date}

{report_content}

{powered_by}
```

### Structured Template  
Use individual sections with custom formatting:
```
COVER PAGE
{grant_name}
{application_title}

EXECUTIVE SUMMARY
{executive_summary}

RESEARCH CONTEXT
{research_context}

... etc ...

REFERENCES
{#sources}
[{id}] {mla}
{/sources}
```

---

## Summary

The fix involves:
1. Reading the actual `assembledReport` object from `content_json`
2. Extracting the `report_markdown` as the main content
3. Optionally parsing individual sections from the markdown
4. Mapping `all_sources` to the citations loop
5. Updating the admin documentation to show correct placeholders

This ensures your DOCX templates will work with the actual report data structure.
