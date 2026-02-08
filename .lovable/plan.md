
# Upgrade Grant Bundle Architect for Assessor-Grade TAM/SAM/SOM

## Summary

Upgrade the Grant Bundle Architect to produce assessor-grade TAM/SAM/SOM outputs that include: correct market basis selection, dual methodology with explicit formulas, structured assumptions register, sensitivity analysis, reconciliation with 3x convergence rule, sanity checks (arithmetic + scope), and defensibility notes. All changes apply universally to all grant archetypes.

## Current State Analysis

The codebase already has substantial TAM/SAM/SOM infrastructure:

| Component | Location | Current State |
|-----------|----------|---------------|
| `tam_sam_som_dual_methodology` module | `bundleGeneratorSpec.ts` | Has dual methodology, assumptions register, sensitivity, sanity checks |
| TAM/SAM/SOM validation | `pipelineQualityGate.ts` | Validates presence of dual methodology, assumptions, sensitivity |
| Proxy protocol | `process-grant-guidelines/index.ts` | Requires both top-down and bottom-up proxies with reconciliation |

## Gaps to Address

| Gap | Current State | Required State |
|-----|---------------|----------------|
| Market basis selection | Not a separate step | Add `market_basis_selection_and_scope` step |
| Reconciliation threshold | 30% divergence | 3x (300%) convergence rule with mandatory revision |
| Arithmetic sanity check | Generic checks | Explicit "patients × price = revenue" verification |
| Scope consistency check | Not explicit | TAM/SAM/SOM must refer to same product/buyer |
| `source_ids_used[]` aggregation | Not required | Explicit field in output schema |
| Assembly Market Sizing section | Generic table | Dedicated 7-component section |
| Quality gate for market_basis | Does not exist | Validate market_type, parent_market, buyer clarity |

---

## Implementation Plan

### File 1: Update `src/lib/bundleGeneratorSpec.ts`

**A) Add new `market_basis_selection_and_scope` module (before TAM/SAM/SOM):**

```typescript
{
  module_name: "market_basis_selection_and_scope",
  when_to_include: [...GRANT_ARCHETYPES],
  always_include: true,
  provides_outputs: ["market_basis"],
  depends_on: ["evidence_source_pack"],
  step_template: {
    role_name: "market_basis_selection_and_scope",
    role_goal: "Determine the correct parent market for TAM based on buyer, modality, and geography",
    phase: "research",
    ...
  }
}
```

**New step prompt template (~2000 chars):**
- PURPOSE: Determine the correct "parent market" for TAM
- INPUTS: Source pack, research summary, grant guidelines
- DECISION FACTORS:
  1. Buyer/payer and procurement path (who pays, who decides, how acquired)
  2. Modality/class (therapy vs diagnostic vs platform/service)
  3. Geography (global vs AU) with justification
- HARD RULE: Do NOT use generic parent markets (e.g., "global medtech") unless explicitly justified
- OUTPUT JSON SCHEMA with `market_basis` object:
  ```json
  {
    "market_basis": {
      "market_type": "product|service|platform|therapy|diagnostic",
      "parent_market_name": "string",
      "parent_market_value_aud": number,
      "parent_market_source_id": "S0-#",
      "buyer_persona": {
        "payer": "string",
        "decision_maker": "string",
        "user": "string"
      },
      "modality_class": "string",
      "geography": "AU|Global|Both",
      "geography_justification": "string",
      "inclusion_rules": ["string"],
      "exclusion_rules": ["string"],
      "justification": "string",
      "source_ids": ["S0-#"]
    }
  }
  ```

**B) Update `tam_sam_som_dual_methodology` module:**

1. Add dependency on `market_basis_selection_and_scope`
2. Update output schema to include:
   - `source_ids_used[]` - aggregated list of all sources cited
   - Enhanced `sanity_checks[]` with arithmetic and scope checks
3. Update reconciliation rule from 30% to 3x:
   ```
   RECONCILIATION RULE (3x Convergence):
   - If top-down SOM differs from bottom-up SOM by >3x, you MUST:
     a) Revise assumptions until methods converge within 3x, OR
     b) Explicitly explain the discrepancy and narrow/expand scope
   - Document actions_taken[] with every adjustment made
   ```
4. Add explicit sanity checks:
   ```
   MANDATORY SANITY CHECKS:
   1. ARITHMETIC CONSISTENCY: (eligible_population × price × penetration) = bottom_up_som_value (within ±5%)
   2. SCOPE CONSISTENCY: TAM/SAM/SOM all refer to the same product and buyer type
   3. PRICING CONSISTENCY: Implied price within ±30% of pricing anchors
   4. PENETRATION REALISM: Year 1 penetration < 1%, Year 5 < 10% (unless exceptional justification)
   5. SPEND CEILING: SOM does not exceed known category budget (e.g., PBS/MBS category spend)
   ```
5. Add `defensibility_notes` section:
   ```json
   "defensibility_notes": {
     "why_parent_market_correct": "string",
     "why_segment_share_reasonable": "string",
     "top_3_drivers_that_would_change_numbers": ["A1: ...", "A3: ...", "A7: ..."]
   }
   ```

**C) Update `createHtmlAssemblySteps()` - Market Sizing section in assembly:**

Update the `assemble_sections_html` prompt template to require a dedicated Market Sizing section with these 7 components:
1. Definitions (TAM/SAM/SOM explained)
2. Chosen market basis + why it matches the product
3. Top-down method table (inputs + citations)
4. Bottom-up method table (population × price × penetration + citations)
5. Assumptions table (ID, Description, Value, Confidence, Defensibility, Source)
6. Sensitivity summary (low/base/high) + top 3 drivers
7. Reconciliation statement (why methods converge, or what remains uncertain)

---

### File 2: Update `src/lib/pipelineQualityGate.ts`

**A) Add `market_basis_selection_and_scope` to `CORE_STEP_NAMES`:**
```typescript
export const CORE_STEP_NAMES = [
  'build_source_pack',
  'market_basis_selection_and_scope',  // NEW - before TAM/SAM/SOM
  'rubric_traceability_matrix',
  'assessor_insight_layer',
  'assumptions_register',
  'tam_sam_som_dual_methodology',
  // ... rest unchanged
] as const;
```

**B) Update `MINIMUM_TOTAL_STEPS`:**
```typescript
const MINIMUM_TOTAL_STEPS = 14;  // Was 13, now includes market_basis_selection_and_scope
```

**C) Add red flag detection for `market_basis_selection_and_scope`:**
```typescript
const marketBasisStep = steps.find(s => s.step_name === 'market_basis_selection_and_scope');
if (marketBasisStep) {
  const prompt = marketBasisStep.prompt_template.toLowerCase();
  
  // Check for buyer/payer requirement
  const hasBuyerPathway = 
    prompt.includes('buyer') && (prompt.includes('payer') || prompt.includes('decision'));
  
  // Check for modality/class requirement
  const hasModalityClass = 
    prompt.includes('modality') || prompt.includes('class') || prompt.includes('category');
  
  // Check for geography justification
  const hasGeographyJustification = 
    prompt.includes('geography') && prompt.includes('justif');
  
  // Check for exclusion of generic markets
  const banGenericMarkets = 
    prompt.includes('generic') && prompt.includes('not') ||
    prompt.includes('global medtech') && prompt.includes('not');
  
  if (!hasBuyerPathway) {
    flags.push('market_basis_selection_and_scope lacks buyer/payer pathway requirement');
  }
  if (!hasModalityClass) {
    flags.push('market_basis_selection_and_scope lacks modality/class requirement');
  }
  if (!hasGeographyJustification) {
    flags.push('market_basis_selection_and_scope lacks geography justification');
  }
  if (!banGenericMarkets) {
    flags.push('market_basis_selection_and_scope does not ban generic parent markets');
  }
}
```

**D) Update TAM/SAM/SOM validation to check for 3x reconciliation:**
```typescript
// Check for 3x reconciliation requirement
const has3xReconciliation = 
  prompt.includes('3x') || prompt.includes('3 times') || 
  (prompt.includes('reconcil') && prompt.includes('converge'));

if (!has3xReconciliation) {
  flags.push('tam_sam_som_dual_methodology lacks 3x convergence reconciliation rule');
}

// Check for arithmetic consistency sanity check
const hasArithmeticCheck = 
  prompt.includes('arithmetic') || 
  (prompt.includes('population') && prompt.includes('price') && prompt.includes('='));

if (!hasArithmeticCheck) {
  flags.push('tam_sam_som_dual_methodology lacks arithmetic consistency sanity check');
}

// Check for scope consistency
const hasScopeCheck = 
  prompt.includes('scope') && prompt.includes('consisten') ||
  prompt.includes('same product') && prompt.includes('same buyer');

if (!hasScopeCheck) {
  flags.push('tam_sam_som_dual_methodology lacks scope consistency sanity check');
}
```

**E) Add repair function for market basis:**
```typescript
export function injectMarketBasisRequirement(prompt: string): string {
  const requirement = `

MARKET BASIS SELECTION (Mandatory):
Before calculating TAM/SAM/SOM, you must:
1. Identify the buyer/payer: who pays, who decides, procurement path
2. Classify the modality: therapy | diagnostic | platform | service
3. Determine geography: AU only | Global | Both (with justification)
4. Define parent market: NOT generic (e.g., "medtech") unless justified

Output market_basis object with:
- market_type, parent_market_name, buyer_persona, modality_class
- inclusion_rules[], exclusion_rules[], justification, source_ids[]
`;

  const outputSchemaIdx = prompt.toLowerCase().indexOf('output');
  if (outputSchemaIdx !== -1) {
    return prompt.slice(0, outputSchemaIdx) + requirement + prompt.slice(outputSchemaIdx);
  }
  return prompt + requirement;
}
```

---

### File 3: Update `supabase/functions/process-grant-guidelines/index.ts`

**A) Add `market_basis_selection_and_scope` to core steps list (around line 2143):**

Insert after `build_source_pack` and before `rubric_traceability_matrix`:
```
Step 1: market_basis_selection_and_scope
  - Determine correct parent market based on buyer, modality, geography
  - Output: market_basis object with market_type, parent_market_name, buyer_persona, etc.
  - HARD RULE: No generic parent markets (e.g., "global medtech") without justification
```

**B) Add `market_basis_selection_and_scope` step template (in CORE_STEP_TEMPLATES):**

```typescript
market_basis_selection_and_scope: `STEP 1 — Market Basis Selection and Scope

${WRITER_STANCE_PREAMBLE}

${ASSESSOR_INSIGHT_CONTRACT}

PURPOSE: 
Determine the correct "parent market" for TAM calculation based on buyer, modality, and geography.
This step ensures market sizing is grounded in the RIGHT market category for the product/service.

INPUTS:
- Source pack: {{step0}}
- Research summary: {{summary}}
- Grant guidelines: {{grantGuidelines}}

DECISION FACTORS (must all be addressed):

1. BUYER/PAYER PATHWAY:
   - Who pays? (government agency, private payer, enterprise, consumer)
   - Who decides? (procurement committee, clinician, IT manager, end-user)
   - What's the procurement path? (tender, PBS listing, direct purchase, SaaS subscription)

2. MODALITY/CLASS:
   - Is this a therapy, diagnostic, platform, service, or device?
   - What regulatory class? (e.g., Class II device, software as medical device)
   - What category does the buyer mentally slot this into?

3. GEOGRAPHY:
   - AU-only vs Global with AU subset?
   - If Global → AU, what is the appropriate scaling factor? (GDP ratio, health spend ratio, population ratio)
   - Justify the choice with source_id

HARD RULES:
1. Do NOT use generic parent markets like "global medtech" or "healthcare industry" unless:
   - You explicitly justify why a narrower category is unavailable
   - You document exclusion_rules to scope down appropriately
2. The parent market MUST align with the buyer's mental category
3. Include source_id for parent market value

FORBIDDEN:
- {TBD}, [Insert...], [COMPANY], [PROJECT NAME]
- $Z, A%, B%, C% placeholders
- Generic category without scoping justification

OUTPUT JSON SCHEMA:
{
  "market_basis": {
    "market_type": "therapy|diagnostic|platform|service|device|other",
    "parent_market_name": "string (specific, not generic)",
    "parent_market_value_aud": number,
    "parent_market_year": number,
    "parent_market_source_id": "S0-#",
    "buyer_persona": {
      "payer": "string",
      "decision_maker": "string", 
      "user": "string"
    },
    "modality_class": "string",
    "geography": "AU|Global|Both",
    "geography_justification": "string",
    "scaling_factor_if_global": {
      "method": "GDP ratio|health spend ratio|population ratio|custom",
      "factor": number,
      "source_id": "S0-#"
    },
    "inclusion_rules": ["string"],
    "exclusion_rules": ["string"],
    "justification": "Why this parent market is correct for this product",
    "source_ids": ["S0-#", "S0-#"]
  },
  "unknowns": [
    {
      "what_is_missing": "string",
      "what_would_validate": "string",
      "proxy_attempted": true,
      "method": "string"
    }
  ]
}`,
```

**C) Update `tam_sam_som_dual_methodology` template to include:**
- Reference to `{{step1}}` (market_basis)
- 3x convergence reconciliation rule
- Arithmetic and scope consistency checks
- `source_ids_used[]` output field
- `defensibility_notes` section

**D) Update the assembly step template** (around line 1485-1491) to enforce the 7-component Market Sizing section:

```
6. Market Sizing (TAM/SAM/SOM) section MUST include all 7 components:
   a) Definitions: What TAM/SAM/SOM mean for this opportunity
   b) Market Basis: Chosen parent market + why it matches the product
   c) Top-Down Table: Parent market × segment share (with formula + source citations)
   d) Bottom-Up Table: Population × price × penetration (with formula + source citations)
   e) Assumptions Table: Columns = ID, Description, Value, Confidence, Defensibility, Source
   f) Sensitivity Table: Base/Low/High for TAM/SAM/SOM + top 3 sensitivity drivers
   g) Reconciliation Statement: Why methods converge, or what uncertainty remains + fixes_applied
```

---

### File 4: Update `src/test/pipelineQualityGate.test.ts`

Add test cases for the new validation:

```typescript
describe("market_basis_selection_and_scope validation", () => {
  it("should require market_basis_selection_and_scope in CORE_STEP_NAMES", () => {
    expect(CORE_STEP_NAMES).toContain('market_basis_selection_and_scope');
  });

  it("should fail if market_basis_selection_and_scope is missing", () => {
    const steps = createValidPipeline().filter(s => 
      s.step_name !== 'market_basis_selection_and_scope'
    );
    const failures = checkHardFails(steps);
    expect(failures.some(f => f.includes('market_basis_selection_and_scope'))).toBe(true);
  });

  it("should flag if market_basis lacks buyer pathway", () => {
    const steps = createValidPipeline();
    const marketBasisStep = steps.find(s => s.step_name === 'market_basis_selection_and_scope');
    if (marketBasisStep) {
      marketBasisStep.prompt_template = createMinimalPrompt('market_basis_selection_and_scope');
    }
    const flags = detectRedFlags(steps);
    expect(flags.some(f => f.includes('buyer') || f.includes('payer'))).toBe(true);
  });
});

describe("tam_sam_som 3x reconciliation", () => {
  it("should flag if 3x reconciliation rule is missing", () => {
    const steps = createValidPipeline();
    const tamStep = steps.find(s => s.step_name === 'tam_sam_som_dual_methodology');
    if (tamStep) {
      // Replace with prompt lacking 3x rule
      tamStep.prompt_template = tamStep.prompt_template.replace(/3x|3 times/gi, '');
    }
    const flags = detectRedFlags(steps);
    expect(flags.some(f => f.includes('3x') || f.includes('reconciliation'))).toBe(true);
  });
});
```

---

## Complete TAM/SAM/SOM Output Schema

```json
{
  "market_basis": {
    "market_type": "therapy|diagnostic|platform|service|device",
    "parent_market_name": "string",
    "parent_market_value_aud": number,
    "parent_market_year": number,
    "parent_market_source_id": "S0-#",
    "buyer_persona": {
      "payer": "string",
      "decision_maker": "string",
      "user": "string"
    },
    "modality_class": "string",
    "geography": "AU|Global|Both",
    "geography_justification": "string",
    "inclusion_rules": ["string"],
    "exclusion_rules": ["string"],
    "justification": "string",
    "source_ids": ["S0-#"]
  },
  "pricing_anchors": [
    { "anchor_name": "string", "price": number, "currency": "AUD|USD", 
      "year": number, "source_id": "S0-#", "relevance": "string" }
  ],
  "top_down": {
    "tam": { "value": number, "currency": "AUD", "year": number, 
             "method": "string", "formula": "string",
             "inputs": [{ "name": "string", "value": number, "units": "string",
                         "source_id": "S0-#|ESTIMATE", "confidence": "High|Medium|Low",
                         "defensibility": "string" }],
             "sensitivity": { "low": number, "base": number, "high": number } },
    "sam": { /* same structure */ },
    "som": { /* same structure */ }
  },
  "bottom_up": {
    "tam": { /* optional */ },
    "sam": { /* same structure */ },
    "som": {
      "value": number, "currency": "AUD", "year": number,
      "formula": "(eligible_population) x (price) x (penetration)",
      "inputs": [
        { "name": "eligible_population", "value": number, "units": "patients/year",
          "source_id": "S0-#|ESTIMATE", "confidence": "High|Medium|Low",
          "defensibility": "string" },
        { "name": "price", "value": number, "units": "AUD/patient",
          "source_id": "S0-#|ESTIMATE", "confidence": "High|Medium|Low",
          "defensibility": "string" },
        { "name": "penetration", "value": 0.05, "units": "fraction",
          "source_id": "S0-#|ESTIMATE", "confidence": "High|Medium|Low",
          "defensibility": "string" }
      ],
      "sensitivity": { "low": number, "base": number, "high": number }
    }
  },
  "assumptions_register": [
    { "assumption_id": "A1", "assumption_name": "string", 
      "value": number, "units": "string",
      "confidence": "High|Medium|Low",
      "one_line_defensibility": "string",
      "evidence_support": { "source_id": "S0-#|ESTIMATE", "rationale": "string" } }
  ],
  "reconciliation": {
    "ratio_topdown_to_bottomup": number,
    "actions_taken": ["Revised penetration assumption from 10% to 5%"],
    "explanation_if_unresolved": "string (only if >3x after revisions)"
  },
  "sanity_checks": [
    { "check": "arithmetic: pop × price × penetration = som", "pass": true, 
      "details": "100,000 × $500 × 0.05 = $2.5M (matches SOM)" },
    { "check": "scope: TAM/SAM/SOM refer to same product/buyer", "pass": true, 
      "details": "All refer to point-of-care diagnostic for hospital procurement" },
    { "check": "pricing: implied price within ±30% of anchors", "pass": true, 
      "details": "$500 vs anchors $450-$600" }
  ],
  "defensibility_notes": {
    "why_parent_market_correct": "string",
    "why_segment_share_reasonable": "string",
    "top_3_drivers_that_would_change_numbers": ["A1: penetration rate", "A3: price", "A7: eligible population"]
  },
  "unknowns": [
    { "what_is_missing": "string", "what_would_validate": "string",
      "proxy_attempted": true, "next_best_source": "string" }
  ],
  "source_ids_used": ["S0-1", "S0-2", "S0-5", "S0-8"]
}
```

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/bundleGeneratorSpec.ts` | MODIFY | Add `market_basis_selection_and_scope` module, update TAM/SAM/SOM with 3x rule, update assembly template |
| `src/lib/pipelineQualityGate.ts` | MODIFY | Add to CORE_STEP_NAMES, update MINIMUM_STEPS, add red flag detection, add repair function |
| `supabase/functions/process-grant-guidelines/index.ts` | MODIFY | Add step template, update core steps list, update assembly requirements |
| `src/test/pipelineQualityGate.test.ts` | MODIFY | Add tests for market_basis and 3x reconciliation |

---

## Acceptance Criteria

1. **Market basis step exists** in every generated pipeline with buyer/payer, modality, geography
2. **No generic parent markets** (e.g., "global medtech") unless scoped with exclusion_rules
3. **Dual methodology enforced** with explicit formulas shown
4. **Assumptions register complete** with all 7 required fields per assumption
5. **3x convergence rule** applied with documented actions_taken if revision needed
6. **Arithmetic sanity check** verifies population × price × penetration = SOM
7. **Scope consistency check** verifies TAM/SAM/SOM refer to same product/buyer
8. **Evidence-type matching** prevents epidemiology citations for market claims
9. **Defensibility notes** explain why parent market and assumptions are reasonable
10. **Report assembly** includes dedicated 7-component Market Sizing section
11. **No forbidden tokens** in final output (bracketed IDs, placeholders, stand-ins)
12. **All tests pass** with new validation requirements
