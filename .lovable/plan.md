
# Enhanced Citation Sanitization + Hard Failure Gate Implementation

## Summary

This plan extends the existing `citationNormalizer.ts` to add a robust `sanitizeFinalReport()` utility that:
1. Handles additional forbidden patterns (e.g., `$[Amount]`, `undefined` adjacent to markers)
2. Replaces removed markers with "(citation unavailable)" when removal would break meaning
3. Implements a hard failure gate that throws if forbidden tokens remain
4. Adds comprehensive tests for all edge cases

## Current State Analysis

The existing `citationNormalizer.ts` already handles:
- Internal source ID patterns: `[S0-1]`, `[ARTICLE-1]`, `[SEARCH-1]`
- Placeholder patterns: `{TBD}`, `[TBD]`, `[Insert...]`, `[PROJECT NAME]`
- Linting via `lintBracketTokens()` function

**Gaps identified:**
1. Missing `$[Amount]` and similar budget placeholder patterns
2. No detection of `undefined` adjacent to source markers
3. No "(citation unavailable)" replacement option for context preservation
4. No hard failure gate that throws errors
5. No dedicated `sanitizeFinalReport()` function
6. No tests for the normalization logic

## Implementation Plan

### File 1: Update `src/lib/citationNormalizer.ts`

**Changes:**

1. **Add new forbidden patterns:**
```typescript
// Budget placeholders: $[Amount], $[...]
{ pattern: /\$\[[^\]]+\]/g, name: 'Budget placeholder $[...]' },

// Curly brace placeholders
{ pattern: /\{[^}]+\}/g, name: 'Curly placeholder {...}' },

// "undefined" adjacent to brackets or markers
{ pattern: /undefined\s*\[/gi, name: 'undefined before marker' },
{ pattern: /\]\s*undefined/gi, name: 'undefined after marker' },
{ pattern: /\bundefined\b(?=\s*(?:S\d|Source|ref|ARTICLE))/gi, name: 'undefined near source ref' },

// Generic [article], [ref], [source] without numbers
{ pattern: /\[article\]/gi, name: '[article]' },
{ pattern: /\[ref\]/gi, name: '[ref]' },
{ pattern: /\[source\d*\]/gi, name: '[source] or [source1]' },
```

2. **Add `sanitizeFinalReport()` function:**
```typescript
export interface SanitizationResult {
  html: string;
  removedTokens: UnknownEntry[];
  stats: {
    tokensRemoved: number;
    tokensReplaced: number;
  };
}

export function sanitizeFinalReport(
  html: string,
  options: { 
    preserveContext?: boolean;  // Replace with "(citation unavailable)" instead of removing
    failOnViolations?: boolean; // Throw error if violations remain
  } = {}
): SanitizationResult;
```

3. **Add hard failure validation function:**
```typescript
export function validateFinalReport(html: string): void {
  // Throws Error if forbidden patterns found
  // Checks for:
  // - Any /\[[^\]]+\]/ not linked to #ref-N
  // - Any $[...]
  // - Any {...} (except style attributes)
  // - "undefined" adjacent to markers
}
```

4. **Update the forbidden patterns list** to be more comprehensive

### File 2: Update `src/lib/htmlReportUtils.ts`

**Changes:**

1. **Import and integrate `sanitizeFinalReport`:**
```typescript
import { 
  sanitizeFinalReport,
  validateFinalReport,
  // ... existing imports
} from "./citationNormalizer";
```

2. **Update `normalizeReportWithCitations()` to call sanitizer:**
```typescript
export function normalizeReportWithCitations(...) {
  // ... existing normalization
  
  // Run final sanitizer pass
  const sanitized = sanitizeFinalReport(result.html, {
    preserveContext: false,
    failOnViolations: false, // Client-side shouldn't throw
  });
  
  return {
    html: sanitized.html,
    // ... rest
  };
}
```

3. **Add `validateNoForbiddenTokens()` function** for explicit validation

### File 3: Update `supabase/functions/worker-proxy/index.ts`

**Changes:**

1. **Add hard failure gate in `handleSaveReport()`:**
```typescript
// After existing lintReportHtml check
// Add hard failure for "undefined" adjacent to markers
const undefinedPattern = /undefined\s*\[|\]\s*undefined|\bundefined\b(?=\s*S\d)/gi;
if (undefinedPattern.test(reportHtml)) {
  return jsonResponse({
    error: "Hard failure: 'undefined' found adjacent to source markers",
    message: "Internal citation markers leaked into final report",
    violations: ["undefined adjacent to marker detected"],
  }, 400);
}

// Add $[...] check
const budgetPlaceholderPattern = /\$\[[^\]]+\]/g;
if (budgetPlaceholderPattern.test(reportHtml)) {
  // Extract matches and return error
}
```

2. **Update error message to match spec:**
   "Internal citation markers leaked into final report"

### File 4: Update `supabase/functions/process-grant-guidelines/index.ts`

**Changes to assembly step prompts:**

1. **Update `assemble_sections_html` step:**
   - Add explicit instruction to NEVER use bracketed citations
   - Instruct to use source_ids WITHOUT brackets in narrative
   - Prefer inline (Author, Year) when metadata available

2. **Update `clean_citations_apa` step:**
   - Add `$[Amount]` to forbidden patterns list
   - Add `undefined` detection instruction
   - Strengthen validation requirements

3. **Update `finalize_report_html` step:**
   - Add final sanitizer pass instructions
   - Add hard fail validation requirements

### File 5: Create `src/test/citationNormalizer.test.ts`

**New test file with comprehensive test cases:**

```typescript
import { describe, it, expect } from "vitest";
import { 
  sanitizeFinalReport, 
  lintBracketTokens,
  normalizeReportHtml,
  validateFinalReport,
} from "../lib/citationNormalizer";

describe("citationNormalizer", () => {
  describe("sanitizeFinalReport", () => {
    it("should remove [S0-1] internal markers", () => {
      const input = "<p>This is a claim [S0-1] with citation.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toContain("[S0-1]");
      expect(result.removedTokens.length).toBeGreaterThan(0);
    });

    it("should remove [article] placeholder", () => {
      const input = "<p>According to the study [article], results show...</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toContain("[article]");
    });

    it("should remove $[Amount] budget placeholders", () => {
      const input = "<p>The budget is $[Amount] million.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toContain("$[Amount]");
    });

    it("should detect and remove undefined adjacent to markers", () => {
      const input = "<p>This undefined [S0-1] is broken.</p>";
      const result = sanitizeFinalReport(input);
      expect(result.html).not.toMatch(/undefined\s*\[/);
    });

    it("should preserve linked numeric citations [1]", () => {
      const input = '<p>Citation <a href="#ref-1">[1]</a> is valid.</p>';
      const result = sanitizeFinalReport(input);
      expect(result.html).toContain('[1]');
    });
  });

  describe("lintBracketTokens", () => {
    it("should pass for clean HTML with linked citations", () => {
      const html = '<p>Claim <a href="#ref-1">[1]</a> is cited.</p>';
      const result = lintBracketTokens(html);
      expect(result.passed).toBe(true);
    });

    it("should fail for internal source IDs", () => {
      const html = "<p>Claim [S0-1] has internal ID.</p>";
      const result = lintBracketTokens(html);
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe("validateFinalReport (hard fail)", () => {
    it("should throw for remaining internal markers", () => {
      const html = "<p>Leaked [S0-1] marker.</p>";
      expect(() => validateFinalReport(html)).toThrow(
        "Internal citation markers leaked into final report"
      );
    });

    it("should not throw for clean report", () => {
      const html = '<p>Clean <a href="#ref-1">[1]</a> report.</p>';
      expect(() => validateFinalReport(html)).not.toThrow();
    });
  });
});
```

## Technical Details

### Sanitizer Algorithm

```typescript
function sanitizeFinalReport(html: string, options = {}): SanitizationResult {
  const { preserveContext = false, failOnViolations = false } = options;
  const removedTokens: UnknownEntry[] = [];
  let sanitized = html;
  let tokensRemoved = 0;
  let tokensReplaced = 0;

  // Pattern matching order:
  // 1. Specific internal ID patterns first
  // 2. Generic bracket tokens last

  for (const { pattern, name } of FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, (match, ...args) => {
      const offset = args[args.length - 2]; // Second to last arg is offset
      
      removedTokens.push({
        type: 'citation_unresolved',
        original_token: match,
        location_hint: extractLocationHint(html, offset),
        what_is_missing: `Unresolved ${name}`,
        what_would_validate: 'Valid source in source pack'
      });

      if (preserveContext && wouldBreakMeaning(html, offset, match)) {
        tokensReplaced++;
        return '(citation unavailable)';
      }
      
      tokensRemoved++;
      return '';
    });
  }

  // Clean up orphan artifacts
  sanitized = cleanupOrphans(sanitized);

  // Hard fail check
  if (failOnViolations) {
    const remaining = lintBracketTokens(sanitized);
    if (!remaining.passed) {
      throw new Error(
        `Internal citation markers leaked into final report: ${remaining.violations.slice(0, 3).join(', ')}`
      );
    }
  }

  return {
    html: sanitized,
    removedTokens,
    stats: { tokensRemoved, tokensReplaced }
  };
}
```

### Hard Failure Gate

The hard failure triggers in `worker-proxy` when:
1. Any `/\[[^\]]+\]/` pattern exists that isn't a linked `<a href="#ref-N">[N]</a>`
2. Any `$[...]` budget placeholder exists
3. `undefined` appears adjacent to a source marker
4. Any `{...}` curly brace placeholder exists (excluding `style="{...}"`)

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/citationNormalizer.ts` | MODIFY | Add `sanitizeFinalReport()`, `validateFinalReport()`, expand patterns |
| `src/lib/htmlReportUtils.ts` | MODIFY | Integrate sanitizer into normalization pipeline |
| `supabase/functions/worker-proxy/index.ts` | MODIFY | Add hard failure gate with expanded patterns |
| `supabase/functions/process-grant-guidelines/index.ts` | MODIFY | Update assembly prompts with stricter rules |
| `src/test/citationNormalizer.test.ts` | CREATE | Comprehensive test suite |

## Acceptance Criteria

1. `[S0-1]`, `[article]`, `[Source1]` - all removed from output
2. `$[Amount]` - removed from output
3. `undefined` adjacent to markers - triggers hard failure
4. `{TBD}` and similar - removed from output
5. Tests pass for all edge cases
6. Clean reports with linked `[1]` citations pass validation
