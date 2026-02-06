

# Fix: Single-Prompt Pipeline Finalization Failure

## Problem Summary

The AMT Bio pipeline (Bundle `6abbcd3f-3cf0-41ef-869b-2138abfbc788`) is failing at Step 1 (`finalize_report_html`) because:

1. Step 0 (`one_prompt`) successfully generates a complete HTML report with `report_html` field
2. Step 1 tries to run with template `{{step0}}` but receives `undefined` because the external worker isn't interpolating step outputs correctly
3. The worker then fails with "No finalize step output found with 'report_html' field"

## Root Cause

The external Cloud Run worker has a bug: it's not properly providing prior step outputs for variable interpolation in subsequent steps. The `{{step0}}` placeholder is not being replaced with the actual Step 0 output before sending to the AI.

## Solution: True Single-Step Pipeline

Since we cannot modify the external worker code from Lovable, the solution is to eliminate the dependency on step interpolation by making Step 0 the **only and final step**. This leverages the worker's existing terminal-step detection logic.

### Changes Required

**1. Delete the `finalize_report_html` step from the bundle**

```sql
DELETE FROM prompt_bundle_steps 
WHERE bundle_id = '6abbcd3f-3cf0-41ef-869b-2138abfbc788'
  AND step_name = 'finalize_report_html';
```

**2. Update the external worker (external system change)**

The external worker needs to be updated to handle single-step pipelines where:
- `total_steps = 1`
- Step 0 is the terminal step (index 0 = total_steps - 1)
- `report_html` should be extracted from Step 0's output

Currently, the worker's finalization logic expects a step specifically named `finalize_report_html`. This needs to be updated to:

```javascript
// Pseudocode for worker fix
const isTerminalStep = (currentStepIndex === totalSteps - 1);
if (isTerminalStep) {
  // Look for report_html in current step output
  const reportHtml = stepOutput.report_html;
  if (reportHtml) {
    await saveReport(reportHtml);
    await markRunCompleted();
  }
}
```

**3. Alternative: Use the recover-finalize-report function**

If the external worker cannot be updated immediately, users can use the "Recover Report" button after Step 0 completes. The `recover-finalize-report` edge function already has multi-strategy logic to extract `report_html` from any completed step.

## Technical Details

### Current State (Failing)

```text
Bundle: 6abbcd3f-3cf0-41ef-869b-2138abfbc788
├── Step 0: one_prompt (outputs report_html) ✓ COMPLETES
└── Step 1: finalize_report_html ({{step0}} not interpolated) ✗ FAILS
```

### Target State (Working)

```text
Bundle: 6abbcd3f-3cf0-41ef-869b-2138abfbc788
└── Step 0: one_prompt (outputs report_html, IS TERMINAL) ✓
```

### Worker Requirements for Single-Step Support

The external worker must be updated to:

1. Detect terminal step: `currentStep === totalSteps - 1`
2. Extract `report_html` from that step's output
3. Call `save_report` action via worker-proxy
4. Mark run as completed

### Verified Evidence from Logs

```text
04:43:25Z [DIAG] update_step: run=392b8b69..., step=0, status=completed
04:43:25Z [DIAG] update_step outputs keys: report_html, metadata, unknowns
04:43:25Z [DIAG] update_step outputs preview: {"report_html":"<!DOCTYPE html>..."}
04:43:30Z [PHASE] Run transitioning to phase: assembly
04:43:30Z [DIAG] update_step: run=392b8b69..., step=1, status=running
04:43:30Z [DIAG] update_step outputs preview: undefined  ← BUG: {{step0}} not interpolated
04:43:33Z [DIAG] update_step: run=392b8b69..., step=1, status=failed
```

## Implementation Steps

### Immediate (Lovable)

1. Delete the `finalize_report_html` step from bundle `6abbcd3f...`
2. Document the external worker fix requirement

### External System (Cloud Run Worker)

The worker code needs to be updated with this logic:

```javascript
// After completing any step, check if it's the terminal step
if (currentStepNumber === bundle.steps.length - 1) {
  // This is the final step - look for report_html
  const reportHtml = stepOutput.report_html;
  if (reportHtml && reportHtml.length > 100) {
    // Save the report
    await workerProxy("save_report", {
      report_run_id: runId,
      content_json: { report_html: reportHtml },
      citations_json: stepOutput.citations || []
    });
    // Mark run completed
    await workerProxy("update_run", {
      report_run_id: runId,
      status: "completed",
      phase: "complete",
      completed_at: new Date().toISOString()
    });
    return; // Done
  }
}
```

### Fallback (User Action)

Until the worker is fixed, users can:
1. Wait for Step 0 to complete
2. Click "Recover Report" button 
3. The `recover-finalize-report` function will extract `report_html` from Step 0

## Files to Modify

| Location | Change |
|----------|--------|
| Database: `prompt_bundle_steps` | Delete `finalize_report_html` step |
| External: Cloud Run Worker | Update terminal step detection and report extraction logic |

## Testing Checklist

- [ ] Delete the finalize step from bundle
- [ ] Start a fresh report run (creates run with `total_steps = 1`)
- [ ] Verify Step 0 completes with `report_html` output
- [ ] If worker doesn't auto-save: click "Recover Report" button
- [ ] Confirm report is saved and viewable

