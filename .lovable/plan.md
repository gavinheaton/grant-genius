
# Fix Report Formatting and DOCX Generation for Sections Format

## Problems Identified

### Problem 1: Tables Stop Rendering After Section 5

**Root Cause:** The markdown-to-HTML conversion in `htmlReportUtils.ts` has two issues:
1. The `convertMarkdownToHtml()` function splits by `\n\n` (double newline) and wraps content in `<p>` tags, but tables can be split across blocks and get incorrectly wrapped
2. The table conversion runs after paragraph wrapping, so table rows that got wrapped in `<p>` tags are not recognized as table syntax

**Evidence:** Report markdown contains properly formatted tables like:
```
| Segment | TAM Method Used | Candidate Market Category |
|---|---|---|
| Relapsed/Resistant Solid Tumours | Method 4 | N/A |
```

But after ~section 5, the tables appear as plain text because the paragraph wrapping interferes.

### Problem 2: DOCX Generation Completely Broken

**Root Cause:** The `generate-docx` edge function only handles `content.assembledReport` structure but the Replit worker outputs `content.sections` array format.

**Evidence:** Edge function logs show:
```
Missing assembledReport in content_json after extraction
```

The data exists in `content_json.sections[14]` (finalize_report) but the DOCX function never looks there.

## Solution

### Fix 1: Improve Table Parsing in `htmlReportUtils.ts`

Update `convertMarkdownToHtml()` to:
1. Process tables FIRST before paragraph wrapping
2. Preserve table blocks as atomic units
3. Handle escaped newlines (`\\n`) from JSON string encoding

### Fix 2: Add Sections Format Support to `generate-docx`

Update `extractAssembledReport()` to:
1. Check for `content.assembledReport` first (existing format)
2. Fall back to extracting from `content.sections` array (Replit format)
3. Find the `finalize_report` section and parse its JSON content
4. Build the `AssembledReport` structure from sections data

## Implementation Details

### File 1: `src/lib/htmlReportUtils.ts`

Update `convertMarkdownToHtml()` function:

```text
Current (broken):
1. Headers replacement
2. Bold/italic replacement
3. Links replacement
4. Lists replacement
5. Split by \n\n and wrap in <p>
6. Convert tables

Fixed:
1. Unescape JSON string escapes (\\n -> \n)
2. Extract and preserve table blocks FIRST
3. Process remaining content
4. Reinsert tables in correct positions
```

Key changes:
- Add initial unescape step for `\\n`, `\\"`, `\\\\`
- Detect table blocks (consecutive lines starting with `|`) before any processing
- Replace tables with placeholders
- Do paragraph wrapping
- Restore tables from placeholders

### File 2: `supabase/functions/generate-docx/index.ts`

Add sections format handling:

```text
function extractAssembledReport(content: ReportContent): AssembledReport | null {
  // Case 1: Direct assembledReport (existing)
  if (content.assembledReport) {
    return handleAssembledReport(content.assembledReport);
  }

  // Case 2: Sections array format (Replit worker)
  if (content.sections && Array.isArray(content.sections)) {
    const finalizeSection = content.sections.find(
      s => s.title === 'finalize_report'
    );
    if (finalizeSection?.content) {
      // Parse JSON from section content (strip code fences if present)
      const parsed = parseJsonFromSection(finalizeSection.content);
      return {
        title: parsed.title,
        report_markdown: parsed.report_markdown || parsed.report_html,
        tables: [], // Tables are in markdown
        all_sources: extractSourcesFromSections(content.sections),
        data_gaps: []
      };
    }
  }

  return null;
}
```

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/htmlReportUtils.ts` | Modify | Fix table extraction order, add JSON unescape, preserve table blocks |
| `supabase/functions/generate-docx/index.ts` | Modify | Add sections array format support |

## Technical Notes

**Table Block Detection:**
```typescript
// Find consecutive lines starting with | (table block)
const tableBlockRegex = /(?:^|\n)((?:\|[^\n]+\|(?:\n|$))+)/g;
```

**JSON Unescape:**
```typescript
// Handle common JSON escapes in content from Replit
content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
```

**Sections Format Parsing:**
The DOCX function needs to:
1. Strip ` ```json ` and ` ``` ` fences from section content
2. Parse the JSON object
3. Extract `report_markdown` for the document body
4. Optionally extract sources from `build_source_pack` section

## Testing Plan

After implementation:
1. View existing report - tables should render correctly in all sections
2. Download DOCX - should generate successfully instead of error
3. Generate new report - verify both HTML viewer and DOCX work
