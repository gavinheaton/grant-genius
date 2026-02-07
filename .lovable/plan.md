# Pipeline QA: Variable Flow Consistency Validation

## Status: ✅ IMPLEMENTED

## Summary

Added a **Variable Flow Consistency Check** to the pipeline QA process that validates step-to-step data dependencies are correctly wired. This prevents runtime "stuck loops" caused by unresolved variables.

## Implementation

### 1. Core Validation Library (`src/lib/pipelineValidation.ts`)

Created a reusable validation module with:
- `BASE_VARIABLES` constant - list of all approved base variables
- `extractVariablesFromPrompt()` - extracts `{{variableName}}` patterns
- `buildAvailableVariables()` - builds available variables for a given step
- `validateStepVariables()` - validates a single step
- `validatePipelineDataFlow()` - validates entire pipeline
- `autoFixUnresolvedVariables()` - auto-fix helper
- `formatValidationSummary()` - human-readable output

### 2. Enhanced Quality Scoring (`src/hooks/usePromptQuality.ts`)

Updated `calculateQualityScore()` to:
- Accept `requiredInputs` for dynamic variable validation
- Accept `stepNumber` and `totalSteps` for forward reference detection
- Return `forwardReferences[]` in the quality score
- Add recommendations for forward reference issues

### 3. Updated UI (`src/components/admin/PromptQualityBadge.tsx`)

Enhanced the quality badge to display:
- Forward references with explicit warning
- Invalid variables with suggestions
- Improved tooltip and detail breakdown

### 4. Backend Validation (`supabase/functions/process-grant-guidelines/index.ts`)

Added "Step 5.6: Variable Flow Validation" that:
- Runs after assembly validation, before database insert
- Checks all AI prompt steps for unresolved variables
- Detects forward references (step N referencing step N+1)
- Auto-fixes unresolved variables by replacing with extraction instructions
- Logs all issues for debugging

## Variable Availability Map

| Step | Available Variables |
|------|---------------------|
| 0 | Base variables + required input keys |
| 1 | All of above + `{{step0}}` |
| 2 | All of above + `{{step1}}` |
| N | All of above + `{{step0}}` through `{{stepN-1}}` |

## Base Variables (always available)

- User inputs: `summary`, `publicArticleUrl`, `articleContent`, `trl`, `ipStatus`
- Grant context: `grantName`, `grantVersionLabel`, `grantGuidelines`, `grantRubric`, `grantRubricJson`, `grantSummary`, `requiredInputs`
- Source pack: `sources`, `unknowns`
- Step outputs: `step0` through `stepN-1`

## Auto-Fix Strategy

When an unresolved variable is detected:
1. **If it's a required input key**: Replace with `[Extract "varName" from requiredInputs if provided, otherwise use "Not specified"]`
2. **If it's an unknown variable**: Replace with `[The var name - derive from available context or mark as "Not available"]`
3. **Forward references**: Logged as errors (not auto-fixed - requires step reordering)

## Testing Checklist

- [ ] Generate a pipeline for a grant with specific required inputs
- [ ] Verify that if a step uses `{{project_title}}` and `project_title` is in requiredInputs, it's marked valid
- [ ] Verify that if `{{made_up_field}}` is used, it's flagged as error and auto-fixed
- [ ] Test forward reference detection (step 5 referencing `{{step7}}`)
- [ ] End-to-end report generation after validation passes
