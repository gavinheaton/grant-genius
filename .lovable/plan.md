

# Update Pipeline Generation Prompt (Stage 3)

## Summary

Replace the current archetype-driven pipeline generation prompt with a rubric + required inputs-driven approach. This ensures the generated pipeline directly addresses the grant's evaluation criteria with step allocation proportional to rubric weights.

## Key Changes from Current Implementation

| Aspect | Current | New |
|--------|---------|-----|
| **Driver** | Archetype-first (modules selected by archetype) | Rubric + Required Inputs-first |
| **Step 1** | build_source_pack (unchanged) | build_source_pack (unchanged) |
| **Step 2** | Research step from archetype modules | `rubric_coverage_map` (mandatory) |
| **Step 3** | Research step from archetype modules | `inputs_and_compliance_gap_check` (mandatory) |
| **Step Allocation** | Fixed modules per archetype | Weight-based depth control |
| **Final Steps** | report_assembly + finalize_citations | report_assembly + finalize_citations (no HTML steps) |
| **Minimum Steps** | Not enforced | 8 steps minimum |
| **New Variable** | — | `{{requiredInputs}}` added |

## Files to Modify

### 1. `supabase/functions/process-grant-guidelines/index.ts`

**Section to Replace**: Lines 1017-1076 (the `pipelinePrompt` variable)

**Changes:**
- Replace the entire pipeline prompt with the new rubric-driven prompt
- Add `{{requiredInputs}}` to the approved variables list
- Pass `REQUIRED_INPUTS_JSON` and `RUBRIC_JSON` as authoritative inputs
- Update the tool schema to expect the new mandatory steps

**Key Additions to Prompt:**

```
KEY CHANGE: PIPELINE MUST BE RUBRIC + REQUIRED INPUTS DRIVEN (NOT ARCHETYPE DRIVEN)

Before generating steps, you MUST internally derive:
A) Rubric Coverage Plan
   - For each rubric section: key, title, weight
   - For each criterion: what evidence is required

B) Required Inputs Plan
   - Identify which required inputs exist vs are missing
   - Identify compliance constraints from guidelines

C) Depth Control by Weight
   - weight >= 35% → allocate 3-5 steps
   - weight 20-34% → allocate 2-3 steps
   - weight < 20% → allocate 1-2 steps
```

**New Mandatory Steps in Output:**

```
Step 0: build_source_pack (ALWAYS first)
Step 1: rubric_coverage_map (NEW - converts rubric to evidence checklist)
Step 2: inputs_and_compliance_gap_check (NEW - validates inputs + compliance)
Steps 3-N: Research steps aligned to rubric weights
Final: report_assembly + finalize_citations
```

**Variable Passing Updates:**

```typescript
// Line ~1009: Format required inputs for the prompt
const formattedRequiredInputs = JSON.stringify(suggestions.required_inputs || [], null, 2);
const formattedRubricJson = JSON.stringify(suggestions.rubric || {}, null, 2);
```

**Tool Schema Update:**
- Add validation that Step 1 is named `rubric_coverage_map`
- Add validation that Step 2 is named `inputs_and_compliance_gap_check`
- Enforce minimum 8 steps in output integrity check

### 2. Update WRITER_STANCE_PREAMBLE (Lines 47-72)

Minor updates to align with the new prompt:
- Add jurisdiction benefit examples: "jobs, exports, sovereign capability, productivity, equity, emissions"
- Add confidence labeling examples in TONE RULES

### 3. Update PROMPT_QUALITY_TEMPLATE (Lines 234-263)

Add reference to the new mandatory steps for quality validation.

## Data Flow Changes

```
Current Flow:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Grant DNA Pack  │ ──▶ │ Classify        │ ──▶ │ Select Modules  │
│ (rubric, inputs)│     │ Archetype       │     │ by Archetype    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────────┐
                                               │ Generate Steps  │
                                               │ from Modules    │
                                               └─────────────────┘

New Flow:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Grant DNA Pack  │ ──▶ │ Rubric Coverage │ ──▶ │ Weight-based    │
│ (rubric, inputs)│     │ Analysis        │     │ Step Allocation │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                       │
                        Archetype used as helper ◀─────┘
                        (for fallback modules only)
                                                       │
                                                       ▼
                                               ┌─────────────────┐
                                               │ Generate Steps  │
                                               │ from Rubric     │
                                               └─────────────────┘
```

## Implementation Details

### New Pipeline Prompt (Full Replacement)

The prompt will be structured as:

```
You are an expert at designing high-quality, audit-ready research pipelines 
for [ARCHETYPE] grant applications.

Context:
  Grant: [GRANT_NAME]
  Archetype: [ARCHETYPE] (helper only)
  Summary: [GRANT_SUMMARY]

Authoritative Inputs:
  Required Inputs (JSON): [REQUIRED_INPUTS_JSON]
  Rubric/Assessment Criteria (JSON): [RUBRIC_JSON]
  Grant Guidelines: [GRANT_GUIDELINES_TEXT]

REQUIRED MODULES FOR THIS ARCHETYPE:
  [SELECTED_MODULES]

=== WRITER STANCE CONTRACT ===
[existing contract with updates]
=== END WRITER STANCE CONTRACT ===

KEY CHANGE: PIPELINE MUST BE RUBRIC + REQUIRED INPUTS DRIVEN
[new planning requirements A, B, C]

REQUIRED PIPELINE STRUCTURE
[Step 0-2 mandatory, research aligned to rubric, final steps]

MANDATORY PROMPT STRUCTURE
[detailed requirements for each step]

Output schema and integrity rules
[minimum 8 steps, new mandatory step names]
```

### Post-Generation Validation

Add checks after receiving AI response:

```typescript
// Validate mandatory steps exist
const stepNames = pipelineData.steps.map(s => s.step_name);
if (!stepNames.includes('rubric_coverage_map')) {
  console.warn("Missing rubric_coverage_map step - adding default");
  // Insert default rubric_coverage_map step
}
if (!stepNames.includes('inputs_and_compliance_gap_check')) {
  console.warn("Missing inputs_and_compliance_gap_check step - adding default");
  // Insert default step
}
if (pipelineData.steps.length < 8) {
  console.warn(`Only ${pipelineData.steps.length} steps - may need enhancement`);
}
```

### Approved Variables Update

Add `{{requiredInputs}}` to the list:
- Lines 1065-1067: Add to APPROVED VARIABLES
- Ensure variable substitution in worker-proxy handles this

## Testing Considerations

1. **Backward Compatibility**: Existing pipelines won't be affected (stored in DB)
2. **New Pipeline Generation**: Any new grant guidelines upload will use the new prompt
3. **Recovery**: The finalize step structure remains unchanged, so the Replit worker fix remains valid

## Summary of Code Changes

| Location | Lines | Change |
|----------|-------|--------|
| WRITER_STANCE_PREAMBLE | 47-72 | Minor updates for jurisdiction benefit examples |
| pipelinePrompt | 1017-1076 | Full replacement with rubric-driven prompt |
| Post-AI validation | ~1154 | Add checks for mandatory steps |
| Variable formatting | ~1009 | Add formattedRequiredInputs variable |
| Approved variables | 1065-1067 | Add {{requiredInputs}} |

