

# Update Report Assembly + Citation Finalization to Eliminate Internal Source IDs

## Summary

Update the report assembly pipeline to ensure internal source markers (e.g., `[S0-1]`, `[step9]`, `[article]`, `[Source1]`) never appear in final report output. Implement APA in-text citation format `(Author, Year)` for source references and add comprehensive hard validation with sentence-level error reporting.

## Current State

The codebase has extensive citation normalization infrastructure:
- `citationNormalizer.ts` with `sanitizeFinalReport()`, `validateFinalReport()`, and `lintBracketTokens()`
- `worker-proxy/index.ts` with `FORBIDDEN_PATTERNS_LINT` and hard failure gates
- Test coverage in `citationNormalizer.test.ts`

## Gaps to Address

| Gap | Current State | Required State |
|-----|---------------|----------------|
| Step reference patterns | `[step9]`, `[stepN]` not covered | Add to forbidden patterns |
| Citation format | Numeric `[1]` links | APA `(Author, Year)` hyperlinked |
| Assembly prompts | No explicit anti-bracket rules | Explicit prohibition + APA format instruction |
| Missing source handling | Removed silently | Replace with "Unknown (no validated source found)" + log to unknowns |
| Error context | Pattern name only | Include surrounding sentence |

---

## Implementation Plan

### File 1: Update `src/lib/citationNormalizer.ts`

**Changes:**

1. **Add missing forbidden patterns:**
```typescript
// Step reference patterns
{ pattern: /\[step\d+\]/gi, name: '[stepN] reference' },
{ pattern: /\[Source\d*\]/gi, name: '[Source1] marker' },
```

2. **Add APA in-text citation conversion function:**
```typescript
export function convertToApaInText(
  html: string,
  sourceMap: Map<string, SourceEntry>
): { html: string; unknowns: UnknownEntry[] };
```

This function will:
- Find internal markers like `[S0-1]`
- Look up the source in sourceMap
- Convert to `<a href="#ref-N">(Author, Year)</a>` format
- If source not found, replace with "Unknown (no validated source found)" and log to unknowns

3. **Update `lintBracketTokens()` to return sentence context:**
```typescript
interface LintViolation {
  pattern: string;
  match: string;
  sentence: string;  // Surrounding sentence context
  offset: number;
}
```

4. **Update `validateFinalReport()` to include sentence context in errors:**
```typescript
throw new Error(
  `Internal citation markers leaked into final report:\n` +
  violations.map(v => `- ${v.match} in: "${v.sentence}"`).join('\n')
);
```

---

### File 2: Update `supabase/functions/worker-proxy/index.ts`

**Changes:**

1. **Add missing patterns to `FORBIDDEN_PATTERNS_LINT`:**
```typescript
{ pattern: /\[step\d+\]/gi, name: '[stepN] reference' },
{ pattern: /\[Source\d*\]/gi, name: '[Source1] marker' },
```

2. **Update error response to include sentence context:**
```typescript
return jsonResponse({
  error: "Citation lint failed",
  message: "Internal citation markers leaked into final report",
  violations: violations.slice(0, 10).map(v => ({
    token: v.match,
    context: v.sentence
  })),
  hint: "..."
}, 400);
```

---

### File 3: Update `supabase/functions/process-grant-guidelines/index.ts`

**Changes:**

1. **Update `report_assembly` prompt generation** to include explicit anti-bracket rules:

Add to the assembly step prompt template:
```
CITATION FORMAT RULES (NON-NEGOTIABLE):
1. NEVER use bracketed internal markers: [S0-1], [article], [Source1], [step9], etc.
2. Convert source references to APA in-text citations: (Author, Year) or (Organisation, Year)
3. If author unknown: use (Publisher, Year)
4. Every numeric claim must have an APA in-text citation
5. If source_id is missing from Source Pack, replace claim with: "Unknown (no validated source found)"

FORBIDDEN OUTPUT PATTERNS (hard failure if present):
- Any [S#-#] pattern
- Any [step#] pattern  
- Any [Source#] pattern
- Any [article], [ref], [reference] markers
- Any {TBD} or $[Amount] placeholders
```

2. **Update `finalize_citations` step template:**

```
STEP N — Finalize Citations (APA Transformation + Hard Validation)

PURPOSE: Transform all internal source markers to APA format and validate no forbidden patterns remain.

PROCESS:
1. Build citation map: source_id → APA reference entry
2. For each internal marker in text:
   - If source exists: convert to (Author, Year) hyperlinked to #ref-N
   - If source missing: replace with "Unknown (no validated source found)" + add to unknowns[]
3. Build References section in valid APA format
4. Run final sanitizer pass removing any remaining forbidden tokens

REFERENCES LIST REQUIREMENTS:
- Each entry must have: Author/Org, Year, Title, Publisher (if different), URL/DOI
- No malformed stubs like "(2025)." with no title
- All entries must be hyperlinked to their URLs

HARD VALIDATION (fail run if any match):
- /\[[Ss]\d+-\d+\]/ (internal source IDs)
- /\[step\d+\]/ (step references)
- /\[Source\d+\]/ (source markers)
- /\{TBD\}/ (placeholders)
- /\[article\]/ (generic markers)

If violations found: output error listing exact tokens and surrounding sentences.

OUTPUT SCHEMA:
{
  "report_html": "string (final HTML with APA citations, no internal markers)",
  "references_html": "string (APA formatted references section)",
  "unknowns": [
    {
      "type": "citation_unresolved",
      "original_token": "string",
      "sentence_context": "string",
      "what_is_missing": "string",
      "what_would_validate": "string"
    }
  ],
  "validation": {
    "passed": boolean,
    "violations_found": number,
    "violations": ["string"]
  }
}
```

---

### File 4: Update `supabase/functions/recover-finalize-report/index.ts`

**Changes:**

1. **Add missing patterns to forbidden list**
2. **Update `normalizeCitationsInHtml()` to handle missing sources properly:**

```typescript
// When source not found in sourceMap:
if (!citationOrder.has(id)) {
  removed++;
  unknowns.push({
    type: 'citation_unresolved',
    original_token: fullMatch,
    sentence_context: extractSentence(html, offset),
    what_is_missing: `Source ${markerId} not in source pack`,
    what_would_validate: `Add source with id="${markerId}" to sources array`
  });
  return 'Unknown (no validated source found)';  // Instead of empty string
}
```

---

### File 5: Update `src/test/citationNormalizer.test.ts`

**Add test cases:**

```typescript
describe("step reference patterns", () => {
  it("should remove [step9] references", () => {
    const input = "<p>Data from [step9] shows growth.</p>";
    const result = sanitizeFinalReport(input);
    expect(result.html).not.toContain("[step9]");
  });

  it("should remove [Source1] markers", () => {
    const input = "<p>According to [Source1] the market is growing.</p>";
    const result = sanitizeFinalReport(input);
    expect(result.html).not.toContain("[Source1]");
  });
});

describe("APA citation format", () => {
  it("should convert [S0-1] to (Author, Year) format", () => {
    const sources = [{ id: "S0-1", authors: "Smith, J.", year: "2024", ... }];
    const result = convertToApaInText("<p>Market grew [S0-1].</p>", buildSourceMap(sources));
    expect(result.html).toContain("(Smith, J., 2024)");
    expect(result.html).not.toContain("[S0-1]");
  });

  it("should replace missing source with Unknown phrase", () => {
    const result = convertToApaInText("<p>Data [S0-999] unavailable.</p>", new Map());
    expect(result.html).toContain("Unknown (no validated source found)");
    expect(result.unknowns.length).toBe(1);
  });
});

describe("sentence context in errors", () => {
  it("should include surrounding sentence in validation errors", () => {
    const html = "<p>The market showed [S0-1] growth rates.</p>";
    expect(() => validateFinalReport(html)).toThrow(/growth rates/);
  });
});
```

---

## Technical Details

### APA In-Text Citation Format

| Scenario | Input | Output |
|----------|-------|--------|
| Author + Year available | `[S0-1]` where source has `authors: "Smith, J.", year: "2024"` | `<a href="#ref-1">(Smith, J., 2024)</a>` |
| Organisation only | `[S0-2]` where source has `publisher: "ABS", year: "2023"` | `<a href="#ref-2">(ABS, 2023)</a>` |
| No year | `[S0-3]` where source has `authors: "Jones"` | `<a href="#ref-3">(Jones, n.d.)</a>` |
| Source not found | `[S0-999]` | `Unknown (no validated source found)` + log to unknowns |

### Forbidden Patterns (Complete List)

```typescript
const FORBIDDEN_PATTERNS = [
  // Internal source ID formats
  /\[S\d+-[A-Z0-9]+\]/gi,           // [S0-1], [S12-3]
  /\[ARTICLE-\d+\]/gi,              // [ARTICLE-1]
  /\[SEARCH-\d+\]/gi,               // [SEARCH-1]
  /\[SOURCE-\d+\]/gi,               // [SOURCE-1]
  /\[step\d+\]/gi,                  // [step9]
  /\[Source\d*\]/gi,                // [Source1], [Source]
  
  // Generic markers
  /\[article\]/gi,                  // [article]
  /\[ref\]/gi,                      // [ref]
  /\[reference\d*\]/gi,             // [reference], [reference1]
  
  // Placeholders
  /\{TBD\}/gi,                      // {TBD}
  /\[TBD\]/gi,                      // [TBD]
  /\[Insert[^\]]*\]/gi,             // [Insert...]
  /\[PROJECT\s*NAME\]/gi,           // [PROJECT NAME]
  /\[COMPANY\]/gi,                  // [COMPANY]
  /\$\[[^\]]+\]/g,                  // $[Amount]
  
  // Undefined markers
  /undefined\s*\[/gi,               // undefined [
  /\]\s*undefined/gi,               // ] undefined
];
```

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/citationNormalizer.ts` | MODIFY | Add step patterns, APA format conversion, sentence context |
| `supabase/functions/worker-proxy/index.ts` | MODIFY | Add missing patterns, sentence context in errors |
| `supabase/functions/process-grant-guidelines/index.ts` | MODIFY | Update assembly prompts with anti-bracket rules |
| `supabase/functions/recover-finalize-report/index.ts` | MODIFY | Add patterns, "Unknown" replacement for missing sources |
| `src/test/citationNormalizer.test.ts` | MODIFY | Add tests for step patterns, APA format, sentence context |

---

## Acceptance Criteria

1. Final report contains NO bracketed source markers of any kind
2. Every numeric claim has an APA in-text citation `(Author, Year)` hyperlinked to references
3. References list contains only complete APA entries (no malformed stubs)
4. Missing sources are replaced with "Unknown (no validated source found)" and logged to unknowns
5. Hard failure gate shows exact token AND surrounding sentence when violations found
6. All new tests pass

