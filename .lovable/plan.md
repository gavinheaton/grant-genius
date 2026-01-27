

# Fix Checkpoint Timing Issue for Report Generation

## Problem

The current implementation saves the checkpoint and changes status to `pending` **after** Step 5 completes. If the edge function times out during or after Step 4/5 but before the checkpoint save, the run remains stuck in `running` status with no way to recover.

```
Current Flow:
Step 4 → Step 5 AI call → Step 5 complete → Save checkpoint + status="pending"
                                              ↑
                                    Edge function timeout window
```

## Solution

Split the checkpoint logic so we:
1. Save checkpoint data **before** starting Step 5 (status stays "running" but data is preserved)
2. Update status to `pending` **immediately after** Step 5 completes
3. If anything fails mid-way, the checkpoint data is already saved

This ensures that even if the edge function times out, the data is preserved and can be used for recovery.

## Alternative Approach (Simpler)

Move the checkpoint save to **before Step 5** with a `pending` status. This way:
- Steps 1-4 run and complete
- Checkpoint is saved immediately (status = "pending")
- Function returns - Phase 2 will do Steps 5-8

This reduces the risk entirely by ending Phase 1 earlier.

## Recommended Implementation

### generate-report/index.ts changes

**Before (current - lines 389-446):**
```typescript
// Step 4: Find Competitors
await executeStep(supabase, reportRunId, 4, async () => { ... });

// Step 5: Calculate TAM
await executeStep(supabase, reportRunId, 5, async () => { ... });

// CHECKPOINT: Save progress after step 5 and return
await supabase.from("report_runs").update({
  checkpoint_data_json: reportContent,
  checkpoint_citations_json: citations,
  current_step: 5,
  status: "pending",
}).eq("id", reportRunId);
```

**After (fix):**
```typescript
// Step 4: Find Competitors
await executeStep(supabase, reportRunId, 4, async () => { ... });

// CHECKPOINT: Save progress BEFORE step 5 to prevent data loss on timeout
// Step 5 will be executed by resume-report-run
await supabase.from("report_runs").update({
  checkpoint_data_json: reportContent,
  checkpoint_citations_json: citations,
  current_step: 4, // Indicate we completed step 4
  status: "pending", // Signal checkpoint - frontend will detect and resume
}).eq("id", reportRunId);

console.log(`Checkpoint saved for report run ${reportRunId} at step 4`);
return; // Exit early - resume function will continue from step 5
```

### resume-report-run/index.ts changes

Update the checkpoint detection logic to accept step 4 as a valid checkpoint:

**Before (current - line 136):**
```typescript
if ((resumeFromStep !== 5 && resumeFromStep !== 8) || reportRun.status !== "pending") {
  return new Response(
    JSON.stringify({ error: "Report run is not at checkpoint" }),
    ...
  );
}
```

**After (fix):**
```typescript
// Accept steps 4, 5, or 8 as valid checkpoints
if (![4, 5, 8].includes(resumeFromStep) || reportRun.status !== "pending") {
  return new Response(
    JSON.stringify({ error: "Report run is not at checkpoint" }),
    ...
  );
}
```

Also update `processReportPhase` to handle resuming from step 4:

```typescript
if (resumeFromStep === 4) {
  // Phase 2a: Step 5 first, then 6-8, then checkpoint at 8
  
  // Step 5: Calculate TAM (moved from generate-report)
  await executeStep(supabase, reportRunId, 5, async () => {
    const tamPrompt = `Calculate the Total Addressable Market...`;
    const tamResult = await callAIWithRetry(tamPrompt, 5);
    reportContent.tam = tamResult;
    return { tam: tamResult };
  });
  
  // Continue with steps 6-8...
  // (fall through to existing Phase 2 logic)
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-report/index.ts` | Move checkpoint save to after Step 4 (before Step 5), set `current_step: 4` |
| `supabase/functions/resume-report-run/index.ts` | Accept step 4 as valid checkpoint, add Step 5 execution when resuming from step 4 |

## Expected Result

- Phase 1: Steps 1-4 run, checkpoint saved with `current_step: 4`, status = `pending`
- Phase 2: Steps 5-8 run, checkpoint saved with `current_step: 8`, status = `pending`
- Phase 3: Steps 9-10 run, report created, status = `completed`

This eliminates the timeout risk because the checkpoint is saved **before** any long-running step that could cause timeout.

