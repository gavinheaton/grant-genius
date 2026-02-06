

# Add APA Citation Cleanup to Pipeline Generator

## Summary

Add a new assembly step `clean_citations_apa` to the prompt bundle generator that transforms internal source IDs (e.g., `[S0-1]`, `[ARTICLE-1]`) into proper hyperlinked APA author-year citations and produces a clean References section. Also add a client-side fallback for existing reports.

## Current State (3-step assembly)

| Step | Name | Output |
|------|------|--------|
| N+1 | `assemble_sections_html` | sections_html with `<sup>[S0-1]</sup>` markers |
| N+2 | `build_tables_sources_html` | tables + all_sources (MLA format) |
| N+3 | `finalize_report_html` | Merged report (markers NOT cleaned) |

## Target State (4-step assembly)

| Step | Name | Output |
|------|------|--------|
| N+1 | `assemble_sections_html` | sections_html with `<sup>[S0-1]</sup>` markers |
| N+2 | `build_tables_sources_html` | tables + all_sources |
| N+3 | `clean_citations_apa` | sections_html_cleaned + tables_cleaned + references_html |
| N+4 | `finalize_report_html` | Final report with APA citations (NO internal IDs) |

## Implementation Details

### File 1: `supabase/functions/process-grant-guidelines/index.ts`

#### Location: `createHtmlAssemblySteps` function (lines 995-1136)

**Change 1**: Insert new `clean_citations_apa` step as the 3rd element in the returned array (between `build_tables_sources_html` and `finalize_report_html`)

**New Step Prompt (approximately 2,500 characters):**
- Purpose: Transform bracketed internal IDs to APA author-year citations
- Inputs: `{{step${maxAIStep + 1}}}` (sections_html) and `{{step${maxAIStep + 2}}}` (tables, all_sources)
- Pattern matching: `[S0-1]`, `[S0-A1]`, `[ARTICLE-1]`, `[SEARCH-2]`, etc.
- Output schema: `sections_html_cleaned`, `tables_cleaned`, `references_html`, `metadata`, `unknowns`

**Key rules in the new step:**
1. Build a source lookup map keyed by source_id
2. For each bracketed token: if resolvable → replace with hyperlinked `(Author, Year)`; if not → remove and log in unknowns
3. Clean both sections AND tables
4. Build APA References section with only cited sources
5. Validation: no `[S`, `[ARTICLE`, `[SEARCH` patterns in output

**Change 2**: Update step numbers in `finalize_report_html`
- Change from `STEP ${maxAIStep + 3}` to `STEP ${maxAIStep + 4}`
- Update input references to consume Step N+3 outputs

**Change 3**: Update finalize step to use cleaned outputs
- Input from `{{step${maxAIStep + 3}}}` now provides: `sections_html_cleaned`, `tables_cleaned`, `references_html`
- Task: merge cleaned narrative with cleaned tables, append references_html
- Explicit validation: ensure no bracketed IDs remain in output

### File 2: `src/lib/htmlReportUtils.ts`

**Add new function** `stripBracketedSourceIds` (client-side fallback for existing reports):

```typescript
/**
 * Remove any remaining bracketed internal source IDs from HTML
 * Fallback for reports generated before APA citation cleanup was added
 */
export function stripBracketedSourceIds(html: string): string {
  if (!html) return "";
  
  // Pattern matches: [S0-1], [S0-A1], [ARTICLE-1], [SEARCH-2], [TBD], [{TBD}], etc.
  // Also matches superscript-wrapped versions: <sup>[S0-1]</sup>
  const patterns = [
    /<sup>\[([A-Z][A-Z0-9\-_:]+)\]<\/sup>/gi,  // Superscript wrapped
    /\[([A-Z][A-Z0-9\-_:]+)\]/gi,              // Plain brackets
    /\[\{TBD\}\]/gi,                            // {TBD} variant
    /\[TBD\]/gi                                 // TBD placeholder
  ];
  
  let cleaned = html;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  
  return cleaned;
}
```

**Update `sanitizeHtml` function** to apply the cleanup as a final pass:

```typescript
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  
  const purified = DOMPurify.sanitize(html, { /* existing config */ });
  
  // Clean any remaining internal source ID markers
  return stripBracketedSourceIds(purified);
}
```

## Technical Details

### New `clean_citations_apa` Prompt Template

```text
STEP ${maxAIStep + 3} — Clean Citations (APA Transformation)

You are a citation formatting specialist. Transform all internal source ID markers 
into proper APA author-year citations and produce a clean References section.

INPUTS:
- {{step${maxAIStep + 1}}}: sections_html containing internal citation markers
- {{step${maxAIStep + 2}}}: tables and all_sources array

INTERNAL MARKER PATTERNS TO REMOVE:
- [S0-1], [S0-A1], [S1-2] (step-source format)
- [ARTICLE-1], [SEARCH-2], [SOURCE-12] (type-number format)  
- [TBD], [{TBD}], any bracketed ALLCAPS/ID token
- <sup>[S0-1]</sup> (superscript-wrapped markers)

HARD RULES:
1. NEVER output any bracketed internal source IDs in the cleaned HTML
2. Do NOT replace internal IDs with new placeholders
3. Do NOT cite sources not present in all_sources
4. If a claim cannot be supported by a validated source, keep the claim but 
   replace the marker with nothing OR label as "Unknown (no validated source)"
5. No malformed or duplicate references
6. Hyperlink citations and reference URLs

TRANSFORMATION PROCESS:

A) Build source lookup map:
   Parse all_sources to create a dictionary keyed by "id" (e.g., "S0-1")
   Extract: author/publisher, year, title, url for each source

B) Clean the report body (sections_html):
   Scan for bracketed internal ID tokens (including <sup>-wrapped)
   
   IF resolvable to a source with usable metadata:
   - Replace with APA in-text citation: <a href="URL">(Author, Year)</a>
   - Consolidate adjacent markers: "(Author, 2023; Author2, 2024)"
   
   IF NOT resolvable:
   - Remove the bracket token completely (leave no trace)
   - Add to unknowns array: { "marker": "...", "location": "...", "needed": "..." }

C) Clean tables:
   Apply same replacement rules inside every table cell
   Preserve table structure and styling

D) Build APA References section:
   - Include ONLY sources actually cited in cleaned report
   - Format: Author/Org. (Year). Title. Publisher. <a href="URL">URL</a>
   - If author unknown, use organisation/publisher as author
   - If date unknown, use (n.d.)
   - Each entry hyperlinked to URL
   - NO internal IDs in References list

OUTPUT JSON SCHEMA:
{
  "sections_html_cleaned": "FULL cleaned HTML with APA citations (no internal IDs)",
  "tables_cleaned": {
    "competitors": "cleaned table HTML",
    "market_sizing": "cleaned table HTML", 
    "partners": "cleaned table HTML"
  },
  "references_html": "<h2>References</h2><div class='references'><ul>...</ul></div>",
  "metadata": {
    "cited_source_ids": ["S0-1", "S0-2"],
    "unresolved_markers_count": 0,
    "removed_internal_markers_count": 5
  },
  "unknowns": [
    { "marker": "[ARTICLE-99]", "location": "Section 3", "needed": "source metadata" }
  ]
}

VALIDATION CHECKS (must pass):
- sections_html_cleaned must NOT contain any [S, [ARTICLE, [SEARCH, {TBD} patterns
- tables_cleaned must NOT contain any internal ID patterns
- Every in-text citation must have a corresponding References entry
- Every References entry must correspond to at least one in-text citation
- No duplicate references
```

### Updated `finalize_report_html` Inputs

```text
Step ${maxAIStep + 3} data ({{step${maxAIStep + 3}}}):
- "sections_html_cleaned": The complete narrative HTML with APA citations
- "tables_cleaned": object with keys "competitors", "market_sizing", "partners"
- "references_html": Pre-built APA References section
- "metadata": Citation transformation statistics
- "unknowns": Unresolved markers array

YOUR TASK:
1. Get "sections_html_cleaned" from Step ${maxAIStep + 3} as base HTML
2. Replace table anchors with cleaned tables from tables_cleaned
3. Append references_html at the end (before any closing tags)
4. Combine unknowns from all steps into data_gaps

VALIDATION: The output report_html must NOT contain any patterns like:
[S0-1], [ARTICLE-*, [SEARCH-*, [TBD], [{TBD}]
```

## Files Changed

| File | Change Type |
|------|-------------|
| `supabase/functions/process-grant-guidelines/index.ts` | Insert new step + update finalize step |
| `src/lib/htmlReportUtils.ts` | Add `stripBracketedSourceIds` function + update `sanitizeHtml` |

## Testing

After deployment:
1. Upload a new grant guidelines PDF
2. Verify pipeline includes 4 assembly steps (N+1 through N+4)
3. Generate a test report
4. Confirm no `[S0-1]`, `[ARTICLE-*]`, `[SEARCH-*]` etc. appear in final HTML
5. Verify in-text citations show as "(Author, Year)" with hyperlinks
6. Verify References section contains only cited sources in APA format
7. Test viewing an existing report to confirm client-side fallback strips markers

