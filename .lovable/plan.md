
# Replace DOCX Renderer with Programmatic `docx` Library

## Overview

This plan replaces the current DOCX generation implementation (which relies on `docxtemplater` with template files) with a fully programmatic approach using the open-source `docx` library. The new renderer will:

1. Parse the Step 11 JSON output directly
2. Build Word documents programmatically with native headings, paragraphs, bullet lists, numbered lists, and tables
3. No longer require template files from admins

## Current Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        CURRENT FLOW (BROKEN)                         │
└──────────────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  1. User clicks "DOCX" button                      │
    │     (src/components/workspace/ReportsList.tsx)     │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  2. Fetch call to generate-docx edge function     │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  3. Edge function downloads admin DOCX template   │
    │     from storage bucket                            │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  4. Uses docxtemplater to fill {placeholders}     │
    │     ⚠️ PROBLEM: Markdown appears as raw text      │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  5. Returns DOCX blob for download                │
    └───────────────────────────────────────────────────┘
```

## New Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                      NEW FLOW (PROGRAMMATIC)                         │
└──────────────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  1. User clicks "DOCX" button                      │
    │     (No UI changes - keep existing button)         │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  2. Fetch call to generate-docx edge function     │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  3. Edge function fetches report.content_json     │
    │     (No template file needed)                      │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  4. Validate assembledReport exists in content    │
    │     If missing → return 400 error                  │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  5. Parse report_markdown (limited subset only):  │
    │     - ## → Word Heading 1                          │
    │     - ### → Word Heading 2                         │
    │     - Paragraphs                                   │
    │     - Bullet lists → Word bullet numbering         │
    │     - Numbered lists → Word numbering              │
    │     - NO tables from markdown                      │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  6. Insert tables from structured tables[] array  │
    │     - Match table.section to section heading      │
    │     - Fill empty cells with "Unknown (no source)" │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  7. Add page break + References section           │
    │     - all_sources[].mla as hanging indent paras   │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  8. Optionally save to storage + update docx_path │
    └─────────────────────────┬─────────────────────────┘
                              │
    ┌─────────────────────────▼─────────────────────────┐
    │  9. Return DOCX blob for immediate download       │
    └───────────────────────────────────────────────────┘
```

## Step 11 JSON Structure (Source of Truth)

The `content_json.assembledReport` field contains:

```json
{
  "title": "string - Report title",
  "report_markdown": "string - DOCX-safe markdown (NO tables, NO code fences)",
  "tables": [
    {
      "title": "Table title",
      "section": "Market Sizing",
      "columns": ["Column A", "Column B"],
      "rows": [["Row 1 A", "Row 1 B"], ["Row 2 A", "Row 2 B"]]
    }
  ],
  "all_sources": [
    {
      "id": "S1",
      "title": "Source title",
      "publisher": "Publisher name",
      "date": "2024",
      "url": "https://...",
      "accessed_date": "2026-01-28",
      "mla": "Full MLA citation string"
    }
  ],
  "data_gaps": [
    {
      "gap": "Missing TAM validation",
      "why_missing": "No Australian-specific data found",
      "needed_source": "ABS or IBIS data"
    }
  ]
}
```

## Technical Implementation

### File: `supabase/functions/generate-docx/index.ts`

Complete rewrite using the `docx` library:

#### Key Imports
```typescript
import { Document, Packer, Paragraph, TextRun, HeadingLevel, 
         Table, TableRow, TableCell, WidthType, AlignmentType,
         PageBreak, BorderStyle, convertInchesToTwip } from "https://esm.sh/docx@8";
```

#### Markdown Parser (Limited Subset)
Parse ONLY:
- `## Heading` → HeadingLevel.HEADING_1
- `### Subheading` → HeadingLevel.HEADING_2
- `- bullet` / `* bullet` → Paragraph with bullet numbering
- `1. numbered` → Paragraph with numbered list
- Plain paragraphs
- Bold `**text**` → TextRun with bold
- Italic `*text*` → TextRun with italics

IGNORE:
- Tables in markdown (handled separately from structured data)
- Code fences
- Images
- Links (extract text only)

#### Table Insertion Logic
1. Parse section headings from markdown
2. For each `tables[i]`, find matching section by `tables[i].section`
3. Insert Word Table immediately after that section heading
4. If `tables[i].section` doesn't match any heading, append at document end
5. Empty cells → "Unknown (no validated source found)"

#### References Section
- Add `PageBreak` before References
- Add "References" as Heading 1
- For each `all_sources[i].mla`:
  - Create paragraph with hanging indent (first line at 0, rest at 0.5")
  - Include URL on next line if present

#### Data Gaps Section
- If section "Data Gaps" exists in markdown, append bullet list
- Each `data_gaps[i]` becomes a bullet: "{gap} - {why_missing}"

### Error Handling

1. **No assembledReport**: Return 400 with clear message
2. **Malformed JSON**: Return 400 with parse error details
3. **Missing report_markdown**: Return 400 asking user to regenerate
4. **Storage upload failure**: Log error, still return DOCX blob (don't block download)

### Access Control (Unchanged)
- Verify JWT token
- Check `report.user_id === auth.uid()` OR user has admin role
- Return 401/403 for unauthorized access

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/generate-docx/index.ts` | **Replace** | Complete rewrite with `docx` library |
| `src/components/workspace/ReportsList.tsx` | **Minor update** | Remove `docxTemplate` check (no longer needed) |
| `src/components/admin/DocxTemplateUploader.tsx` | **Update** | Show info that templates are deprecated (optional) |
| `src/hooks/useDocxTemplates.ts` | **No change** | Keep for backwards compatibility |

## Detailed Code Changes

### 1. Edge Function: `generate-docx/index.ts`

Key sections of the new implementation:

```typescript
// Validate Step 11 JSON exists
const content = report.content_json;
const assembledReport = content?.assembledReport;

if (!assembledReport?.report_markdown) {
  return new Response(JSON.stringify({ 
    error: "Report content not found. Please regenerate the report." 
  }), { status: 400 });
}

// Parse markdown into document elements
const elements = parseMarkdownToDocx(assembledReport.report_markdown);

// Insert tables from structured data
const tables = assembledReport.tables || [];
const elementsWithTables = insertTablesAtSections(elements, tables);

// Build Word document
const doc = new Document({
  sections: [{
    children: [
      ...elementsWithTables,
      // Page break before references
      new Paragraph({ children: [new PageBreak()] }),
      // References heading
      new Paragraph({ 
        text: "References", 
        heading: HeadingLevel.HEADING_1 
      }),
      // MLA citations with hanging indent
      ...buildReferences(assembledReport.all_sources || [])
    ]
  }]
});

// Generate buffer
const buffer = await Packer.toBuffer(doc);

// Optionally save to storage
try {
  const storagePath = `${report.user_id}/${report.id}.docx`;
  await supabaseService.storage
    .from("reports")
    .upload(storagePath, buffer, { 
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true 
    });
  
  // Update docx_path in database
  await supabaseService
    .from("reports")
    .update({ docx_path: storagePath })
    .eq("id", report.id);
} catch (storageError) {
  console.error("Storage upload failed (non-blocking):", storageError);
}

// Return DOCX for download
return new Response(buffer, {
  headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename="${filename}"`,
    ...corsHeaders
  }
});
```

### 2. Frontend: Remove Template Requirement

Update `ReportsList.tsx` to remove the template check:

```typescript
// BEFORE
const handleGenerateDocx = useCallback(async (report: Report) => {
  if (!docxTemplate) {
    toast({ title: "No DOCX template", ... });
    return;
  }
  // ...
}, [docxTemplate, grantName]);

// AFTER
const handleGenerateDocx = useCallback(async (report: Report) => {
  // No template check needed - programmatic generation
  setGeneratingDocx(report.id);
  // ... rest unchanged
}, [grantName]);
```

Also update the button to always show (remove `{docxTemplate && ...}` wrapper).

### 3. Admin UI: Deprecation Notice (Optional)

Add a notice to `DocxTemplateUploader.tsx` that templates are no longer used, or hide the component entirely since it's no longer needed.

## Markdown Parser Specification

### Supported Constructs

| Markdown | Word Element |
|----------|--------------|
| `## Heading` | Heading 1 (bold, 18pt) |
| `### Subheading` | Heading 2 (bold, 14pt) |
| `#### Sub-subheading` | Heading 3 (bold, 12pt) |
| Plain text | Paragraph (11pt) |
| `- Bullet item` | Bullet list item |
| `* Bullet item` | Bullet list item |
| `1. Numbered item` | Numbered list item |
| `**bold text**` | Bold TextRun |
| `*italic text*` | Italic TextRun |
| `[link text](url)` | Plain text (ignore URL) |
| Empty line | Paragraph break |

### Ignored Constructs

| Markdown | Handling |
|----------|----------|
| Tables `\| col \| col \|` | Skip entirely - use structured data |
| Code fences ``` | Skip |
| Images `![](url)` | Skip |
| Horizontal rules `---` | Skip |
| Blockquotes `>` | Treat as paragraph |

## Table Rendering

Tables are inserted from `tables[]` array with proper Word formatting:

```typescript
function buildTable(tableData: TableData): Table {
  const { title, columns, rows } = tableData;
  
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Header row
      new TableRow({
        tableHeader: true,
        children: columns.map(col => new TableCell({
          children: [new Paragraph({ 
            children: [new TextRun({ text: col, bold: true })]
          })],
          shading: { fill: "2563EB" }, // Blue header
        }))
      }),
      // Data rows
      ...rows.map(row => new TableRow({
        children: row.map(cell => new TableCell({
          children: [new Paragraph({ 
            text: cell || "Unknown (no validated source found)"
          })]
        }))
      }))
    ]
  });
}
```

## References Formatting

MLA citations with hanging indent (standard academic format):

```typescript
function buildReferences(sources: Source[]): Paragraph[] {
  return sources.map((source, idx) => new Paragraph({
    children: [
      new TextRun({ text: `[${source.id}] `, bold: true }),
      new TextRun({ text: source.mla }),
    ],
    indent: {
      left: convertInchesToTwip(0.5),
      hanging: convertInchesToTwip(0.5),
    },
    spacing: { after: 120 },
  }));
}
```

## Testing Strategy

### Unit Test: Mocked Step 11 Payload

Create `supabase/functions/generate-docx/index_test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const mockAssembledReport = {
  title: "Test Report",
  report_markdown: `## 1. Executive Summary

- Market opportunity is significant
- Technology is novel

## 2. Research Context

This is **bold** and *italic* text.

1. First numbered item
2. Second numbered item
`,
  tables: [{
    title: "Market Sizing",
    section: "Market Sizing",
    columns: ["Metric", "Value"],
    rows: [["TAM", "$50B"], ["SAM", "$5B"]]
  }],
  all_sources: [{
    id: "S1",
    mla: "Smith, J. (2024). Research Paper. Journal Name.",
    url: "https://example.com"
  }],
  data_gaps: [{
    gap: "TAM validation",
    why_missing: "No AU data",
    needed_source: "ABS"
  }]
};

Deno.test("parseMarkdownToDocx handles headings", () => {
  // Test heading extraction
});

Deno.test("buildTable creates proper Word table", () => {
  // Test table generation
});
```

## Rollback Plan

If issues arise:
1. The old `docxtemplater` code is in git history
2. Admin-uploaded templates remain in storage
3. Can revert edge function while keeping UI unchanged

## Summary

This implementation:
- Removes dependency on admin-uploaded template files
- Uses `docx` library for native Word document creation
- Parses only safe markdown subset (no tables from markdown)
- Inserts structured tables from Step 11 JSON
- Properly formats references with hanging indents
- Handles data gaps as bullet list
- Saves to storage and updates `docx_path`
- Maintains existing access control
- Includes error handling for missing/malformed data
