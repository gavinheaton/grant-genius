

# Implement DOCX HTML Module for Native Word Formatting

## Overview

This plan upgrades the DOCX generation to convert markdown into native Word formatting (headings, bold, italic, bullets, tables) using `docxtemplater-html-module`. Instead of raw markdown syntax appearing in the document, users will get professionally formatted Word documents.

## Current Problem

The generated DOCX shows raw markdown syntax:
- `## 1. Executive Summary` appears as literal text
- `**bold text**` shows with asterisks
- `- bullet point` shows as dash text
- Tables work via loops, but inline markdown tables don't render

## Solution Architecture

```text
┌─────────────────────┐
│ Report Markdown     │
│ (from Step 11)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Marked Library      │
│ Convert MD → HTML   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ HTML Module         │
│ Convert HTML → OOXML│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Docxtemplater       │
│ Fill Template       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Native Word Doc     │
│ Proper formatting   │
└─────────────────────┘
```

## Key Technical Changes

### 1. Add Dependencies (Edge Function)

Import `marked` for markdown-to-HTML conversion and `docxtemplater-html-module` for HTML-to-Word rendering:

```typescript
import { marked } from "https://esm.sh/marked@14";
import HTMLModule from "https://esm.sh/docxtemplater-html-module@3.65.0";
```

### 2. Configure Docxtemplater with HTML Module

```typescript
const doc = new Docxtemplater(zip, {
  paragraphLoop: true,
  linebreaks: true,
  delimiters: { start: "{", end: "}" },
  modules: [
    new HTMLModule({
      ignoreUnknownTags: true,
      ignoreCssErrors: true,
      styleSheet: `
        h1, h2 { font-weight: bold; }
        h1 { font-size: 18pt; }
        h2 { font-size: 14pt; }
        h3 { font-size: 12pt; }
        table { width: 100%; }
        th { background-color: #2563eb; color: white; font-weight: bold; }
        td { padding: 8px; }
      `,
    }),
  ],
});
```

### 3. Convert Markdown Sections to HTML

```typescript
function markdownToHtml(markdown: string): string {
  if (!markdown) return "";
  return marked.parse(markdown, { async: false }) as string;
}

function extractAllSectionsAsHtml(markdown: string): Record<string, string> {
  return {
    executive_summary: markdownToHtml(extractSection(markdown, 1, "Executive Summary")),
    research_context: markdownToHtml(extractSection(markdown, 2, "Research Context")),
    // ... all 11 sections
  };
}
```

### 4. Update Template Placeholders

Use the `{~~section}` syntax (double tilde) for block HTML content:

| Old Placeholder | New Placeholder | Description |
|-----------------|-----------------|-------------|
| `{executive_summary}` | `{~~executive_summary}` | Block HTML (can contain tables, lists, paragraphs) |
| `{research_context}` | `{~~research_context}` | Block HTML section |
| `{report_content}` | `{~~report_content}` | Full report as HTML |

### 5. Template Design Changes Required

The Word template needs to use the block HTML syntax:

```text
EXECUTIVE SUMMARY
{~~executive_summary}

RESEARCH CONTEXT AND INNOVATION
{~~research_context}

... etc ...
```

**Important**: Each `{~~placeholder}` must be in its own paragraph (not on the same line as other text).

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-docx/index.ts` | Add HTMLModule + marked imports, convert sections to HTML, use {~~} placeholders |
| `src/components/admin/DocxTemplateUploader.tsx` | Update placeholder documentation to show {~~} syntax |

## Detailed Implementation

### generate-docx/index.ts Changes

1. **Add imports** at the top:
   ```typescript
   import { marked } from "https://esm.sh/marked@14";
   import HTMLModule from "https://esm.sh/docxtemplater-html-module@3.65.0";
   ```

2. **Add markdown-to-HTML converter**:
   ```typescript
   function markdownToHtml(markdown: string): string {
     if (!markdown) return "";
     // Configure marked for consistent output
     marked.setOptions({
       gfm: true,        // GitHub Flavored Markdown
       breaks: true,     // Convert \n to <br>
     });
     return marked.parse(markdown, { async: false }) as string;
   }
   ```

3. **Update section extraction** to output HTML:
   ```typescript
   function extractAllSectionsAsHtml(markdown: string): Record<string, string> {
     const sections = {
       executive_summary: extractSection(markdown, 1, "Executive Summary"),
       research_context: extractSection(markdown, 2, "Research Context and Innovation"),
       unmet_need: extractSection(markdown, 3, "Unmet Need and Australian Relevance"),
       commercialisation_pathways: extractSection(markdown, 4, "Commercialisation Pathways"),
       competitive_landscape: extractSection(markdown, 5, "Competitive Landscape"),
       market_sizing: extractSection(markdown, 6, "Market Sizing"),
       economic_impact: extractSection(markdown, 7, "Economic Impact|Indicative Economic Impact"),
       australian_partners: extractSection(markdown, 8, "Potential Australian Partners"),
       risks_mitigations: extractSection(markdown, 9, "Key Risks and Mitigations"),
       data_gaps_section: extractSection(markdown, 10, "Data Gaps and Validation Needs"),
       references_section: extractSection(markdown, 11, "References"),
     };
     
     // Convert each section from markdown to HTML
     const htmlSections: Record<string, string> = {};
     for (const [key, value] of Object.entries(sections)) {
       htmlSections[key] = markdownToHtml(value);
     }
     return htmlSections;
   }
   ```

4. **Initialize Docxtemplater with HTMLModule**:
   ```typescript
   const doc = new Docxtemplater(zip, {
     paragraphLoop: true,
     linebreaks: true,
     delimiters: { start: "{", end: "}" },
     modules: [
       new HTMLModule({
         ignoreUnknownTags: true,
         ignoreCssErrors: true,
         styleSheet: `
           h1 { font-size: 18pt; font-weight: bold; color: #1a1a1a; margin-bottom: 12pt; }
           h2 { font-size: 14pt; font-weight: bold; color: #1a1a1a; margin-bottom: 10pt; }
           h3 { font-size: 12pt; font-weight: bold; color: #333333; margin-bottom: 8pt; }
           p { margin-bottom: 8pt; line-height: 1.4; }
           ul, ol { margin-left: 24pt; margin-bottom: 10pt; }
           li { margin-bottom: 4pt; }
           table { width: 100%; border-collapse: collapse; margin: 12pt 0; }
           th { background-color: #2563eb; color: white; font-weight: bold; padding: 10pt; text-align: left; }
           td { border: 1px solid #e5e7eb; padding: 8pt; }
           strong, b { font-weight: bold; }
           em, i { font-style: italic; }
           a { color: #2563eb; text-decoration: underline; }
         `,
       }),
     ],
   });
   ```

5. **Update template data** to use HTML sections:
   ```typescript
   const htmlSections = extractAllSectionsAsHtml(assembledReport.report_markdown);
   
   templateData = {
     grant_name: grantName,
     application_title: (report.applications as any)?.title || grantName,
     report_title: assembledReport.title || `${grantName} Research Report`,
     generated_date: formatDate(report.created_at),
     version: report.version_number,
     
     // Full report as HTML
     report_content: markdownToHtml(assembledReport.report_markdown),
     
     // Individual sections as HTML
     ...htmlSections,
     
     // Sources loop (plain text - no HTML needed)
     sources: ensureArray(assembledReport.all_sources).map((source, idx) => ({
       index: idx + 1,
       id: source.id,
       mla: source.mla,
       url: source.url,
     })),
     has_sources: ensureArray(assembledReport.all_sources).length > 0,
     
     // ... rest of template data
   };
   ```

### DocxTemplateUploader.tsx Changes

Update the placeholder documentation to show the new syntax:

```typescript
const PLACEHOLDER_DOCS = `
## DOCX Template Placeholders

### Cover Page / Metadata (plain text)
- {grant_name} - Name of the grant
- {application_title} - Application title
- {report_title} - Generated report title
- {generated_date} - Report generation date
- {version} - Report version number

### Full Report Content (HTML block)
- {~~report_content} - The entire formatted report with native Word styling

### Individual Sections (HTML blocks)
Use {~~section_name} syntax - each must be alone in its paragraph:

- {~~executive_summary} - Section 1: Executive Summary
- {~~research_context} - Section 2: Research Context and Innovation
- {~~unmet_need} - Section 3: Unmet Need and Australian Relevance
- {~~commercialisation_pathways} - Section 4: Commercialisation Pathways
- {~~competitive_landscape} - Section 5: Competitive Landscape
- {~~market_sizing} - Section 6: Market Sizing (TAM/SAM/SOM)
- {~~economic_impact} - Section 7: Economic Impact to Australia
- {~~australian_partners} - Section 8: Potential Australian Partners
- {~~risks_mitigations} - Section 9: Key Risks and Mitigations
- {~~data_gaps_section} - Section 10: Data Gaps and Validation Needs
- {~~references_section} - Section 11: References

### Citations Loop (plain text)
{#sources}
[{id}] {mla}
{url}
{/sources}

### Branding
- {powered_by} - Footer branding text

## Important Notes

1. HTML block placeholders ({~~...}) must be the ONLY content in their paragraph
2. Use Enter (paragraph break) before and after each {~~...} tag
3. Do NOT use Shift+Enter (line break) - this will cause errors
`;
```

## Expected Output Quality

### Before (Raw Markdown)
```
## 1. Executive Summary

- **Market Opportunity**: The Total Addressable Market...
- Target Innovation: AMT Bio is developing...

| Competitor | Description | Differentiation |
|------------|-------------|-----------------|
| Company A  | Does X      | We do Y better  |
```

### After (Native Word Formatting)
- **Heading 2** styled "1. Executive Summary"
- Proper bullet points with bold text
- Native Word table with styled headers
- Clickable hyperlinks
- Consistent fonts and spacing

## Template Design Recommendation

Create a new template with this structure:

```text
[Cover Page]
{report_title}
Prepared for: {grant_name}
Date: {generated_date}
Version: {version}

[Page Break]

{~~report_content}

[Page Break - Optional separate references section]

REFERENCES
{#sources}
[{id}] {mla}
URL: {url}
{/sources}

{powered_by}
```

Or use individual sections for more control:

```text
EXECUTIVE SUMMARY
{~~executive_summary}

RESEARCH CONTEXT AND INNOVATION
{~~research_context}

... etc for each section ...
```

## Testing Plan

1. Deploy updated edge function
2. Upload a test template with `{~~report_content}` placeholder
3. Generate a DOCX and verify:
   - Headings render as Word heading styles
   - Bold/italic text is properly formatted
   - Bullet lists use Word bullet formatting
   - Tables render as Word tables
   - Links are clickable

## Risk Considerations

1. **Paid Module**: The `docxtemplater-html-module` is a commercial module. Need to verify licensing for your use case. If licensing is an issue, we can fall back to the markdown-stripping approach.

2. **ESM.sh Availability**: Importing from esm.sh may have version compatibility issues. We may need to pin specific versions.

3. **Complex Markdown**: Some edge cases in markdown (nested lists, complex tables) may not render perfectly. We should test with real report content.

## Summary

This implementation:
1. Adds `marked` library to convert markdown to HTML
2. Adds `docxtemplater-html-module` to convert HTML to native Word formatting
3. Updates placeholders to use `{~~section}` block syntax
4. Produces professional Word documents with native styling

The result will be publication-ready DOCX files with proper headings, formatted lists, styled tables, and clickable links.

