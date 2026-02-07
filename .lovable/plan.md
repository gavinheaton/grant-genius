
# Add Missing Grant Context Variables to Execution Pipeline

## Status: ✅ IMPLEMENTED

## Summary

The pipeline generator correctly lists `{{requiredInputs}}` and structured rubric data as approved variables, but the execution environment (both `generate-report` and `worker-proxy`) did not fetch or provide these values to the steps. This caused prompts to use undefined variables, resulting in placeholder fallback patterns.

## Changes Made

### 1. Updated `generate-report/index.ts`

- Modified `fetchGrantContext` to query `required_inputs_json` and `rubric_json` from `grant_versions`
- Return type now includes `rubricJson: object` and `requiredInputs: object[]`
- Added `rubricJson` and `requiredInputs` to the returned context object

### 2. Updated `worker-proxy/index.ts`

- Added `required_inputs_json` to the grant_versions SELECT query
- Added `rubric_json` and `required_inputs` to the `grantContext` response object
- External worker now receives these fields for interpolation

### 3. Updated `resume-report-run/index.ts`

- Modified `fetchGrantContext` to include `required_inputs_json` in query
- Return type now includes `rubricJson: object` and `requiredInputs: object[]`
- Added `grantRubricJson` and `requiredInputs` to `buildVariables()` interpolation map

## Updated Approved Variables List

All available variables for prompt templates:

```
========== APPROVED VARIABLES ==========
User Inputs:
  {{summary}}, {{publicArticleUrl}}, {{articleContent}}, {{trl}}, {{ipStatus}}

Grant Context:
  {{grantName}}, {{grantVersionLabel}}, {{grantGuidelines}}, 
  {{grantRubric}}, {{grantRubricJson}}, {{grantSummary}}, {{requiredInputs}}

Step Outputs:
  {{sources}}, {{unknowns}}, {{step0}}, {{step1}}, {{step2}}, etc.
```

## Variable Mapping for External Worker

The external Cloud Run worker receives `grant_context` from `worker-proxy` and should map:

| Template Variable | Source |
|-------------------|--------|
| `{{requiredInputs}}` | `grant_context.required_inputs` (JSON stringified) |
| `{{grantRubric}}` | `grant_context.rubric` (formatted text) |
| `{{grantRubricJson}}` | `grant_context.rubric_json` (raw JSON stringified) |
| `{{grantGuidelines}}` | `grant_context.guidelines_excerpt` |
| `{{grantSummary}}` | `grant_context.summary` |

## Testing Strategy

1. **Verify Variable Resolution**
   - Create a test pipeline with a step using `{{requiredInputs}}` 
   - Run report generation and confirm the variable resolves to actual JSON

2. **End-to-End Report**
   - Upload new grant guidelines
   - Generate a report
   - Verify steps like `rubric_traceability_matrix` receive the rubric and required inputs

3. **Check Worker Logs**
   - Confirm worker receives `grant_context.required_inputs` in the context response
