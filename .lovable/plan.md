

# Plan: Incorporate HTML Assembly Steps into Pipeline Builder

## Problem Summary

The `process-grant-guidelines` edge function generates grant-specific research pipelines dynamically via AI, but:

1. The AI only generates research steps ending with `report_assembly` and `finalize_citations`
2. No HTML assembly steps (assemble_sections, build_tables_sources, finalize_report) are included
3. This causes reports to output raw JSON with code fences instead of clean `report_html`

## Solution

Modify the pipeline builder to automatically append 3 standardized HTML assembly steps AFTER the AI-generated research steps. These steps will be hardcoded (not AI-generated) to ensure consistency.

## Technical Changes

### File: `supabase/functions/process-grant-guidelines/index.ts`

**Change 1: Define the standardized HTML assembly steps (add after line 411)**

Add a constant array containing the 3 assembly step definitions with their full prompt templates:

```text
const HTML_ASSEMBLY_STEPS = [
  {
    step_name: "assemble_sections_html",
    step_description: "Generate report sections as clean HTML narrative from evidence gathering steps",
    model_tier: "balanced",
    prompt_template: `STEP {{stepNumber}} — Assemble Sections as HTML...` // Full prompt
  },
  {
    step_name: "build_tables_sources_html", 
    step_description: "Build HTML tables and deduplicated source list",
    model_tier: "balanced",
    prompt_template: `STEP {{stepNumber}} — Build Tables + Sources (HTML)...` // Full prompt
  },
  {
    step_name: "finalize_report_html",
    step_description: "Merge sections, tables, and sources into final report_html",
    model_tier: "lite",
    prompt_template: `STEP {{stepNumber}} — Finalize Report (HTML)...` // Full prompt
  }
];
```

**Change 2: Modify step insertion logic (around line 435)**

After the AI generates research steps, append the HTML assembly steps with proper step numbering:

```typescript
// Get the highest step number from AI-generated steps
const maxAIStep = Math.max(...pipelineData.steps.map((s: any) => s.step_number));

// Prepare AI-generated research steps
const researchSteps = pipelineData.steps.map((step: any) => ({
  bundle_id: bundle.id,
  step_number: step.step_number,
  step_name: step.step_name,
  step_description: step.step_description,
  prompt_template: step.prompt_template,
  model_override: tierToModel[step.model_tier] || null,
  is_heavy: step.model_tier === "pro",
}));

// Append standardized HTML assembly steps
const assemblySteps = HTML_ASSEMBLY_STEPS.map((step, idx) => ({
  bundle_id: bundle.id,
  step_number: maxAIStep + 1 + idx,
  step_name: step.step_name,
  step_description: step.step_description,
  prompt_template: step.prompt_template.replace('{{stepNumber}}', String(maxAIStep + 1 + idx)),
  model_override: tierToModel[step.model_tier] || null,
  is_heavy: false,
}));

// Insert all steps (research + assembly)
const stepsToInsert = [...researchSteps, ...assemblySteps];
```

**Change 3: Update the AI prompt to exclude assembly steps (around line 293)**

Modify the pipeline generation prompt to clarify that the AI should NOT generate HTML assembly steps:

```text
REQUIRED PIPELINE STRUCTURE:
- Step 0: build_source_pack (ALWAYS first)
- Steps 1-N: Research steps mapped to rubric sections
- Final 2 research steps: report_assembly + finalize_citations

DO NOT include HTML assembly or formatting steps - these will be added automatically.
```

## Prompt Templates for Assembly Steps

The prompts will be derived from the production-tested AEA Ignite steps 11-13, with dynamic `{{stepN}}` references adjusted based on the actual step count:

| Step | Model | Key Features |
|------|-------|--------------|
| assemble_sections_html | balanced | Dynamic `{{step0}}` through `{{stepN}}` references, HTML section headings, table anchor tokens |
| build_tables_sources_html | balanced | Compiles tables from market sizing, competitors, partners; deduplicates sources |
| finalize_report_html | lite | Merges narrative with tables, outputs final `report_html` field |

## Step Number Mapping

For a pipeline with 11 AI-generated steps (0-10):

| Step | Name |
|------|------|
| 0 | build_source_pack |
| 1-8 | Research steps |
| 9 | report_assembly |
| 10 | finalize_citations |
| 11 | assemble_sections_html (auto-added) |
| 12 | build_tables_sources_html (auto-added) |
| 13 | finalize_report_html (auto-added) |

## Dynamic Step References

The assembly prompts need to dynamically reference all prior steps. The implementation will:

1. Count the AI-generated steps (e.g., 11 steps = steps 0-10)
2. Generate `{{step0}}` through `{{step10}}` placeholders in the assemble_sections_html prompt
3. Ensure the prompts adapt to any research step count (8-20 steps)

## Validation

After implementation:
1. Upload guidelines for a new grant
2. Verify the auto-generated pipeline includes 3 additional HTML assembly steps
3. Verify step numbering is continuous (no gaps)
4. Run a test report and confirm it produces clean `report_html` output

