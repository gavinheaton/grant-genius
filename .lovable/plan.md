

# Citation Normalizer + Bracket Token Linter Implementation

## Overview

This implementation creates a robust, multi-layer citation normalization and bracket token elimination system that ensures **zero internal markers** appear in final report outputs (HTML and DOCX).

## Architecture

The system consists of three main components that run at multiple pipeline stages:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       Citation Processing Pipeline                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Step 0 (Source Pack)                                                   │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1. SOURCE MAP BUILDER                                           │   │
│  │     - Parse step0.sources[] into sourceById lookup               │   │
│  │     - Create fuzzy recovery index (title+publisher+year)         │   │
│  │     - Build alias map for [article], [Source1] recovery          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  2. CITATION NORMALIZER + LINKER                                 │   │
│  │     - Replace [S0-1] → [1] (linked to #ref-1)                    │   │
│  │     - Handle multi-markers [S0-1, S0-2] → [1, 2]                 │   │
│  │     - Preserve trailing punctuation                              │   │
│  │     - Log unresolved markers to unknowns[]                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  3. PLACEHOLDER RESOLVER                                         │   │
│  │     - Map [Project Title] → requiredInputs.project_title         │   │
│  │     - Remove unresolved placeholders (log to unknowns[])         │   │
│  │     - Handle [Insert...], [Company], [Lead University]           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  4. REFERENCES BUILDER                                           │   │
│  │     - Collect used source_ids from normalized text               │   │
│  │     - Generate APA references with anchor targets                │   │
│  │     - Build <ol id="references">...</ol> section                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  5. BRACKET TOKEN LINTER (HARD FAIL)                             │   │
│  │     - Scan for /\[[^\]]+\]/ patterns                             │   │
│  │     - Allow ONLY /^\[\d+\]$/ when linked to #ref-N               │   │
│  │     - Block all other brackets, curly placeholders               │   │
│  │     - FAIL pipeline if violations found                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### File 1: `src/lib/citationNormalizer.ts` (NEW)

A shared utility module providing citation normalization functions usable by both client-side rendering and backend processing.

**Key Functions:**

```typescript
// Source map types
interface SourceEntry {
  id: string;
  title?: string;
  publisher?: string;
  authors?: string;
  year?: string;
  url?: string;
  dateAccessed?: string;
}

interface CitationIndex {
  sourceById: Map<string, SourceEntry>;
  citationOrder: Map<string, number>;  // S0-1 → 1 (first appearance order)
  usedSourceIds: Set<string>;
}

interface NormalizationResult {
  normalizedHtml: string;
  citationIndex: CitationIndex;
  unknowns: UnknownEntry[];
  referencesHtml: string;
}

interface UnknownEntry {
  type: 'citation_unresolved' | 'applicant_input_missing';
  original_token: string;
  location_hint: string;
  what_is_missing: string;
  what_would_validate: string;
}

// Core functions
function buildSourceMap(sources: SourceEntry[]): Map<string, SourceEntry>;
function normalizeCitations(html: string, sourceMap: Map<string, SourceEntry>, requiredInputs: Record<string, string>): NormalizationResult;
function buildReferencesSection(citationIndex: CitationIndex, sourceMap: Map<string, SourceEntry>): string;
function lintBracketTokens(html: string): { passed: boolean; violations: string[] };
function resolvePlaceholders(html: string, requiredInputs: Record<string, string>): { html: string; unknowns: UnknownEntry[] };
```

**Citation Style Decision: Numeric Linked Citations**

The implementation uses numeric footnote-style citations `[1]`, `[2]`, etc. because:
- More compact than author-year for dense reports
- Clear visual distinction from prose
- Easy to cross-reference to numbered references list
- HTML anchoring is straightforward

**Alias Recovery Table:**

```typescript
const ALIAS_MAP: Record<string, string> = {
  'article': 'ARTICLE-1',
  'source1': 'S0-1',
  'source 1': 'S0-1',
  'source2': 'S0-2',
  'source 2': 'S0-2',
  // Extended at runtime from step0 sources
};
```

---

### File 2: Update `src/lib/htmlReportUtils.ts`

Integrate the citation normalizer into the existing HTML cleanup pipeline.

**Changes:**
1. Import `citationNormalizer` functions
2. Update `sanitizeHtml()` to run citation normalization before stripping
3. Add `normalizeReportCitations()` function for full pipeline
4. Enhance `validateNoInternalMarkers()` with linter integration

---

### File 3: Update `supabase/functions/process-grant-guidelines/index.ts`

Update the pipeline generation prompts to enforce the new citation style.

**Key Changes to Assembly Steps:**

**Step N-2 (assemble_sections_html):**
- Add explicit instruction to use `[S0-1]` format consistently
- Add instruction to consolidate multiple markers: `[S0-1, S0-2]`

**Step N-1 (clean_citations_apa) - MAJOR REWRITE:**
- Change from APA author-year to numeric linked citations
- Build citation order based on first appearance
- Replace `[S0-1]` → `<a href="#ref-1">[1]</a>`
- Add HARD FAIL instruction if any unlinked brackets remain

**Step N (finalize_report_html):**
- Add final lint pass with explicit regex patterns
- Add HALT instruction if lint fails

---

### File 4: Update `supabase/functions/worker-proxy/index.ts`

Add citation normalization to the `save_report` action.

**Changes:**
1. Before saving, run `normalizeCitations()` on content
2. Run `lintBracketTokens()` as validation gate
3. If lint fails, return error with violations list
4. Log normalization stats (citations resolved, removed, etc.)

---

### File 5: Update `supabase/functions/generate-docx/index.ts`

Apply citation normalization before DOCX generation.

**Changes:**
1. Import/inline citation normalization logic (Deno-compatible)
2. Normalize HTML content before parsing
3. Ensure numeric citations render correctly in Word

---

### File 6: Update `supabase/functions/recover-finalize-report/index.ts`

Add citation normalization to recovery flow.

**Changes:**
1. Run normalization on recovered report_html
2. Run lint validation before saving
3. Log recovery normalization stats

---

## Detailed Implementation

### Citation Normalization Algorithm

```typescript
function normalizeCitations(
  html: string, 
  sourceMap: Map<string, SourceEntry>,
  requiredInputs: Record<string, string>
): NormalizationResult {
  const citationOrder = new Map<string, number>();
  const usedSourceIds = new Set<string>();
  const unknowns: UnknownEntry[] = [];
  let nextCitationNum = 1;
  let normalizedHtml = html;

  // STEP 1: Resolve placeholders first
  const placeholderResult = resolvePlaceholders(normalizedHtml, requiredInputs);
  normalizedHtml = placeholderResult.html;
  unknowns.push(...placeholderResult.unknowns);

  // STEP 2: Find all source markers
  // Patterns: [S0-1], [S12-3], [S0-A1], [ARTICLE-1], [SEARCH-2], [article]
  const markerPattern = /\[([A-Za-z]+[\d]*-?[\w]*)\]/g;
  
  // First pass: build citation order
  let match;
  while ((match = markerPattern.exec(normalizedHtml)) !== null) {
    const markerId = match[1].toUpperCase();
    const sourceId = resolveMarkerId(markerId, sourceMap);
    
    if (sourceId && sourceMap.has(sourceId)) {
      if (!citationOrder.has(sourceId)) {
        citationOrder.set(sourceId, nextCitationNum++);
        usedSourceIds.add(sourceId);
      }
    }
  }

  // Second pass: replace markers with linked citations
  normalizedHtml = normalizedHtml.replace(
    /\[([A-Za-z]+[\d]*-?[\w]*(?:\s*,\s*[A-Za-z]+[\d]*-?[\w]*)*)\]/g,
    (fullMatch, markerGroup) => {
      const markers = markerGroup.split(/\s*,\s*/);
      const nums: number[] = [];
      
      for (const marker of markers) {
        const markerId = marker.trim().toUpperCase();
        const sourceId = resolveMarkerId(markerId, sourceMap);
        
        if (sourceId && citationOrder.has(sourceId)) {
          nums.push(citationOrder.get(sourceId)!);
        } else {
          // Unresolved - log and skip
          unknowns.push({
            type: 'citation_unresolved',
            original_token: `[${marker}]`,
            location_hint: extractLocationHint(normalizedHtml, fullMatch),
            what_is_missing: 'Source not found in source pack',
            what_would_validate: 'Valid source entry in step0.sources[]'
          });
        }
      }
      
      if (nums.length === 0) {
        return ''; // Remove unresolved markers
      }
      
      // Build linked citation
      const links = nums.map(n => 
        `<a href="#ref-${n}" class="citation-link">[${n}]</a>`
      );
      return links.join('');
    }
  );

  // STEP 3: Build references section
  const referencesHtml = buildReferencesSection(
    { sourceById: sourceMap, citationOrder, usedSourceIds },
    sourceMap
  );

  return {
    normalizedHtml,
    citationIndex: { sourceById: sourceMap, citationOrder, usedSourceIds },
    unknowns,
    referencesHtml
  };
}
```

### Placeholder Resolver

```typescript
function resolvePlaceholders(
  html: string, 
  requiredInputs: Record<string, string>
): { html: string; unknowns: UnknownEntry[] } {
  const unknowns: UnknownEntry[] = [];
  
  // Build label-to-key mapping (case-insensitive, whitespace-normalized)
  const labelMap = new Map<string, string>();
  for (const [key, value] of Object.entries(requiredInputs)) {
    const normalizedLabel = key.toLowerCase().replace(/[_-]/g, ' ').trim();
    labelMap.set(normalizedLabel, value);
  }
  
  // Match placeholders: [Project Title], [Lead University Name], [Insert X], etc.
  const placeholderPattern = /\[([A-Za-z][A-Za-z\s]+?)\]/g;
  
  const result = html.replace(placeholderPattern, (fullMatch, label) => {
    const normalizedLabel = label.toLowerCase().trim();
    
    // Check for "Insert" prefix - always remove
    if (normalizedLabel.startsWith('insert')) {
      unknowns.push({
        type: 'applicant_input_missing',
        original_token: fullMatch,
        location_hint: 'Placeholder in report body',
        what_is_missing: `Value for "${label}"`,
        what_would_validate: 'Applicant-provided input'
      });
      return '';
    }
    
    // Try to find matching input
    const matchedValue = labelMap.get(normalizedLabel);
    if (matchedValue) {
      return matchedValue;
    }
    
    // Not found - remove and log
    unknowns.push({
      type: 'applicant_input_missing',
      original_token: fullMatch,
      location_hint: 'Placeholder in report body',
      what_is_missing: `Value for "${label}"`,
      what_would_validate: `requiredInputs.${label.toLowerCase().replace(/\s+/g, '_')}`
    });
    return '';
  });
  
  return { html: result, unknowns };
}
```

### Bracket Token Linter

```typescript
function lintBracketTokens(html: string): { passed: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Find all bracket tokens
  const bracketPattern = /\[([^\]]+)\]/g;
  let match;
  
  while ((match = bracketPattern.exec(html)) !== null) {
    const content = match[1];
    const fullMatch = match[0];
    
    // ALLOWED: Numeric citations that are hyperlinked [1], [2], etc.
    if (/^\d+$/.test(content)) {
      // Check if this is inside an <a> tag with href="#ref-N"
      const beforeContext = html.substring(Math.max(0, match.index - 100), match.index);
      if (beforeContext.includes('href="#ref-')) {
        continue; // Valid linked citation
      }
    }
    
    // Everything else is a violation
    violations.push(fullMatch);
  }
  
  // Check for curly placeholders
  const curlyPattern = /\{([^}]+)\}/g;
  while ((match = curlyPattern.exec(html)) !== null) {
    violations.push(match[0]);
  }
  
  // Check for "Source N" patterns
  const sourceNPattern = /\bSource\s+\d+\b/gi;
  while ((match = sourceNPattern.exec(html)) !== null) {
    violations.push(match[0]);
  }
  
  // Check for TBD
  if (/\bTBD\b/i.test(html)) {
    violations.push('TBD');
  }
  
  return {
    passed: violations.length === 0,
    violations: [...new Set(violations)] // Dedupe
  };
}
```

### References Builder

```typescript
function buildReferencesSection(
  citationIndex: CitationIndex,
  sourceMap: Map<string, SourceEntry>
): string {
  const entries: { num: number; sourceId: string; entry: SourceEntry }[] = [];
  
  for (const [sourceId, num] of citationIndex.citationOrder) {
    const entry = sourceMap.get(sourceId);
    if (entry) {
      entries.push({ num, sourceId, entry });
    }
  }
  
  // Sort by citation number
  entries.sort((a, b) => a.num - b.num);
  
  const listItems = entries.map(({ num, entry }) => {
    const author = entry.authors || entry.publisher || 'Unknown';
    const year = entry.year || 'n.d.';
    const title = entry.title || 'Untitled';
    const publisher = entry.publisher || '';
    const url = entry.url || '';
    
    // APA format: Author. (Year). Title. Publisher. URL
    let citation = `${author}. (${year}). ${title}.`;
    if (publisher && publisher !== author) {
      citation += ` ${publisher}.`;
    }
    
    const urlHtml = url 
      ? ` <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
      : ' <em>URL not available</em>';
    
    return `<li id="ref-${num}">${citation}${urlHtml}</li>`;
  });
  
  return `
<section class="references-section">
  <h2>References</h2>
  <ol class="references-list">
    ${listItems.join('\n    ')}
  </ol>
</section>`;
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/citationNormalizer.ts` | CREATE | Core citation normalization utility |
| `src/lib/htmlReportUtils.ts` | MODIFY | Integrate normalizer into sanitize pipeline |
| `supabase/functions/process-grant-guidelines/index.ts` | MODIFY | Update assembly step prompts for numeric citations |
| `supabase/functions/worker-proxy/index.ts` | MODIFY | Add normalization gate to save_report |
| `supabase/functions/generate-docx/index.ts` | MODIFY | Add normalization before DOCX generation |
| `supabase/functions/recover-finalize-report/index.ts` | MODIFY | Add normalization to recovery flow |

---

## Acceptance Tests

1. **No internal markers remain:**
   - Final output contains zero occurrences of: `[S0-`, `[article]`, `[Source`, `[Project`, `{TBD}`

2. **Every in-text citation links to a reference entry:**
   - All `[N]` citations have matching `<a href="#ref-N">` wrapper
   - All `#ref-N` anchors exist in References section

3. **Every reference entry is cited at least once:**
   - No orphan references (unless explicitly marked as background sources)

4. **Missing sources are handled gracefully:**
   - Unresolved markers are removed (not left as broken tokens)
   - `unknowns[]` records what was removed and why

5. **Required Inputs placeholders are always resolved or removed:**
   - `[Project Title]` replaced with actual value or removed
   - No bracketed applicant placeholders in final output

---

## Integration Points

### Client-Side (Report Viewer)
- `HtmlReportViewer` calls `sanitizeHtml()` which now runs normalization
- Legacy reports are cleaned at render time as fallback

### Backend (Worker-Proxy)
- `save_report` action validates with linter before saving
- Returns 400 error if violations found (worker must retry or fix)

### External Worker (Cloud Run/Replit)
- Worker should run its own normalization before calling `save_report`
- Can rely on worker-proxy as final safety net

### DOCX Export
- `generate-docx` normalizes HTML before parsing to Word elements
- Ensures clean export even for older reports

