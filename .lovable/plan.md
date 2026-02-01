

# Plan: Fix Pipeline Selection to Use Grant-Specific Step Count

## Problem Summary

When creating a new report run, the `generate-report` edge function:

1. **Hardcodes 15 steps** from `RESEARCH_STEPS` array (lines 13-29)
2. **Creates step records** using this hardcoded array (lines 443-450)
3. **Never queries** the grant-specific bundle to get the actual step count

Meanwhile, the `worker-proxy` correctly selects the AEA Ignite bundle (11 steps), but the database already has 15 step records. This causes:
- Progress tracking mismatch (shows 15 steps when only 11 exist in the pipeline)
- Potential failures when the worker tries to execute steps 11-14 that don't exist in the bundle

## Technical Root Cause

```text
generate-report/index.ts (lines 13-29):
┌─────────────────────────────────────────────────┐
│ const RESEARCH_STEPS = [                        │  ← HARDCODED 15 STEPS
│   { name: "build_source_pack", ... },          │
│   ...                                           │
│   { name: "finalize_report", ... },            │
│ ];                                              │
└─────────────────────────────────────────────────┘
              │
              ▼
generate-report/index.ts (line 424):
┌─────────────────────────────────────────────────┐
│ total_steps: RESEARCH_STEPS.length, // 15      │  ← ALWAYS 15
└─────────────────────────────────────────────────┘
```

## Solution

Modify `generate-report` to:

1. Check if the application's grant version has a linked prompt bundle
2. If yes, query the prompt bundle's step count and use those step names
3. If no, fall back to the hardcoded `RESEARCH_STEPS` array

## Changes Required

### File: `supabase/functions/generate-report/index.ts`

**Change 1: Expand the grant_version query (around line 323)**

Add `prompt_bundle_id` and `pipeline_generation_status` to the select:

```typescript
grant_version:grant_versions!inner(
  execution_engine_default,
  edge_allowed,
  prompt_bundle_id,
  pipeline_generation_status
)
```

**Change 2: Add function to fetch grant-specific pipeline steps**

After `fetchGrantContext` function, add a new function:

```typescript
async function fetchGrantPipelineSteps(
  supabase: any, 
  promptBundleId: string
): Promise<Array<{step_number: number; step_name: string; step_description: string}> | null> {
  try {
    const { data: steps, error } = await supabase
      .from("prompt_bundle_steps")
      .select("step_number, step_name, step_description")
      .eq("bundle_id", promptBundleId)
      .order("step_number", { ascending: true });

    if (error || !steps || steps.length === 0) {
      console.log("No grant-specific pipeline steps found");
      return null;
    }

    console.log(`Found ${steps.length} grant-specific pipeline steps`);
    return steps;
  } catch (e) {
    console.error("Error fetching grant pipeline steps:", e);
    return null;
  }
}
```

**Change 3: Determine step source before creating report run (around line 415)**

After determining execution engine, check for grant-specific pipeline:

```typescript
// Determine which pipeline steps to use
let pipelineSteps: Array<{step_number: number; step_name: string; description?: string}>;
let usingGrantPipeline = false;

// Check if grant has a published custom pipeline
if (
  grantVersion?.prompt_bundle_id && 
  grantVersion?.pipeline_generation_status === "published"
) {
  const grantSteps = await fetchGrantPipelineSteps(
    supabaseAdmin, 
    grantVersion.prompt_bundle_id
  );
  
  if (grantSteps && grantSteps.length > 0) {
    pipelineSteps = grantSteps.map(s => ({
      step_number: s.step_number,
      step_name: s.step_name,
      description: s.step_description || s.step_name,
    }));
    usingGrantPipeline = true;
    console.log(`Using grant-specific pipeline with ${pipelineSteps.length} steps`);
  } else {
    // Fallback to default
    pipelineSteps = RESEARCH_STEPS.map((s, i) => ({
      step_number: i,
      step_name: s.name,
      description: s.description,
    }));
  }
} else {
  // Use default pipeline
  pipelineSteps = RESEARCH_STEPS.map((s, i) => ({
    step_number: i,
    step_name: s.name,
    description: s.description,
  }));
}
```

**Change 4: Update report run creation (line 417-430)**

Use the dynamic step count:

```typescript
const { data: reportRun, error: runError } = await supabaseAdmin
  .from("report_runs")
  .insert({
    application_id: applicationId,
    report_template_version_id: templateVersion.id,
    status: "running",
    current_step: 0,
    total_steps: pipelineSteps.length,  // ← DYNAMIC: 11 for AEA, 15 for default
    started_at: new Date().toISOString(),
    execution_engine: executionEngine,
    execution_engine_reason: usingGrantPipeline 
      ? "grant_specific_pipeline" 
      : executionEngineReason,
  })
  .select("id, execution_engine")
  .single();
```

**Change 5: Update step records creation (lines 443-450)**

Use the dynamic pipeline steps:

```typescript
const stepRecords = pipelineSteps.map((step) => ({
  report_run_id: reportRun.id,
  step_number: step.step_number,
  step_name: step.step_name,
  status: "pending" as const,
}));

await supabaseAdmin.from("report_run_steps").insert(stepRecords);

console.log(`Created ${stepRecords.length} step records for run ${reportRun.id}`);
```

## Validation

After implementation:

1. Create a new report for AEA Ignite 2026
2. Verify `total_steps = 11` in the `report_runs` table
3. Verify 11 step records are created in `report_run_steps` (steps 0-10)
4. Verify progress UI shows 11 total steps
5. Verify the report completes successfully using the grant-specific prompts

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Grant has `prompt_bundle_id` but status is `draft` | Falls back to default 15-step pipeline |
| Grant has `prompt_bundle_id` but bundle has no steps | Falls back to default 15-step pipeline |
| Grant has no linked bundle | Uses default 15-step pipeline |
| Grant has published bundle with 11 steps | Creates 11 step records |

