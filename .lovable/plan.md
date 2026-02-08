
# Report Assembly + Citation Finalization: Complete Sanitization System

## Summary

Implement a comprehensive sanitization system ensuring no bracketed internal markers, source IDs, or placeholders ever appear in final report output. This includes a new **Pre-Assembly Sanitiser** step, enhanced **Citations Validation Gate**, and expanded forbidden pattern coverage for single-letter stand-ins like `$Z`, `A%`, and `B additional jobs`.

## Current State Analysis

The codebase already has substantial citation normalization infrastructure:

| Component | Location | Current State |
|-----------|----------|---------------|
| Citation Normalizer | `src/lib/citationNormalizer.ts` | Handles `[S0-1]`, `{TBD}`, `$[Amount]`, `[article]` removal + APA conversion |
| Worker Proxy Lint | `worker-proxy/index.ts` | FORBIDDEN_PATTERNS_LINT with hard failure gate |
| Recovery Finalize | `recover-finalize-report/index.ts` | Citation normalization during recovery |
| Quality Gate | `pipelineQualityGate.ts` | Validates pipeline prompts (not outputs) |

## Gaps to Address

| Gap | Current State | Required State |
|-----|---------------|----------------|
| Single-letter stand-ins | Not covered | Add patterns: `B additional`, `C employees`, `X million` |
| Pre-assembly sanitiser | Does not exist | New step scanning all outputs before assembly |
| Citations validation gate | Partial (in worker-proxy) | Full bidirectional validation + orphan cleanup |
| Proxy protocol enforcement | In prompts only | Runtime enforcement with rewrite capability |
| Evidence-type mismatch | In prompts only | Runtime detection + "Unknown (evidence type mismatch)" |
| Malformed references | No validation | "n.d." only when genuinely no date, include retrieval date |

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Pre-Assembly + Citations Validation System               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Research Steps Complete                                                    │
│       │                                                                     │
│       ▼                                                                     │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  NEW: Pre-Assembly Sanitiser (pre_assembly_sanitiser)               │    │
│  │                                                                     │    │
│  │  1. Scan ALL step outputs for forbidden tokens:                     │    │
│  │     - [S0-1], [ARTICLE-1], [step9], [Source1]                       │    │
│  │     - {TBD}, $[Amount], [Insert...], [PROJECT NAME]                 │    │
│  │     - $Z, A%, B%, C%, "B additional jobs", "X million"              │    │
│  │                                                                     │    │
│  │  2. Produce issues_found[]:                                         │    │
│  │     { location, offending_text, token_type, fix_applied }           │    │
│  │                                                                     │    │
│  │  3. Rewrite offending content:                                      │    │
│  │     - If number missing: apply proxy protocol → show method         │    │
│  │     - If citation unresolved: → "Unknown (no validated source)"     │    │
│  │     - If evidence mismatch: → "Unknown (evidence type mismatch)"    │    │
│  │                                                                     │    │
│  │  4. Output: clean_step_outputs (sanitized versions for assembly)    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│       │                                                                     │
│       ▼                                                                     │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  report_assembly (uses clean_step_outputs)                          │    │
│  │  - Assembles assessor-ready report from sanitized inputs            │    │
│  │  - Uses APA in-text citations only                                  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│       │                                                                     │
│       ▼                                                                     │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  ENHANCED: finalize_citations (Citations Validation Gate)           │    │
│  │                                                                     │    │
│  │  Bidirectional Validation:                                          │    │
│  │  1. Every in-text citation → must map to exactly one Reference      │    │
│  │  2. Every Reference entry → must be cited at least once OR removed  │    │
│  │  3. No malformed "n.d." unless genuinely no date (add retrieval)    │    │
│  │  4. Final forbidden pattern scan                                    │    │
│  │                                                                     │    │
│  │  Output: citation_audit[] with compliance status                    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│       │                                                                     │
│       ▼                                                                     │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  worker-proxy save_report (Hard Failure Gate)                       │    │
│  │  - Enhanced FORBIDDEN_PATTERNS_LINT with all new patterns           │    │
│  │  - Returns 400 with exact violations + sentence context             │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### File 1: Update `src/lib/citationNormalizer.ts`

Add new forbidden patterns for single-letter placeholders and enhanced validation.

**Changes:**

1. **Expand FORBIDDEN_PATTERNS with single-letter stand-ins:**

```typescript
// Add to existing FORBIDDEN_PATTERNS array:

// Single-letter quantity placeholders (assessor-grade requirement)
{ pattern: /\$Z\b/gi, name: '$Z placeholder' },
{ pattern: /\bA%\b/g, name: 'A% placeholder' },
{ pattern: /\bB%\b/g, name: 'B% placeholder' },
{ pattern: /\bC%\b/g, name: 'C% placeholder' },

// Single-letter stand-in quantities in sentences
{ pattern: /\b[A-Z]\s+(?:additional|new|total|more)\s+(?:jobs?|employees?|FTEs?|staff|positions?)/gi, 
  name: 'Single-letter job count placeholder' },
{ pattern: /\$[A-Z]\s+(?:million|billion|thousand|AUD|USD)/gi, 
  name: 'Single-letter currency placeholder' },
{ pattern: /\b[XYZ]\s+(?:million|billion|percent|%)/gi, 
  name: 'X/Y/Z placeholder' },
```

2. **Add new function `scanForForbiddenTokens()`:**

Returns structured issues_found array with location, offending text, and token type.

```typescript
export interface SanitizationIssue {
  location: string;           // e.g., "step3.market_sizing.tam"
  offending_text: string;     // e.g., "B additional jobs"
  token_type: 'internal_source_id' | 'placeholder' | 'single_letter_standin' | 'evidence_mismatch';
  sentence_context: string;   // Surrounding text
  fix_applied: 'removed' | 'replaced_with_unknown' | 'proxy_applied' | 'pending';
}

export function scanForForbiddenTokens(
  content: string | Record<string, unknown>,
  locationPrefix: string = ''
): SanitizationIssue[];
```

3. **Add `sanitizeStepOutputs()` function:**

Processes all step outputs and returns clean versions for assembly.

```typescript
export interface CleanStepOutputs {
  clean_outputs: Record<string, unknown>;
  issues_found: SanitizationIssue[];
  unknowns: UnknownEntry[];
}

export function sanitizeStepOutputs(
  stepOutputs: Record<string, unknown>,
  sourceMap: Map<string, SourceEntry>
): CleanStepOutputs;
```

4. **Add `validateCitationBidirectional()` function:**

Ensures every in-text citation maps to a reference and vice versa.

```typescript
export interface CitationValidationResult {
  passed: boolean;
  orphan_citations: string[];      // In-text citations with no reference
  orphan_references: string[];     // References never cited
  malformed_dates: string[];       // "n.d." without retrieval date
  fix_actions: string[];           // What was fixed
}

export function validateCitationBidirectional(
  reportHtml: string,
  referencesHtml: string
): CitationValidationResult;
```

---

### File 2: Update `supabase/functions/worker-proxy/index.ts`

Expand the lint validation gate with new patterns.

**Changes:**

1. **Add new patterns to `FORBIDDEN_PATTERNS_LINT`:**

```typescript
// Single-letter quantity placeholders
{ pattern: /\$Z\b/gi, name: '$Z placeholder' },
{ pattern: /\bA%\b/g, name: 'A% placeholder' },
{ pattern: /\bB%\b/g, name: 'B% placeholder' },  
{ pattern: /\bC%\b/g, name: 'C% placeholder' },

// Single-letter stand-ins in context
{ pattern: /\b[A-Z]\s+(?:additional|new|total)\s+(?:jobs?|employees?|FTEs?)/gi, 
  name: 'Single-letter job placeholder' },
{ pattern: /\$[A-Z]\s+(?:million|billion)/gi, 
  name: 'Single-letter currency' },
{ pattern: /\b[XYZ]\s+(?:million|billion|percent)/gi, 
  name: 'X/Y/Z placeholder' },

// Unclosed internal source ID patterns (no brackets but still forbidden)
{ pattern: /\bS\d+-\d+\b(?!["\'])/gi, name: 'Naked source ID S0-1' },
```

2. **Add malformed reference detection:**

```typescript
// In lintReportHtml or new function:
function detectMalformedReferences(html: string): LintViolation[] {
  const violations: LintViolation[] = [];
  
  // Find "n.d." without retrieval date
  const ndPattern = /\(n\.d\.\)(?!.*Retrieved)/gi;
  // ... implementation
  
  return violations;
}
```

---

### File 3: Update `src/lib/bundleGeneratorSpec.ts`

Add the **pre_assembly_sanitiser** step template and update finalize_citations template.

**Changes:**

1. **Add new `pre_assembly_sanitiser` step to `createHtmlAssemblySteps()`:**

```typescript
// Insert as first assembly step (before assemble_sections_html):
{
  step_name: "pre_assembly_sanitiser",
  step_description: "Scan all step outputs for forbidden tokens and produce clean versions for assembly",
  phase: "assembly" as const,
  model_tier: "lite" as const,
  prompt_template: `STEP ${maxAIStep + 1} — Pre-Assembly Sanitiser

PURPOSE:
Scan ALL previous step outputs for forbidden tokens, internal markers, and placeholders.
Produce clean_step_outputs that report_assembly will use.

INPUTS:
- All prior step outputs: ${stepRefs}
- Source Pack: {{step0}}

FORBIDDEN TOKENS TO DETECT AND REMOVE:
1. Internal source IDs: [S0-1], [ARTICLE-1], [SEARCH-1], [SOURCE-1], [step9]
2. Placeholders: {TBD}, [TBD], [Insert...], [PROJECT NAME], [COMPANY]
3. Budget placeholders: $[Amount], $[...], $Z
4. Single-letter stand-ins: A%, B%, C%, "B additional jobs", "X million"
5. Generic markers: [article], [Source1], Source 1, Source 2
6. Undefined markers: undefined [, ] undefined

FOR EACH FORBIDDEN TOKEN FOUND:
1. Log to issues_found[] with:
   - location: step name + field path (e.g., "step3.market_sizing.tam")
   - offending_text: the exact forbidden text
   - token_type: category of violation
   - sentence_context: surrounding sentence

2. Apply fix based on type:
   - Internal source ID → Look up in Source Pack, convert to (Author, Year)
   - If source not found → "Unknown (no validated source found)"
   - Number placeholder ($Z, A%) → Apply proxy protocol OR mark as "Unknown (calculation required)"
   - Evidence type mismatch → "Unknown (evidence type mismatch)"

OUTPUT JSON SCHEMA:
{
  "clean_step_outputs": {
    "step0": { /* sanitized version of step0 */ },
    "step1": { /* sanitized version of step1 */ },
    // ... all steps with forbidden tokens removed/replaced
  },
  "issues_found": [
    {
      "location": "step3.tam.value",
      "offending_text": "$Z million",
      "token_type": "single_letter_standin",
      "sentence_context": "The TAM is estimated at $Z million based on...",
      "fix_applied": "replaced_with_unknown"
    }
  ],
  "unknowns": [
    {
      "type": "calculation_required",
      "original_token": "$Z million",
      "what_is_missing": "Actual TAM value",
      "what_would_validate": "Market research report with AU market size"
    }
  ]
}`
}
```

2. **Update `finalize_citations` step template to include Citations Validation Gate:**

Add explicit bidirectional validation requirements.

---

### File 4: Update `supabase/functions/process-grant-guidelines/index.ts`

Inject the pre_assembly_sanitiser into generated pipelines.

**Changes:**

1. **Update pipeline generation prompt** to include pre_assembly_sanitiser as mandatory step:

```
Final Steps (must exist in order):

N-2: pre_assembly_sanitiser
  - Scans all prior step outputs for forbidden tokens
  - Produces clean_step_outputs for report_assembly
  - Logs issues_found[] with location, token, fix_applied
  
N-1: report_assembly
  - Uses clean_step_outputs from pre_assembly_sanitiser
  - Assembles assessor-ready report with APA citations
  
N: finalize_citations
  - Bidirectional validation: every citation ↔ reference
  - Remove orphan references (never cited)
  - Fix malformed "n.d." citations (add retrieval date if genuine)
```

2. **Add pre_assembly_sanitiser to validation checks:**

```typescript
// In pipeline validation
if (!stepNames.includes('pre_assembly_sanitiser')) {
  console.warn("Missing pre_assembly_sanitiser step - will be added before report_assembly");
}
```

---

### File 5: Update `src/lib/pipelineQualityGate.ts`

Add pre_assembly_sanitiser to core steps and validation.

**Changes:**

1. **Add to CORE_STEP_NAMES:**

```typescript
export const CORE_STEP_NAMES = [
  'build_source_pack',
  'rubric_traceability_matrix',
  'assessor_insight_layer',
  'assumptions_register',
  'tam_sam_som_dual_methodology',
  'comparables_market_signals',
  'additionality_and_benefit_case',
  'commercialisation_logic',
  'risk_register_and_governance',
  'budget_logic_and_value_for_money',
  'pre_assembly_sanitiser',  // NEW
  'report_assembly',
  'finalize_citations',
] as const;
```

2. **Update MINIMUM_TOTAL_STEPS:**

```typescript
const MINIMUM_TOTAL_STEPS = 13; // Was 12, now includes pre_assembly_sanitiser
```

3. **Add red flag detection for pre_assembly_sanitiser:**

```typescript
// In detectRedFlags():
const sanitiserStep = steps.find(s => s.step_name === 'pre_assembly_sanitiser');
if (sanitiserStep) {
  const prompt = sanitiserStep.prompt_template.toLowerCase();
  
  const hasForbiddenTokenScan = prompt.includes('forbidden') || prompt.includes('scan');
  const hasIssuesOutput = prompt.includes('issues_found') || prompt.includes('issues[]');
  
  if (!hasForbiddenTokenScan || !hasIssuesOutput) {
    flags.push('pre_assembly_sanitiser lacks forbidden token scan or issues output');
  }
}
```

---

### File 6: Update `supabase/functions/recover-finalize-report/index.ts`

Add enhanced sanitization and bidirectional validation to recovery flow.

**Changes:**

1. **Add single-letter placeholder patterns to forbiddenPatterns:**

```typescript
const forbiddenPatterns = [
  // Existing patterns...
  { pattern: /\$Z\b/gi, name: '$Z' },
  { pattern: /\bA%\b/g, name: 'A%' },
  { pattern: /\bB%\b/g, name: 'B%' },
  { pattern: /\b[A-Z]\s+(?:additional|new)\s+(?:jobs?|employees?)/gi, name: 'Letter job count' },
];
```

2. **Add bidirectional citation validation** before returning success.

---

### File 7: Update `src/test/citationNormalizer.test.ts`

Add comprehensive test coverage for new patterns.

**New Test Cases:**

```typescript
describe("single-letter placeholder removal", () => {
  it("should remove $Z placeholders", () => {
    const input = "<p>The market size is $Z million.</p>";
    const result = sanitizeFinalReport(input);
    expect(result.html).not.toContain("$Z");
  });

  it("should remove 'B additional jobs' pattern", () => {
    const input = "<p>This will create B additional jobs in the region.</p>";
    const result = sanitizeFinalReport(input);
    expect(result.html).not.toMatch(/\bB\s+additional\s+jobs/i);
  });

  it("should remove 'X million' pattern", () => {
    const input = "<p>Revenue is projected at $X million annually.</p>";
    const result = sanitizeFinalReport(input);
    expect(result.html).not.toMatch(/\$X\s+million/i);
  });

  it("should remove A% placeholder", () => {
    const input = "<p>Market share of A% is expected.</p>";
    const result = sanitizeFinalReport(input);
    expect(result.html).not.toContain("A%");
  });
});

describe("scanForForbiddenTokens", () => {
  it("should return issues_found array with location", () => {
    const content = { market_sizing: { tam: "The TAM is $Z million" } };
    const issues = scanForForbiddenTokens(content, "step3");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].location).toContain("step3.market_sizing.tam");
  });
});

describe("validateCitationBidirectional", () => {
  it("should detect orphan references", () => {
    const html = "<p>Growth is strong <a href='#ref-1'>(Smith, 2024)</a>.</p>";
    const refs = "<li id='ref-1'>Smith (2024)</li><li id='ref-2'>Jones (2023)</li>";
    const result = validateCitationBidirectional(html, refs);
    expect(result.orphan_references).toContain("ref-2");
  });

  it("should detect malformed n.d. without retrieval date", () => {
    const html = "<p>According to (ABS, n.d.) the data shows...</p>";
    const refs = "<li id='ref-1'>ABS. (n.d.). Title.</li>";
    const result = validateCitationBidirectional(html, refs);
    expect(result.malformed_dates.length).toBeGreaterThan(0);
  });
});
```

---

## Forbidden Patterns (Complete List)

```typescript
const COMPLETE_FORBIDDEN_PATTERNS = [
  // Internal source IDs
  /\[S\d+-[A-Z0-9]+\]/gi,           // [S0-1]
  /\[ARTICLE-\d+\]/gi,              // [ARTICLE-1]
  /\[SEARCH-\d+\]/gi,               // [SEARCH-1]
  /\[SOURCE-\d+\]/gi,               // [SOURCE-1]
  /\[step\d+\]/gi,                  // [step9]
  /\[Source\d*\]/gi,                // [Source1]
  /\bS\d+-\d+\b(?!["\'])/gi,        // Naked S0-1 (no brackets)
  
  // Generic markers
  /\[article\]/gi,
  /\[ref\]/gi,
  /\[reference\d*\]/gi,
  /Source\s+[12]\b/gi,
  
  // Placeholders
  /\{TBD\}/gi,
  /\[TBD\]/gi,
  /\[Insert[^\]]*\]/gi,
  /\[PROJECT\s*NAME\]/gi,
  /\[COMPANY\]/gi,
  /\$\[[^\]]+\]/g,                  // $[Amount]
  
  // Single-letter stand-ins (NEW)
  /\$Z\b/gi,
  /\bA%\b/g,
  /\bB%\b/g,
  /\bC%\b/g,
  /\b[A-Z]\s+(?:additional|new|total|more)\s+(?:jobs?|employees?|FTEs?|staff|positions?)/gi,
  /\$[A-Z]\s+(?:million|billion|thousand|AUD|USD)/gi,
  /\b[XYZ]\s+(?:million|billion|percent|%)/gi,
  
  // Undefined markers
  /undefined\s*\[/gi,
  /\]\s*undefined/gi,
];
```

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/citationNormalizer.ts` | MODIFY | Add single-letter patterns, scanForForbiddenTokens(), sanitizeStepOutputs(), validateCitationBidirectional() |
| `supabase/functions/worker-proxy/index.ts` | MODIFY | Expand FORBIDDEN_PATTERNS_LINT, add malformed reference detection |
| `src/lib/bundleGeneratorSpec.ts` | MODIFY | Add pre_assembly_sanitiser step template, update assembly step references |
| `supabase/functions/process-grant-guidelines/index.ts` | MODIFY | Add pre_assembly_sanitiser to pipeline, update validation |
| `src/lib/pipelineQualityGate.ts` | MODIFY | Add pre_assembly_sanitiser to CORE_STEP_NAMES, update minimum steps |
| `supabase/functions/recover-finalize-report/index.ts` | MODIFY | Add new patterns, bidirectional validation |
| `src/test/citationNormalizer.test.ts` | MODIFY | Add tests for single-letter patterns, scanForForbiddenTokens, bidirectional validation |

---

## Acceptance Criteria

1. **Zero forbidden tokens**: Final report contains no `[S0-1]`, `$Z`, `{TBD}`, `A%`, `B additional jobs`, etc.
2. **Pre-assembly sanitiser exists**: New step scans outputs and produces `issues_found[]` + `clean_step_outputs`
3. **Bidirectional citation validation**: Every citation maps to a reference, orphans removed
4. **Malformed dates fixed**: "n.d." only used when genuinely no date, includes retrieval date
5. **Evidence type enforcement**: Mismatches produce "Unknown (evidence type mismatch)"
6. **Hard failure gate works**: Worker-proxy rejects reports with any forbidden token
7. **All tests pass**: New patterns have test coverage

---

## Acceptance Test Procedure

1. Create a test report run with known forbidden tokens:
   - `[S0-1]` in market sizing section
   - `$Z million` in economic impact
   - `{TBD}` in timeline
   - `B additional jobs` in workforce section

2. Run the assembler pipeline

3. Verify final output:
   - Contains zero instances of any forbidden pattern
   - All numeric claims have APA citations (Author, Year)
   - References section has no orphan entries
   - `issues_found[]` documents all fixes applied
