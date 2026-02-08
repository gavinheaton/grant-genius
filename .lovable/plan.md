

# Quality Gate Rubric for Prompt Bundle Pipelines

## Overview

Implement a comprehensive pipeline validation system that evaluates generated prompt bundles for:
- Structural completeness (core steps, sequencing)
- Rubric/inputs traceability
- Evidence discipline and auditability
- Assessor insight quality
- Commercial reality layer ("researcher gap filling")

The validator runs immediately after pipeline generation and triggers auto-repair when scores fall below threshold.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Pipeline Quality Gate System                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Pipeline Generation (process-grant-guidelines)                             │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. HARD-FAIL VALIDATION (immediate reject)                          │    │
│  │     - Missing core steps (build_source_pack, rubric_traceability_    │    │
│  │       matrix, assessor_insight_layer, etc.)                          │    │
│  │     - Step numbering invalid (gaps, non-sequential)                  │    │
│  │     - Total steps < 12                                               │    │
│  │     - Any prompt_template < 1500 chars or missing                    │    │
│  │     - Forbidden patterns in ANY template                             │    │
│  │     - finalize_citations lacks sanitizer requirements                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       ▼ (if no hard-fail)                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  2. SCORED RUBRIC (0-100)                                            │    │
│  │     Category A: Structural Completeness (0-20)                       │    │
│  │     Category B: Traceability (0-20)                                  │    │
│  │     Category C: Evidence Auditability (0-20)                         │    │
│  │     Category D: Assessor Insight (0-20)                              │    │
│  │     Category E: Commercial Reality (0-20)                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  3. RED-FLAG DETECTION (warnings trigger repair)                     │    │
│  │     - Comparables not forced (min 5 entities)                        │    │
│  │     - TAM/SAM/SOM allows "Unknown" without proxy                     │    │
│  │     - report_assembly lacks grant-writer voice instruction           │    │
│  │     - finalize_citations lacks bracket sanitizer                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  4. VERDICT + AUTO-REPAIR                                            │    │
│  │     Pass (≥85): proceed to save                                      │    │
│  │     Conditional (75-84): run auto-repair, re-validate                │    │
│  │     Fail (<75 or hard-fail): reject pipeline                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### File 1: Create `src/lib/pipelineQualityGate.ts` (NEW)

Core validation module with all rubric logic.

**Types:**

```typescript
export interface PipelineQualityResult {
  overall_score: number;
  verdict: 'pass' | 'conditional_pass' | 'fail';
  hard_fail_reasons: string[];
  category_scores: {
    structural_completeness: number;
    traceability: number;
    evidence_auditability: number;
    assessor_insight: number;
    commercial_reality: number;
  };
  red_flags: string[];
  repair_actions: RepairAction[];
  notes: string;
}

export interface RepairAction {
  action: 
    | 'add_missing_core_step'
    | 'strengthen_prompt_template'
    | 'enforce_proxy_protocol'
    | 'ban_forbidden_patterns'
    | 'tighten_finalize_citations'
    | 'add_comparables_enforcement'
    | 'add_pricing_anchors'
    | 'enforce_grant_writer_voice';
  target_step_name: string;
  instructions: string;
}

export interface PipelineStep {
  step_number: number;
  step_name: string;
  step_description: string;
  prompt_template: string;
  model_tier?: string;
}
```

**Core Steps Constant:**

```typescript
export const CORE_STEP_NAMES = [
  'build_source_pack',
  'rubric_traceability_matrix',
  'assessor_insight_layer',
  'assumptions_register',
  'comparables_market_signals',
  'additionality_and_benefit_case',
  'commercialisation_logic',
  'risk_register_and_governance',
  'budget_logic_and_value_for_money',
  'report_assembly',
  'finalize_citations',
] as const;
```

**Key Functions:**

```typescript
// Main validation entry point
export function validatePipelineQuality(
  steps: PipelineStep[]
): PipelineQualityResult;

// Hard-fail checks (returns array of failure reasons, empty = pass)
export function checkHardFails(steps: PipelineStep[]): string[];

// Scored rubric categories
export function scoreStructuralCompleteness(steps: PipelineStep[]): number;
export function scoreTraceability(steps: PipelineStep[]): number;
export function scoreEvidenceAuditability(steps: PipelineStep[]): number;
export function scoreAssessorInsight(steps: PipelineStep[]): number;
export function scoreCommercialReality(steps: PipelineStep[]): number;

// Red-flag detection
export function detectRedFlags(steps: PipelineStep[]): string[];

// Generate repair actions based on scores and red flags
export function generateRepairActions(
  steps: PipelineStep[],
  result: PipelineQualityResult
): RepairAction[];
```

---

### File 2: Update `supabase/functions/process-grant-guidelines/index.ts`

Integrate the quality gate after pipeline generation.

**Changes:**

1. **Import/inline quality gate logic** (since edge functions can't import from src/)

2. **Add validation call after AI generates pipeline:**

```typescript
// After pipelineData is parsed
const qualityResult = validatePipelineQuality(pipelineData.steps);

if (qualityResult.verdict === 'fail') {
  console.error("Pipeline failed quality gate:", qualityResult.hard_fail_reasons);
  // Mark as failed and return error
  await supabaseAdmin
    .from("grant_versions")
    .update({ 
      pipeline_generation_status: "failed",
      pipeline_error: `Quality gate failed: ${qualityResult.hard_fail_reasons.join('; ')}`
    })
    .eq("id", grant_version_id);
  throw new Error(`Pipeline quality gate failed: ${qualityResult.notes}`);
}

if (qualityResult.verdict === 'conditional_pass') {
  console.log("Pipeline needs auto-repair:", qualityResult.repair_actions);
  // Apply auto-repairs
  pipelineData.steps = applyAutoRepairs(pipelineData.steps, qualityResult.repair_actions);
  
  // Re-validate after repairs
  const revalidation = validatePipelineQuality(pipelineData.steps);
  if (revalidation.verdict === 'fail') {
    throw new Error("Pipeline failed after auto-repair attempt");
  }
}
```

3. **Add auto-repair function:**

```typescript
function applyAutoRepairs(
  steps: PipelineStep[],
  repairs: RepairAction[]
): PipelineStep[] {
  for (const repair of repairs) {
    const step = steps.find(s => s.step_name === repair.target_step_name);
    if (!step) continue;
    
    switch (repair.action) {
      case 'add_comparables_enforcement':
        step.prompt_template = injectComparablesRequirement(step.prompt_template);
        break;
      case 'enforce_proxy_protocol':
        step.prompt_template = injectProxyProtocol(step.prompt_template);
        break;
      case 'tighten_finalize_citations':
        step.prompt_template = injectSanitizerRequirement(step.prompt_template);
        break;
      case 'enforce_grant_writer_voice':
        step.prompt_template = injectGrantWriterVoice(step.prompt_template);
        break;
      // ... other repair types
    }
  }
  return steps;
}
```

---

### File 3: Create `src/test/pipelineQualityGate.test.ts` (NEW)

Comprehensive test suite for the quality gate.

**Test Cases:**

```typescript
describe("pipelineQualityGate", () => {
  describe("checkHardFails", () => {
    it("should fail if build_source_pack is missing");
    it("should fail if step numbers have gaps");
    it("should fail if total steps < 12");
    it("should fail if any prompt_template < 1500 chars");
    it("should fail if forbidden patterns exist in templates");
    it("should fail if finalize_citations lacks sanitizer requirement");
    it("should pass valid pipeline with all core steps");
  });

  describe("scoreStructuralCompleteness", () => {
    it("should score 20 for perfect structure");
    it("should score 10 if order is messy");
    it("should score 0 if core steps missing");
  });

  describe("scoreTraceability", () => {
    it("should score 20 if rubric coverage is explicit");
    it("should score 10 if mentioned but not strict");
    it("should score 0 if absent");
  });

  describe("scoreEvidenceAuditability", () => {
    it("should score 20 for full evidence discipline");
    it("should detect evidence-type matching enforcement");
    it("should detect source ID integrity rules");
  });

  describe("scoreAssessorInsight", () => {
    it("should score 20 for assessor intent + failure modes");
    it("should detect genericness prevention gates");
    it("should detect additionality discipline");
  });

  describe("scoreCommercialReality", () => {
    it("should score 20 for buyer pathway + pricing anchors");
    it("should detect pricing anchors requirement (≥3)");
    it("should detect competitor comparability framework");
  });

  describe("detectRedFlags", () => {
    it("should flag if comparables not forced to ≥5");
    it("should flag if TAM/SAM/SOM allows Unknown");
    it("should flag if report_assembly lacks grant-writer voice");
    it("should flag if finalize_citations lacks bracket sanitizer");
  });

  describe("validatePipelineQuality", () => {
    it("should return 'pass' for score ≥ 85 with no hard-fails");
    it("should return 'conditional_pass' for score 75-84");
    it("should return 'fail' for score < 75");
    it("should return 'fail' if any hard-fail triggers");
  });
});
```

---

### File 4: Create Admin UI Component `src/components/admin/PipelineQualityCard.tsx` (NEW)

Display quality gate results in the Admin Console.

**Component Features:**
- Score breakdown by category (A-E)
- Hard-fail indicators (red badges)
- Red-flag warnings (yellow badges)
- Repair action list with descriptions
- Overall verdict badge (Pass/Conditional/Fail)

```typescript
interface PipelineQualityCardProps {
  result: PipelineQualityResult;
  onApplyRepairs?: () => void;
}

export function PipelineQualityCard({ result, onApplyRepairs }: PipelineQualityCardProps) {
  // Visual representation of quality gate results
  // Category score bars
  // Repair action buttons
}
```

---

### File 5: Update `src/pages/admin/PromptBundleEdit.tsx`

Add quality gate display to the bundle editor.

**Changes:**
1. Import `PipelineQualityCard` component
2. Add state for quality results
3. Calculate quality on bundle load
4. Display quality card above step list

---

## Scoring Logic Detail

### Category A - Structural Completeness (0-20)

**A1. Core steps present and ordered (0-10):**
- 10: All 11 core steps present, build_source_pack first, report_assembly/finalize_citations last
- 5: All present but wrong order
- 0: Any missing

**A2. Archetype modules included (0-10):**
- 10: Archetype-specific modules mapped to rubric
- 5: Some modules but not clearly mapped
- 0: Core-only with no archetype logic

### Category B - Traceability (0-20)

**B1. Rubric coverage guarantee (0-10):**
- Check if rubric_traceability_matrix prompt explicitly requires:
  - Every rubric section addressed
  - Gap handling specified
  
**B2. Required inputs mapping (0-10):**
- Check if prompts mandate mapping required input keys to report sections

### Category C - Evidence Auditability (0-20)

**C1. Evidence-type matching (0-7):**
- Detect keywords: "EVIDENCE-TYPE", "claim category", "allowed sources", "invalidate"

**C2. Source ID integrity (0-7):**
- Detect keywords: "S#-#", "source_id", "never renumber", "bracket markers"

**C3. Numeric claim discipline (0-6):**
- Detect keywords: "source_id required", "proxy method", "formula", "sensitivity"

### Category D - Assessor Insight (0-20)

**D1. Assessor intent + failure modes (0-8):**
- Check assessor_insight_layer for: assessor_intent, failure_modes[], evidence_plan

**D2. Genericness prevention (0-6):**
- Detect: "rewrite if generic", "quantified", "decision implications"

**D3. Additionality discipline (0-6):**
- Detect: "counterfactual", "without funding", "additionality_proofs"

### Category E - Commercial Reality (0-20)

**E1. Buyer pathway (0-7):**
- Detect: "who_pays", "who_decides", "adoption", "procurement", "buyer pathway"

**E2. Pricing anchors (0-7):**
- Detect: "≥3 pricing anchors", "pricing_anchor", "willingness_to_pay"

**E3. Competitor comparability (0-6):**
- Detect: "direct/adjacent/enabler", "measurable anchor", "price/revenue/TRL"

---

## Forbidden Pattern List (Hard-Fail)

```typescript
const HARD_FAIL_PATTERNS = [
  /\{TBD\}/gi,
  /\{\.\.\.\}/g,
  /\[Insert[^\]]*\]/gi,
  /\[PROJECT\s*NAME\]/gi,
  /\[COMPANY\]/gi,
  /Hypothetical\s+\w+/gi,
  /Source\s*[12]\b/gi,
  /Source1/gi,
  /\[article\]/gi,
  /```/g,  // Triple backticks banned
];
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/pipelineQualityGate.ts` | CREATE | Core validation module with rubric scoring |
| `supabase/functions/process-grant-guidelines/index.ts` | MODIFY | Integrate quality gate after pipeline generation |
| `src/test/pipelineQualityGate.test.ts` | CREATE | Test suite for quality gate |
| `src/components/admin/PipelineQualityCard.tsx` | CREATE | Admin UI component for quality display |
| `src/pages/admin/PromptBundleEdit.tsx` | MODIFY | Add quality card to bundle editor |

---

## Acceptance Criteria

1. **Hard-fail gates work:** Missing core steps, short prompts, forbidden patterns all trigger immediate reject
2. **Scoring is accurate:** Each category scores 0-20 based on keyword/pattern detection
3. **Red flags trigger repair:** Conditional pass pipelines get auto-repaired
4. **Admin visibility:** Quality results visible in bundle editor
5. **Tests pass:** All validation logic has test coverage

