

# Add Missing Grant Context Variables to Execution Pipeline

## Summary

The pipeline generator correctly lists `{{requiredInputs}}` and structured rubric data as approved variables, but the execution environment (both `generate-report` and `worker-proxy`) does not fetch or provide these values to the steps. This causes prompts to use undefined variables, resulting in placeholder fallback patterns.

## Root Cause

| Variable | Documented in Pipeline Prompt | Actually Provided at Execution |
|----------|-------------------------------|--------------------------------|
| `{{requiredInputs}}` | Yes | **No** - Not fetched from `grant_versions.required_inputs_json` |
| `{{grantRubric}}` | Yes (formatted text) | Partial - Formatted, but raw JSON unavailable |
| `{{grantSummary}}` | Yes | Yes |
| `{{grantGuidelines}}` | Yes | Yes |
| `{{articleContent}}` | Yes | Yes (Step 0 only, needs worker support) |

## Changes Required

### 1. Update `generate-report/index.ts` 

**File:** `supabase/functions/generate-report/index.ts`

**Change:** Modify `fetchGrantContext` to also return `requiredInputs`:

```typescript
async function fetchGrantContext(supabase, grantVersionId): Promise<{
  name: string;
  versionLabel: string;
  guidelinesExcerpt: string;
  formattedRubric: string;
  rubricJson: object;          // NEW: Raw rubric JSON
  requiredInputs: object[];    // NEW: Required inputs array
  summary: string;
}> {
  // Add required_inputs_json and rubric_json to the query
  const { data } = await supabase
    .from("grant_versions")
    .select(`
      version_number,
      guidelines_raw_text,
      ai_suggestions_json,
      required_inputs_json,   // NEW
      rubric_json,            // NEW
      grant:grants!inner(name)
    `)
    .eq("id", grantVersionId)
    .maybeSingle();
    
  return {
    // ...existing fields...
    requiredInputs: data.required_inputs_json || [],
    rubricJson: data.rubric_json || { sections: [] },
  };
}
```

**Change:** Add to interpolation variables:

```typescript
const interpolationVars = {
  // ...existing vars...
  requiredInputs: JSON.stringify(grantContext.requiredInputs, null, 2),
};
```

### 2. Update `worker-proxy/index.ts`

**File:** `supabase/functions/worker-proxy/index.ts`

**Change:** Add `required_inputs_json` to the grant_versions query (line ~225):

```typescript
const { data: grantVersion } = await supabase
  .from("grant_versions")
  .select(`
    id,
    version_number,
    guidelines_raw_text,
    rubric_json,
    required_inputs_json,      // ADD THIS
    ai_suggestions_json,
    prompt_bundle_id,
    pipeline_generation_status,
    grant:grants (id, name, description)
  `)
  .eq("id", application.grant_version_id)
  .single();
```

**Change:** Add to the `grantContext` response object (around line 307):

```typescript
grantContext = {
  name: grant?.name || "Unknown Grant",
  description: grant?.description || "",
  version_number: grantVersion.version_number,
  guidelines_excerpt: guidelinesExcerpt,
  rubric: formattedRubric,
  rubric_json: grantVersion.rubric_json,           // ADD: Raw JSON
  required_inputs: grantVersion.required_inputs_json || [],  // ADD
  summary: aiSuggestions?.grant_summary || aiSuggestions?.summary || "",
};
```

### 3. Update `resume-report-run/index.ts`

**File:** `supabase/functions/resume-report-run/index.ts`

**Change:** Add `requiredInputs` to the interpolation variables map (around line 563):

```typescript
const interpolationVars = {
  // ...existing...
  requiredInputs: JSON.stringify(grantVersion.required_inputs_json || [], null, 2),
  grantRubricJson: JSON.stringify(grantVersion.rubric_json || { sections: [] }, null, 2),
};
```

### 4. Ensure External Worker Interpolation

The external Cloud Run worker must interpolate these variables when building prompts. The worker receives `grant_context` from `worker-proxy` and should map:

| Template Variable | Source |
|-------------------|--------|
| `{{requiredInputs}}` | `grant_context.required_inputs` (JSON stringified) |
| `{{grantRubric}}` | `grant_context.rubric` (formatted text) |
| `{{grantRubricJson}}` | `grant_context.rubric_json` (raw JSON stringified) |
| `{{grantGuidelines}}` | `grant_context.guidelines_excerpt` |
| `{{grantSummary}}` | `grant_context.summary` |

## Updated Approved Variables List

The pipeline generator should document ALL available variables:

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

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/generate-report/index.ts` | Add `required_inputs_json` and `rubric_json` to query and interpolation |
| `supabase/functions/worker-proxy/index.ts` | Add `required_inputs_json` to query and response |
| `supabase/functions/resume-report-run/index.ts` | Add `requiredInputs` to interpolation vars |
| `supabase/functions/process-grant-guidelines/index.ts` | Update approved variables documentation |

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

