
# Replace Stage 3 Pipeline Generation Prompt

## Summary

Replace the current pipeline generation prompt (Stage 3) in `supabase/functions/process-grant-guidelines/index.ts` with the new "Grant Writer Core + Archetype Modules" specification. This introduces mandatory grant-writer artefacts that map directly to rubric + required inputs, ensuring assessor-ready output quality.

## Key Changes in New Specification

### New Mandatory "Grant Writer Core" Steps
Every pipeline will include these steps (in order after Step 0):

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

### Archetype-Specific Modules (after core)
Selected based on grant type:
- `market_need_quantification`
- `competitor_and_alternatives`
- `tam_sam_som_analysis`
- `regulatory_and_pathway` (health/clinical/defence)
- `partner_stakeholder_mapping`
- `impact_model` (economic, social, climate)
- `workforce_and_capability`
- `infrastructure_and_procurement`

### Final Steps (mandatory)
| Step | Name | Purpose |
|------|------|---------|
| N-1 | `report_assembly` | Assessor-ready markdown following rubric + inputs |
| N | `finalize_citations` | APA reference list + citation validation |

### Quality Gates
- Every rubric section must be addressed by at least one step
- Every required input key must be mapped in `required_inputs_coverage_map`
- `report_assembly` must write like a grant writer, referencing rubric sections by title
- `finalize_citations` must output clean APA refs with no placeholders

## Technical Implementation

### File: `supabase/functions/process-grant-guidelines/index.ts`

**Location**: Lines 1021-1148 (the `pipelinePrompt` variable)

**Replace with**: The new prompt specification you provided, with proper variable interpolation

The new prompt will:
1. Use `${grantName}` for GRANT_NAME
2. Use `${archetype}` for ARCHETYPE
3. Use `${suggestions.grant_summary}` for GRANT_SUMMARY
4. Use `${formattedRequiredInputs}` for REQUIRED_INPUTS_JSON
5. Use `${formattedRubricJson}` for RUBRIC_JSON
6. Use `${guidelines_text.substring(0, 15000)}` for GRANT_GUIDELINES_TEXT
7. Use `${modulesDescription}` for SELECTED_MODULES

### Prompt Template Updates

The new prompt includes:
- **OBJECTIVE**: Clear 3-part goal (evidence, artefacts, professional report)
- **WRITER STANCE CONTRACT**: Already integrated inline
- **MANDATORY PIPELINE DESIGN**: 7 core steps + archetype modules + 2 final steps
- **MANDATORY PROMPT TEMPLATE STRUCTURE**: STEP header, INPUTS, HARD RULES (5+), UNKNOWN HANDLING, OUTPUT JSON SCHEMA
- **QUALITY GATES**: 4 explicit validation requirements

### Integration with Existing Architecture

- The HTML assembly steps (`assemble_sections_html`, `build_tables_sources_html`, `finalize_report_html`) are still added automatically downstream via `createHtmlAssemblySteps()` - the new prompt correctly states "Do NOT include HTML assembly steps"
- The `WRITER_STANCE_PREAMBLE` constant at line 47-72 can remain, but is now also included inline in the new prompt for self-containment
- The module library selection (`selectModulesForArchetype`) continues to provide `SELECTED_MODULES`

## Secondary Update (Optional)

Consider updating `src/lib/bundleGeneratorSpec.ts` to document the new Grant Writer Core structure in the exported types, though this is reference documentation only and not functionally required.

## Verification

After deployment:
1. Upload a new grant guidelines PDF
2. Confirm the generated pipeline includes all 7 Grant Writer Core steps
3. Verify the final steps are `report_assembly` and `finalize_citations`
4. Check prompt quality scores meet the 70+ threshold
