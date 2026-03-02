

## Conditional Pipeline Generation Based on Engine Type

### Problem
When an admin uploads grant guidelines, `process-grant-guidelines` always runs two expensive AI calls:
1. **Grant DNA extraction** (rubric, required inputs, summary) -- needed for ALL engines
2. **Full research pipeline generation** (12-16 prompt bundle steps) -- only needed for `cloud_run`/`edge`, NOT for Claude

For the Claude engine, the pipeline is unnecessary since the entire report is generated from a single prompt template. The guidelines analysis (rubric, inputs) is still needed because it feeds into the Claude prompt via shortcodes like `{{grantGuidelines}}` and `{{grantRubricFormatted}}`.

### Solution
Pass the grant version's `execution_engine_default` into the processing logic and skip AI Call #2 when the engine is `claude`.

### Changes

**1. `src/components/admin/GuidelinesUploader.tsx`**
- Pass the current execution engine to `triggerProcessing`
- Include `execution_engine` in the POST body to `process-grant-guidelines`
- Add a new prop `executionEngine` so the parent (`GrantEdit`) can pass the current engine setting

**2. `supabase/functions/process-grant-guidelines/index.ts`**
- Accept optional `execution_engine` parameter from request body
- If not provided, look up `execution_engine_default` from the grant version record
- After AI Call #1 (DNA extraction) completes successfully:
  - If engine is `claude`: save DNA results, set `pipeline_generation_status` to `"not_required"` (or keep as `"none"`), and return early with a success response indicating analysis-only mode
  - If engine is `cloud_run` or `edge`: continue to AI Call #2 (pipeline generation) as before

**3. `src/pages/admin/GrantEdit.tsx`**
- Pass `executionEngine={executionEngineDefault}` to the `GuidelinesUploader` component
- Update retry handler (`handleRetryProcessing`) to also pass the engine in the request body
- Update toast messages to reflect analysis-only vs full pipeline generation

### Technical Details

In `process-grant-guidelines/index.ts`, after saving the Grant DNA Pack (around line 1820):

```text
// After saving extraction results...
if (executionEngine === "claude") {
  // Claude engine only needs guidelines analysis, not a pipeline
  await supabaseAdmin
    .from("grant_versions")
    .update({
      ai_analysis_status: "completed",
      ai_suggestions_json: { ...suggestions, ... },
      required_inputs_json: suggestions.required_inputs || [],
      rubric_json: { sections: suggestions.rubric?.sections || [] },
      guidelines_raw_text: guidelines_text.substring(0, 100000),
      pipeline_generation_status: "not_required"
    })
    .eq("id", grant_version_id);

  return Response with { success: true, analysis_only: true }
}

// Otherwise continue with AI Call #2 for pipeline generation...
```

In `GuidelinesUploader.tsx`:
- New prop: `executionEngine?: string`
- Body of POST includes: `execution_engine: executionEngine || "cloud_run"`

In `GrantEdit.tsx`:
- Pass prop: `<GuidelinesUploader executionEngine={executionEngineDefault} ... />`
- Also include engine in the retry handler's POST body

### UI Behavior Changes
- When engine is `claude` and guidelines are uploaded: processing completes faster (one AI call instead of two), toast says "Guidelines analyzed" instead of "Generated X-step pipeline"
- The Pipeline tab for Claude engine already shows the prompt template editor (not the pipeline editor), so no changes needed there
- The `ProcessingProgress` component and realtime subscription continue to work since they react to `ai_analysis_status` and `pipeline_generation_status` updates

### Files Modified
1. `supabase/functions/process-grant-guidelines/index.ts` -- skip pipeline generation for Claude
2. `src/components/admin/GuidelinesUploader.tsx` -- accept and pass engine prop
3. `src/pages/admin/GrantEdit.tsx` -- pass engine to uploader and retry handler
