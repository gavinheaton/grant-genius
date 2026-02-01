

# Fix: Dynamic Step Execution in Resume-Report-Run

## Problem Summary

The `resume-report-run` Edge Function fails on grant-specific pipelines because it has a **hardcoded 15-step switch statement** (steps 0-14) while the AEA Ignite pipeline has **14 steps** (0-13). This causes:

1. **Step 11 failure**: The edge function expects `finalize_citations` at step 10 and `partnerBusinesses` from the default pipeline, but AEA Ignite has different step names and content at those positions
2. **"step12 output is missing"**: The edge function references `{{step12}}` expecting `assembledSections` from the 15-step default pipeline, but AEA Ignite's step 12 is `build_tables_sources_html` with different semantics

## Evidence From Logs

```
Step 11 failed: finalize_citations
Step 14 FAILED: step12 output is missing
```

## Root Cause

| Issue | Default Pipeline (15 steps) | AEA Ignite (14 steps) |
|-------|---------------------------|----------------------|
| Step 10 | `competitorTable` | `finalize_citations` |
| Step 11 | `partnerBusinesses` | `assemble_sections_html` |
| Step 12 | `assemble_sections_html` | `build_tables_sources_html` |
| Step 13 | `build_tables_sources_html` | `finalize_report_html` |
| Step 14 | `finalize_report_html` | N/A |

The variable mapping (lines 526-541) is hardcoded:
```typescript
step10: JSON.stringify(reportContent.competitorTable || {}),
step11: JSON.stringify(reportContent.partnerBusinesses || {}),
step12: JSON.stringify(reportContent.assembledSections || {}),
```

But AEA Ignite stores different content at those steps, causing `{{step12}}` in the prompts to resolve to empty/wrong data.

## Solution

Replace the hardcoded 15-step `switch` statement with **dynamic execution** that:

1. Reads step prompts from `prompt_bundle_steps` for the active bundle
2. Iterates dynamically based on actual step count
3. Uses step outputs from database (`report_run_steps.outputs_json`) instead of semantic named variables

## Technical Implementation

### Changes to `supabase/functions/resume-report-run/index.ts`:

1. **Fetch the correct bundle** (grant-specific or global active)
2. **Dynamic step mapping**: Replace hardcoded `step0`...`step14` variable building with database-driven approach that reads `report_run_steps.outputs_json` for completed steps
3. **Replace switch statement** with dynamic execution that:
   - Gets prompt from `prompt_bundle_steps` where `step_number = nextStep`
   - Interpolates variables from prior step outputs
   - Executes the AI call
   - Saves output

### Key Code Changes

**Before (hardcoded):**
```typescript
// lines 526-541 - hardcoded semantic names
step10: JSON.stringify(reportContent.competitorTable || {}),
step11: JSON.stringify(reportContent.partnerBusinesses || {}),
step12: JSON.stringify(reportContent.assembledSections || {}),
```

**After (dynamic):**
```typescript
// Build step variables dynamically from completed steps
const stepVariables: Record<string, string> = {};
for (const step of existingSteps) {
  if (step.status === 'completed' && step.outputs_json) {
    stepVariables[`step${step.step_number}`] = JSON.stringify(step.outputs_json);
  }
}
```

**Before (switch statement):**
```typescript
switch (nextStep) {
  case 1: // hardcoded logic
  case 2: // hardcoded logic
  ...
  case 14: // hardcoded logic
}
```

**After (dynamic execution):**
```typescript
const stepConfig = bundle.steps.find(s => s.step_number === nextStep);
const interpolatedPrompt = interpolatePrompt(stepConfig.prompt_template, allVariables);
const result = await callAIWithRetry(interpolatedPrompt, nextStep, systemPrompt, ...);
// Save to report_run_steps
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/resume-report-run/index.ts` | Replace hardcoded switch with dynamic execution; fetch step outputs from DB |

## Migration Path

1. Implement dynamic execution engine
2. Keep semantic variable names (`{{summary}}`, `{{trl}}`) for user inputs
3. Use numeric step references (`{{step0}}`, `{{step1}}`) for step outputs - populated from database
4. Remove hardcoded step count assumptions (support any pipeline length)

## Validation

After the fix:
1. Create a new AEA Ignite application
2. Run report generation
3. Verify all 14 steps complete without errors
4. Confirm Step 13 (`finalize_report_html`) produces valid HTML report

