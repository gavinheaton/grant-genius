

# Fix: Step Numbering Mismatch Between Worker and Database

## Problem Identified

The external Cloud Run worker uses **1-indexed step numbering** (steps 1-15) while the database and Edge Functions use **0-indexed step numbering** (steps 0-14). This causes the worker to look for data in the wrong step.

### Evidence from Logs

| Worker Log Display | Worker's Step # | Database Step # | Step Name |
|-------------------|-----------------|-----------------|-----------|
| "Step 13/15: assemble_sections" | 13 | 12 | assemble_sections |
| "Step 14/15: build_tables_sources" | 14 | 13 | build_tables_sources |
| Error: "step12.report_markdown missing" | Looking at 12 | Really step 11 | partner_businesses |

### Root Cause

When the worker executes step 14 (1-indexed) and requests `step12` data:
- Worker thinks step 12 = `assemble_sections` (which has `report_markdown`)
- But `existing_steps[12]` in the database = step 12 (0-indexed) = `assemble_sections`
- The offset is correct **only if** the worker indexes by `step_number` field

The actual issue: The worker is accessing `existing_steps` **by array index** instead of by `step_number` field, OR there's a field naming inconsistency.

### Database Query Results

The step outputs are stored correctly:

| step_number | step_name | Has report_markdown? |
|-------------|-----------|---------------------|
| 11 | partner_businesses | NO |
| 12 | assemble_sections | YES - has `report_markdown` |
| 13 | build_tables_sources | NO (has `tablesSources`) |
| 14 | finalize_report | Empty (failed) |

## Solution Options

Since the external Cloud Run worker is **outside this codebase**, we have two options:

### Option A: Fix the External Worker (Recommended)

Update the Cloud Run worker to:
1. Access steps by `step_number` field, not array index
2. Use the correct 0-indexed step numbers when accessing prior step data
3. When processing step 14 (0-indexed), look for `existing_steps.find(s => s.step_number === 12)` to get `assemble_sections`

### Option B: Normalize Step Data in worker-proxy

Add a transformation layer in `worker-proxy/get_prompt_bundle` to provide step outputs in a format the worker expects:
1. Create a `step_outputs` object keyed by step number
2. Map each step's `outputs_json` to `step{N}` keys
3. Flatten nested structures like `tablesSources` to top-level

## Technical Details for Option B

In `worker-proxy/index.ts`, modify the `handleGetRunContext` function to include a normalized `step_outputs` map:

```text
// After fetching existing_steps, create normalized output map
const step_outputs: Record<string, unknown> = {};

for (const step of steps || []) {
  if (step.status === "completed" && step.outputs_json) {
    // Flatten nested structures and make accessible by step number
    step_outputs[`step${step.step_number}`] = step.outputs_json;
  }
}

// Include in response
return jsonResponse({
  run: { ... },
  prompt_bundle: { ... },
  grant_context: grantContext,
  existing_steps: steps || [],
  step_outputs,  // Add this normalized map
});
```

The worker can then access:
- `step_outputs.step12.report_markdown` for assemble_sections output
- `step_outputs.step13.tablesSources` for build_tables_sources output

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/worker-proxy/index.ts` | Add `step_outputs` normalization in `handleGetRunContext` |

## Implementation Notes

1. The existing `existing_steps` array remains unchanged for backward compatibility
2. The new `step_outputs` provides consistent access by step number
3. Step outputs are only included for completed steps
4. This fix doesn't require changes to the external worker immediately

## Success Criteria

1. Worker can access step data using `step_outputs.step12.report_markdown`
2. Step 14 (finalize_report) successfully merges sections with tables
3. Reports complete without "step12.report_markdown is missing" error

## Risk Mitigation

This change is additive and backward-compatible:
- Existing `existing_steps` array remains unchanged
- New `step_outputs` is an additional convenience field
- External worker can be updated incrementally to use the new format

