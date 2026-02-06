

# Fix: Eliminate Finalize Step for Single-Prompt Pipeline

## Problem

The external Cloud Run worker's finalization logic is failing because:

1. Step 0 (`one_prompt`) generates a complete HTML report successfully
2. Step 1 (`finalize_report_html`) tries to run but has mismatched variable expectations
3. The worker's deterministic fallback then fails to find `report_html` in prior step outputs

The worker expects either a full multi-step pipeline (with dedicated assembly steps) or direct `report_html` output. The 2-step "passthrough" pattern doesn't work reliably.

## Solution: Single-Step Pipeline

Convert the AMT Bio pipeline to a true single-step pipeline where Step 0 outputs the final `report_html` directly, and remove the finalize step.

### Changes Required

**1. Update Step 0 (`one_prompt`) prompt template**

Ensure the OUTPUT SCHEMA explicitly outputs `report_html` as the main field:

```text
OUTPUT (return ONLY this JSON, no code fences):
{
  "report_html": "full HTML document here",
  "metadata": { ... },
  "unknowns": [ ... ]
}
```

The prompt may already have this, but we need to verify the actual output field name matches.

**2. Delete Step 1 (`finalize_report_html`) from bundle**

Remove the passthrough step entirely. With only 1 step in the pipeline:
- The worker completes Step 0
- The worker sees Step 0 is the final step
- The worker saves the report directly from Step 0's `report_html` output

**3. How the Worker Handles This**

The external worker has logic to detect when a step is the "final step" (highest step number in the pipeline). When it completes the final step, it automatically:
- Extracts `report_html` from the step output
- Creates the report record
- Marks the run as completed

By making Step 0 the only (and thus final) step, the worker's standard completion logic kicks in.

---

## Technical Details

### Current State

```text
Bundle: 6abbcd3f-3cf0-41ef-869b-2138abfbc788 (AMT Bio Single Prompt)
├── Step 0: one_prompt (outputs report_html) ✓
└── Step 1: finalize_report_html (passthrough - CAUSES FAILURE)
```

### Target State

```text
Bundle: 6abbcd3f-3cf0-41ef-869b-2138abfbc788 (AMT Bio Single Prompt)
└── Step 0: one_prompt (outputs report_html, IS FINAL STEP) ✓
```

### Database Changes

```sql
-- 1. Verify Step 0 outputs report_html (not report)
-- Already confirmed from query: has_report_html_output = true

-- 2. Delete the finalize step
DELETE FROM prompt_bundle_steps 
WHERE bundle_id = '6abbcd3f-3cf0-41ef-869b-2138abfbc788'
  AND step_name = 'finalize_report_html';
```

### No Code Changes Required

The worker already handles single-step pipelines correctly when the final step outputs `report_html`. No edge function or frontend changes needed.

---

## Why This Works

The external worker's completion logic:

```javascript
// Pseudocode from worker
if (currentStep === totalSteps - 1) {
  // This is the final step - save the report
  const reportHtml = stepOutput.report_html;
  if (reportHtml) {
    await saveReport(reportHtml);
    await markRunCompleted();
  }
}
```

With Step 0 as the only step (total_steps = 1), Step 0 becomes the final step, and the worker's save logic triggers immediately after Step 0 completes.

---

## Implementation Steps

1. **Delete Step 1** from the prompt bundle via the admin UI or SQL
2. **Start a new report run** (important: don't retry an old run)
3. **Verify completion**: Step 0 completes → Report saved → Run marked complete

---

## Fallback: Update Worker Logic (External System)

If deleting the finalize step doesn't work, the external worker code needs to be updated to use flexible field detection (like our recovery function):

```javascript
// Instead of:
const reportHtml = stepOutput.report_html;

// Use flexible detection:
const HTML_FIELDS = ["report_html", "report", "html", "content"];
const reportHtml = HTML_FIELDS.map(f => stepOutput[f]).find(v => v && v.length > 500);
```

This is an external system change outside of Lovable.

---

## Files to Modify

| Location | Change |
|----------|--------|
| Database: `prompt_bundle_steps` | Delete `finalize_report_html` step from bundle `6abbcd3f...` |

---

## Testing Checklist

- [ ] Delete the finalize step from the bundle
- [ ] Verify bundle now has only 1 step (Step 0)
- [ ] Start a fresh report run on an AMT Bio application  
- [ ] Verify `total_steps` is set to 1 in the new run
- [ ] Confirm report completes without needing recovery

