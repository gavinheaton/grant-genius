# Update Pipeline Generation Prompt (Stage 3) - COMPLETED ✅

## Summary

Replaced the archetype-driven pipeline generation prompt with a rubric + required inputs-driven approach. The generated pipeline now directly addresses the grant's evaluation criteria with step allocation proportional to rubric weights.

## Changes Implemented

### 1. Updated WRITER_STANCE_PREAMBLE (Lines 47-72)
- Added jurisdiction benefit examples: "jobs, exports, sovereign capability, productivity, equity, emissions"
- Updated confidence labeling format in TONE RULES
- Added "and confidence labeled" to proxy estimate requirements

### 2. Replaced pipelinePrompt (Lines 1003-1076)
The new prompt includes:
- **Authoritative Inputs**: `formattedRequiredInputs` and `formattedRubricJson` passed as JSON
- **Rubric Coverage Plan**: AI must internally derive key, title, weight for each section
- **Required Inputs Plan**: Identify present vs missing inputs, compliance constraints
- **Depth Control by Weight**:
  - weight >= 35% → 3-5 steps
  - weight 20-34% → 2-3 steps
  - weight < 20% → 1-2 steps
- **Mandatory Steps**:
  - Step 0: build_source_pack
  - Step 1: rubric_coverage_map
  - Step 2: inputs_and_compliance_gap_check
  - Final: report_assembly + finalize_citations
- **New Variable**: `{{requiredInputs}}` added to approved variables list

### 3. Post-Generation Validation (Lines 1154+)
Added validation that:
- Inserts default `rubric_coverage_map` if missing
- Inserts default `inputs_and_compliance_gap_check` if missing
- Re-numbers steps sequentially after insertions
- Warns if fewer than 8 steps generated

## Data Flow (New)

```
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

## Testing

To test the new pipeline generation:
1. Go to Admin > Grants > Create or Edit a grant version
2. Upload new grant guidelines PDF
3. Watch the pipeline generation process
4. Verify the generated pipeline includes:
   - Step 1: rubric_coverage_map
   - Step 2: inputs_and_compliance_gap_check
   - At least 8 total steps
   - Research steps weighted by rubric importance
