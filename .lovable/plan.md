

# Fix: Pipeline Fails Because Worker Expects `report_html` But Gets `report`

## Root Cause Analysis

The error chain is:

```text
Step 0 (one_prompt) → outputs { "report": "<html>..." } ✓ succeeds
                                    ↓
Step 1 (finalize_report_html) → Worker sees missingVars, triggers deterministic merge
                                    ↓
Worker deterministic merge → Searches for 'report_html' field in step outputs
                                    ↓
                           Field doesn't exist! Only 'report' exists
                                    ↓
                           ❌ "Finalize FAILED: No step output found with 'report_html'"
```

The worker's finalization logic is **hardcoded to look for `report_html`**, but your `one_prompt` step outputs a field named `report`.

Additionally, the `finalize_report_html` prompt template has invalid variable references that don't exist in this 2-step pipeline.

## Solution: Two-Part Fix

### Part 1: Fix the Prompt Bundle (Immediate)

Update the `finalize_report_html` step in bundle `6abbcd3f-3cf0-41ef-869b-2138abfbc788` to:

1. **Remove invalid variable references**: Replace `{{one_prompt}}`, `{{sources}}`, `{{step1}}`, `{{step2}}` with `{{step0}}`
2. **Make it a simple passthrough**: Since Step 0 already generates a complete report, the finalize step should just extract and output it

**New Prompt Template for Step 1:**
```text
TASK: Extract the report HTML from the previous step and output it in the required format.

PREVIOUS STEP OUTPUT:
{{step0}}

INSTRUCTIONS:
1. Extract the HTML report content from the 'report' field of the input above
2. Output it exactly as-is in the 'report_html' field

OUTPUT (return ONLY this JSON, no code fences):
{
  "report_html": "the HTML content from the input's 'report' field",
  "metadata": {
    "project_title": "extracted from report title",
    "source": "passthrough from step0"
  },
  "unknowns": []
}
```

This is a simple extraction task that even a lite model can handle.

### Part 2: Fix Step 0 Output Field Name (Recommended)

Update the `one_prompt` step prompt template to output `report_html` instead of `report`:

Find and replace in the prompt's OUTPUT SCHEMA section:
```text
// Change FROM:
{ "report": "..." }

// Change TO:
{ "report_html": "..." }
```

This makes Step 0 compatible with the worker's expectations.

### Part 3 (Optional): Update Worker's Deterministic Finalization

The external Cloud Run worker's finalization code should use flexible field detection (like our recovery function):

```javascript
// Current (hardcoded):
const reportHtml = stepOutputs.find(s => s.report_html);

// Should be (flexible):
const HTML_FIELD_PRIORITY = ["report_html", "report", "html", "content", "sections_html"];
const reportHtml = stepOutputs.find(s => 
  HTML_FIELD_PRIORITY.some(field => s[field] && s[field].length > 500)
);
```

This would make the worker resilient to different pipeline output conventions.

---

## Implementation Steps

### Step 1: Update Step 0 (`one_prompt`) Output Schema

SQL to update the prompt:
```sql
UPDATE prompt_bundle_steps
SET prompt_template = REPLACE(
  prompt_template,
  '"report":',
  '"report_html":'
)
WHERE bundle_id = '6abbcd3f-3cf0-41ef-869b-2138abfbc788'
  AND step_name = 'one_prompt'
  AND prompt_template LIKE '%"report":%';
```

### Step 2: Simplify Step 1 (`finalize_report_html`)

Replace the complex finalize prompt with a simple passthrough that:
- Takes `{{step0}}` as input
- Extracts the `report_html` field
- Outputs it directly

### Step 3: Test the Pipeline

Run a new report generation to verify:
1. Step 0 outputs `{ "report_html": "..." }`
2. Step 1 (finalize) successfully extracts and outputs the HTML
3. Report is saved correctly

---

## Files to Modify

| Source | Change |
|--------|--------|
| Database: `prompt_bundle_steps` (bundle `6abbcd3f...`) | Update `one_prompt` output field from `report` to `report_html` |
| Database: `prompt_bundle_steps` (bundle `6abbcd3f...`) | Simplify `finalize_report_html` prompt to use only `{{step0}}` |

---

## Alternative: Remove Finalize Step Entirely

Since your `one_prompt` step already generates a complete HTML report, you could:

1. **Delete the `finalize_report_html` step** from the bundle
2. Update `one_prompt` to output `report_html` field
3. Configure the worker to recognize single-step pipelines

This would make the pipeline truly single-step and eliminate the finalization failure entirely.

---

## Quick Manual Fix (For Immediate Testing)

If you want to test immediately without code changes:

1. Click the **"Recover Final Step"** button on the failed run
2. The recovery function (which we just updated) will use Strategy 2 to find the `report` field in Step 0
3. It will create the report successfully

This works because our recovery function already has flexible field detection. The permanent fix is updating the prompt bundle so future runs don't need manual recovery.

