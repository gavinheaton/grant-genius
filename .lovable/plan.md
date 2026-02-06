
# Replace Stage 3 Pipeline Generation Prompt ✅ COMPLETED

## Summary

Replaced the pipeline generation prompt (Stage 3) in `supabase/functions/process-grant-guidelines/index.ts` with the new "Grant Writer Core + Archetype Modules" specification. This introduces mandatory grant-writer artefacts that map directly to rubric + required inputs, ensuring assessor-ready output quality.

## Changes Made

### 1. New Pipeline Prompt (Lines 1021-1183)
Replaced the entire `pipelinePrompt` variable with the new specification including:

- **OBJECTIVE**: Clear 3-part goal (evidence, artefacts, professional report)
- **WRITER STANCE CONTRACT**: Integrated inline with tone, evidence, and output rules
- **MANDATORY PIPELINE DESIGN**: 8 Grant Writer Core steps + archetype modules + 2 final steps
- **MANDATORY PROMPT TEMPLATE STRUCTURE**: STEP header, INPUTS, HARD RULES (5+), UNKNOWN HANDLING, OUTPUT JSON SCHEMA
- **QUALITY GATES**: 4 explicit validation requirements

### 2. New Mandatory "Grant Writer Core" Steps
Every pipeline now includes these steps (in order after Step 0):

| Step | Name | Purpose |
|------|------|---------|
| 0 | `build_source_pack` | Always first - curate evidence sources |
| 1 | `rubric_mapping_matrix` | Map rubric criteria → evidence types → report location |
| 2 | `required_inputs_coverage_map` | Checklist ensuring all required inputs are addressed |
| 3 | `assumptions_register` | Structured assumptions + confidence + sensitivity |
| 4 | `additionality_and_benefit_case` | Counterfactual + funding need + jurisdiction benefit |
| 5 | `delivery_plan_and_milestones` | Timeline, dependencies, TRL progression |
| 6 | `risk_register_and_governance` | Risks, mitigations, compliance constraints |
| 7 | `budget_logic_and_value_for_money` | Cost categories, co-contribution, VFM rationale |

### 3. Updated Validation Logic (Lines 1269-1300)
- Replaced checks for old step names (`rubric_coverage_map`, `inputs_and_compliance_gap_check`)
- Added validation for all 8 Grant Writer Core steps
- Uses new `createDefaultCoreStep()` helper function

### 4. Added `createDefaultCoreStep()` Helper (Lines 480-760)
Full default prompt templates for all 8 core steps:
- Each template is 1,500+ characters
- Follows STEP N — [Purpose] format
- Includes HARD RULES (8+ constraints)
- Includes OUTPUT JSON SCHEMA
- Includes UNKNOWN HANDLING protocol

### Final Steps (mandatory)
| Step | Name | Purpose |
|------|------|---------|
| N-1 | `report_assembly` | Assessor-ready markdown following rubric + inputs |
| N | `finalize_citations` | APA reference list + citation validation |

## Verification

After deployment:
1. Upload a new grant guidelines PDF
2. Confirm the generated pipeline includes all 8 Grant Writer Core steps
3. Verify the final steps are `report_assembly` and `finalize_citations`
4. Check prompt quality scores meet the 70+ threshold
