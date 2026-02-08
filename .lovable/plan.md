
# Assessor-Grade TAM/SAM/SOM Dual Methodology Implementation

## Summary

Upgrade the pipeline generation system to produce assessor-grade TAM/SAM/SOM outputs with dual methodology (top-down + bottom-up), mandatory assumption registers, sensitivity analysis, sanity checks, evidence-type enforcement, and structured output schemas. This applies universally to ALL grant archetypes.

## Current State Analysis

The existing codebase has:
1. **bundleGeneratorSpec.ts** - Contains `market_sizing` module with basic TAM/SAM/SOM calculations but lacks dual methodology
2. **process-grant-guidelines/index.ts** - Has TAM/SAM/SOM proxy protocol section (lines 2016-2063) requiring dual proxies and reconciliation
3. **pipelineQualityGate.ts** - Validates pipelines but doesn't specifically check for the `tam_sam_som_dual_methodology` step

## Gaps to Address

| Gap | Current State | Required State |
|-----|---------------|----------------|
| Dedicated step name | `market_sizing` or `calculate_market_sizing` | Must be EXACTLY `tam_sam_som_dual_methodology` |
| Dual methodology | Basic proxy protocol exists | Enforce BOTH top-down AND bottom-up in single step |
| Assumption register | Ad-hoc assumption notes | Structured array with assumption_id, confidence_label, defensibility_note |
| Sensitivity analysis | Mentioned but not enforced | base/low/high for each of TAM/SAM/SOM + drivers |
| Sanity checks | Not implemented | pricing consistency, penetration comparables, spend ceiling validation |
| Evidence-type matching | Exists in contract | Must trigger "Unknown (evidence type mismatch)" for violations |
| Placeholder ban | Partial coverage | Hard ban on $Z, A%, B, C, PROXY placeholders |
| Output schema | Basic structure | Full JSON schema with 10+ top-level fields |
| Quality gate validation | Checks TAM/SAM "Unknown" | Must also validate `tam_sam_som_dual_methodology` step exists |

---

## Implementation Plan

### File 1: Update `src/lib/bundleGeneratorSpec.ts`

Replace the existing `market_sizing` module with a new `tam_sam_som_dual_methodology` module:

**Key Changes:**

1. **Rename module** from `market_sizing` to `tam_sam_som_dual_methodology`
2. **Update `role_name`** to `tam_sam_som_dual_methodology`
3. **Expand `outputs_schema`** to include all required fields
4. **Add comprehensive prompt template** (~3000+ chars) including:
   - Market definition with buyer personas
   - Pricing anchors (min 3)
   - Top-down sizing with formula, inputs, sensitivity
   - Bottom-up sizing with same structure
   - Reconciliation logic with divergence explanation
   - Assumptions register with 7 required fields per assumption
   - Sensitivity summary with drivers
   - Sanity checks with pass/fail + fix_applied
   - Unknowns array with proxy_attempted flag

**New Module Structure:**

```typescript
{
  module_name: "tam_sam_som_dual_methodology",
  when_to_include: [...GRANT_ARCHETYPES], // Universal!
  always_include: true, // Required for ALL archetypes
  provides_outputs: [
    "market_definition", 
    "pricing_anchors",
    "top_down", 
    "bottom_up", 
    "reconciliation",
    "assumptions_register",
    "sensitivity_summary",
    "sanity_checks",
    "unknowns"
  ],
  depends_on: ["evidence_source_pack"],
  step_template: { /* comprehensive template */ }
}
```

---

### File 2: Update `supabase/functions/process-grant-guidelines/index.ts`

**Changes:**

1. **Update CORE_STEP_NAMES constant** (if defined locally) to include `tam_sam_som_dual_methodology`

2. **Add dedicated step template** in the core steps section:
   - Position after `assumptions_register` (Step 3)
   - Full 3000+ character prompt with exact output schema

3. **Add placeholder ban list** to FORBIDDEN_PATTERNS:
   ```typescript
   { regex: /\$Z/gi, name: "$Z placeholder" },
   { regex: /\bA%\b/gi, name: "A% placeholder" },
   { regex: /\bPROXY\b(?!.*estimate)/gi, name: "PROXY placeholder" },
   ```

4. **Update the pipeline generation prompt** to explicitly require `tam_sam_som_dual_methodology` as a core step

5. **Add evidence-type enforcement** within the step template:
   - Market sizing must cite market research, NOT epidemiology
   - If mismatch: replace with "Unknown (evidence type mismatch)" and log

**New Step Template (to be inserted after assumptions_register):**

```
STEP 4 — TAM/SAM/SOM Dual Methodology (Assessor-Grade)

PURPOSE: Produce market sizing with BOTH top-down and bottom-up methodologies, 
transparent assumptions, sensitivity analysis, and sanity checks.

DUAL METHODOLOGY REQUIREMENT (Non-Negotiable):
You MUST output BOTH:
A) Top-down sizing: Parent market × segment share
B) Bottom-up sizing: Units × price × penetration

Then reconcile and explain divergence if >30%.

ASSUMPTIONS REGISTER REQUIREMENT:
Every TAM/SAM/SOM number must be decomposed into inputs with:
- assumption_id: "A1", "A2", etc.
- description: What this assumption represents
- value: Number or percentage
- confidence_label: "High" | "Medium" | "Low"
- defensibility_note: Why this is reasonable (based on evidence or conservative proxy)
- validation_source_type: What would validate it best
- source_id: "S0-#" OR "ESTIMATE" (only if defensibility_note + method provided)

FORBIDDEN: Unexplained percentages like "A%" or "20%" without decomposition

SENSITIVITY ANALYSIS (Mandatory):
For each of TAM, SAM, SOM output:
- base_case: Central estimate
- low_case: Conservative bound
- high_case: Optimistic bound
- sensitivity_drivers[]: Top 3 assumptions that move the result most
- why_low_high_bounds_are_defensible: Short rationale

SANITY CHECKS (Must Pass Before Output):
1. Implied price consistent with pricing anchors OR proxy method documented
2. Implied adoption/penetration consistent with comparables OR conservative by design
3. Implied spend does not exceed known category spend without explanation

If any sanity check FAILS:
- Revise assumptions OR
- Downgrade confidence AND document in sanity_checks[].fix_applied

EVIDENCE-TYPE ENFORCEMENT:
- Market size/growth/pricing must cite: market research, industry reports, procurement data, PBS/MBS
- Market sizing must NOT cite: epidemiology papers, disease burden studies
- If mismatch detected: Replace claim with "Unknown (evidence type mismatch)" and log to unknowns[]

OUTPUT JSON SCHEMA:
{
  "market_definition": {
    "product_category": "string",
    "buyer": { "payer": "string", "decision_maker": "string", "user": "string" },
    "geographies": ["Australia", "Global"],
    "time_horizon_years": number
  },
  "pricing_anchors": [
    { "anchor_name": "string", "price": number, "currency": "AUD|USD", "year": number,
      "source_id": "S0-#", "relevance": "string" }
  ],
  "top_down": {
    "tam": { "value": number, "currency": "AUD|USD", "year": number,
             "formula": "string", "inputs": [{ "label": "string", "value": number, "source_id": "S0-#|ESTIMATE" }],
             "sensitivity": { "low": number, "high": number }, "confidence": "high|medium|low" },
    "sam": { /* same structure */ },
    "som": { /* same structure */ }
  },
  "bottom_up": {
    "tam": { /* same structure */ },
    "sam": { /* same structure */ },
    "som": { /* same structure */ }
  },
  "reconciliation": {
    "explanation": "string",
    "preferred_method": "top_down|bottom_up|blended",
    "blended_value": { "tam": number, "sam": number, "som": number, "currency": "AUD|USD", "year": number }
  },
  "assumptions_register": [
    { "assumption_id": "A1", "description": "string", "value": "number|percent",
      "confidence_label": "High|Medium|Low", "defensibility_note": "string",
      "source_id": "S0-#|ESTIMATE", "validation_source_type": "string" }
  ],
  "sensitivity_summary": {
    "tam": { "base": number, "low": number, "high": number },
    "sam": { "base": number, "low": number, "high": number },
    "som": { "base": number, "low": number, "high": number },
    "sensitivity_drivers": ["A1", "A3", "A7"]
  },
  "sanity_checks": [
    { "check": "string", "status": "pass|fail", "note": "string", "fix_applied": "string|none" }
  ],
  "unknowns": [
    { "what_is_missing": "string", "what_would_validate": "string", "proxy_attempted": true, "method": "string" }
  ]
}
```

---

### File 3: Update `src/lib/pipelineQualityGate.ts`

**Changes:**

1. **Add `tam_sam_som_dual_methodology` to CORE_STEP_NAMES**:
   ```typescript
   export const CORE_STEP_NAMES = [
     'build_source_pack',
     'rubric_traceability_matrix',
     'assessor_insight_layer',
     'assumptions_register',
     'tam_sam_som_dual_methodology',  // NEW
     'comparables_market_signals',
     // ... rest
   ] as const;
   ```

2. **Add market sizing placeholder patterns to HARD_FAIL_PATTERNS**:
   ```typescript
   { pattern: /\$Z\b/gi, name: '$Z placeholder' },
   { pattern: /\bA%\b/gi, name: 'A% placeholder' },
   { pattern: /\bB%\b/gi, name: 'B% placeholder' },
   { pattern: /\bC%\b/gi, name: 'C% placeholder' },
   ```

3. **Add new red flag detection** for missing dual methodology:
   ```typescript
   // In detectRedFlags():
   const marketStep = steps.find(s => s.step_name === 'tam_sam_som_dual_methodology');
   if (marketStep) {
     const prompt = marketStep.prompt_template.toLowerCase();
     const hasDualMethod = 
       prompt.includes('top-down') && prompt.includes('bottom-up') ||
       prompt.includes('top_down') && prompt.includes('bottom_up');
     
     if (!hasDualMethod) {
       flags.push('tam_sam_som_dual_methodology lacks dual methodology requirement');
     }
     
     const hasAssumptionRegister = prompt.includes('assumption_id') || prompt.includes('assumptions_register');
     if (!hasAssumptionRegister) {
       flags.push('tam_sam_som_dual_methodology lacks assumptions_register requirement');
     }
   }
   ```

4. **Add new repair action** for missing dual methodology:
   ```typescript
   export function injectDualMethodologyRequirement(prompt: string): string {
     const requirement = `
   
   DUAL METHODOLOGY (Mandatory for TAM/SAM/SOM):
   - MUST output BOTH top-down (parent market × segment share) AND bottom-up (units × price × penetration)
   - Reconcile methods if divergence >30%
   - Include assumptions_register with assumption_id, confidence_label, defensibility_note
   - Sensitivity analysis required: base/low/high for each metric
   `;
     // Insert before OUTPUT SCHEMA
     const outputSchemaIdx = prompt.toLowerCase().indexOf('output');
     if (outputSchemaIdx !== -1) {
       return prompt.slice(0, outputSchemaIdx) + requirement + prompt.slice(outputSchemaIdx);
     }
     return prompt + requirement;
   }
   ```

---

### File 4: Update Report Assembly Templates

In `process-grant-guidelines/index.ts`, update the `createHtmlAssemblySteps` function to include dedicated market sizing presentation:

**Changes to `assemble_sections_html` step:**

Add to REQUIRED SECTIONS:
```
6. Market Sizing (TAM/SAM/SOM) with:
   - BOTH top-down and bottom-up methodologies presented
   - Assumptions register as a table with columns: ID, Description, Value, Confidence, Defensibility, Source
   - Sensitivity summary as a table showing base/low/high for TAM/SAM/SOM
   - Reconciliation explanation in assessor language
   - Sanity check results (passed/failed with notes)
   - Why assumptions are conservative / audit-ready
   - NEVER show internal placeholders or bracketed tokens
```

---

### File 5: Add Tests to `src/test/pipelineQualityGate.test.ts`

Add test cases for the new TAM/SAM/SOM validation:

```typescript
describe("tam_sam_som_dual_methodology validation", () => {
  it("should require tam_sam_som_dual_methodology in CORE_STEP_NAMES", () => {
    expect(CORE_STEP_NAMES).toContain('tam_sam_som_dual_methodology');
  });

  it("should fail if tam_sam_som_dual_methodology is missing", () => {
    const steps = createValidPipeline().filter(s => 
      s.step_name !== 'tam_sam_som_dual_methodology'
    );
    const failures = checkHardFails(steps);
    expect(failures.some(f => f.includes('tam_sam_som_dual_methodology'))).toBe(true);
  });

  it("should flag if dual methodology not required in prompt", () => {
    const steps = createValidPipeline();
    const marketStep = steps.find(s => s.step_name === 'tam_sam_som_dual_methodology');
    if (marketStep) {
      marketStep.prompt_template = createMinimalPrompt('tam_sam_som_dual_methodology');
    }
    const flags = detectRedFlags(steps);
    expect(flags.some(f => f.includes('dual methodology'))).toBe(true);
  });

  it("should fail if $Z placeholder appears in template", () => {
    const steps = createValidPipeline();
    steps[0].prompt_template += " The market size is $Z million";
    const failures = checkHardFails(steps);
    expect(failures.some(f => f.includes('$Z'))).toBe(true);
  });

  it("should fail if A% placeholder appears in template", () => {
    const steps = createValidPipeline();
    steps[0].prompt_template += " Growth rate of A% annually";
    const failures = checkHardFails(steps);
    expect(failures.some(f => f.includes('A%'))).toBe(true);
  });
});
```

---

## Output Schema (Complete Reference)

The `tam_sam_som_dual_methodology` step must return JSON with EXACT fields:

```json
{
  "market_definition": {
    "product_category": "string",
    "buyer": { "payer": "string", "decision_maker": "string", "user": "string" },
    "geographies": ["Australia", "Global"],
    "time_horizon_years": 5
  },
  "pricing_anchors": [
    { "anchor_name": "Comparable A", "price": 50000, "currency": "AUD", "year": 2024,
      "source_id": "S0-3", "relevance": "Direct competitor pricing" }
  ],
  "top_down": {
    "tam": { "value": 5000000000, "currency": "AUD", "year": 2024,
             "formula": "Global market $X × AU GDP share (1.6%)",
             "inputs": [{ "label": "Global market", "value": 312500000000, "source_id": "S0-1" }],
             "sensitivity": { "low": 4000000000, "high": 6000000000 },
             "confidence": "medium" },
    "sam": { "...same structure..." },
    "som": { "...same structure..." }
  },
  "bottom_up": {
    "tam": { "...same structure..." },
    "sam": { "...same structure..." },
    "som": { "...same structure..." }
  },
  "reconciliation": {
    "explanation": "Top-down yields $5B, bottom-up yields $4.2B (16% difference). Using bottom-up as more conservative.",
    "preferred_method": "bottom_up",
    "blended_value": { "tam": 4200000000, "sam": 840000000, "som": 42000000, "currency": "AUD", "year": 2024 }
  },
  "assumptions_register": [
    { "assumption_id": "A1", "description": "AU represents 1.6% of global market",
      "value": "1.6%", "confidence_label": "High",
      "defensibility_note": "Based on AU GDP share in World Bank data",
      "source_id": "S0-5", "validation_source_type": "World Bank GDP statistics" }
  ],
  "sensitivity_summary": {
    "tam": { "base": 4200000000, "low": 3500000000, "high": 5500000000 },
    "sam": { "base": 840000000, "low": 700000000, "high": 1100000000 },
    "som": { "base": 42000000, "low": 35000000, "high": 55000000 },
    "sensitivity_drivers": ["A1", "A3", "A7"]
  },
  "sanity_checks": [
    { "check": "Implied unit price within ±30% of pricing anchors", "status": "pass", "note": "$47k vs anchors $45-55k", "fix_applied": "none" },
    { "check": "Penetration rate below 10% in Year 1", "status": "pass", "note": "0.5% assumed", "fix_applied": "none" }
  ],
  "unknowns": [
    { "what_is_missing": "Direct AU market sizing report", "what_would_validate": "IBISWorld AU industry report", "proxy_attempted": true, "method": "Used Global × GDP ratio" }
  ]
}
```

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/bundleGeneratorSpec.ts` | MODIFY | Replace `market_sizing` with `tam_sam_som_dual_methodology` module |
| `supabase/functions/process-grant-guidelines/index.ts` | MODIFY | Add core step template, update FORBIDDEN_PATTERNS, pipeline prompt |
| `src/lib/pipelineQualityGate.ts` | MODIFY | Add to CORE_STEP_NAMES, add placeholder patterns, red flag detection, repair action |
| `src/test/pipelineQualityGate.test.ts` | MODIFY | Add tests for dual methodology validation |

---

## Quality Gate Updates

The quality gate will now:
1. **Hard-fail** if `tam_sam_som_dual_methodology` step is missing
2. **Hard-fail** if any prompt contains `$Z`, `A%`, `B%`, `C%`, or `PROXY` (without "estimate") placeholders
3. **Red-flag** if the step lacks dual methodology or assumptions_register requirements
4. **Auto-repair** by injecting the dual methodology requirement if conditional_pass

---

## Acceptance Criteria

1. Pipeline generation produces a step named EXACTLY `tam_sam_som_dual_methodology`
2. Step outputs include BOTH top-down AND bottom-up methodologies
3. Assumptions register includes all 7 required fields per assumption
4. Sensitivity analysis includes base/low/high for each metric
5. Sanity checks validate pricing consistency and penetration realism
6. Evidence-type mismatches produce "Unknown (evidence type mismatch)"
7. Placeholders ($Z, A%, B, C, PROXY) trigger hard-fail in quality gate
8. Report assembly presents market sizing with both methods, assumptions table, and sensitivity table
9. All new tests pass
