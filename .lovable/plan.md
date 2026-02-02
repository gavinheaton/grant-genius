
## What’s happening (root cause)

You’re seeing the same error again because the “quality check” we added only validates the *prompt text* (it contains `"report_html"`, references `{{stepN}}`, etc.). It cannot guarantee the model will actually return valid JSON with a `report_html` key at runtime.

In the failing run we can see exactly what happened in the database:

- `total_steps = 9` (steps 0–8)
- Steps 0–7 completed successfully
- Step 8 `finalize_report_html` **failed** with:
  `Finalize FAILED: No step output found with 'report_html' field. Available: step0..step7`
- `finalize_report_html.outputs_json` is `{}` (empty object)

So the pipeline structure is correct; the model simply didn’t produce a usable `report_html` payload for the final step. The external Cloud Run worker then fails fast because it requires `report_html` to exist before it saves the report.

This is why “we blocked bad prompts” didn’t prevent it: it wasn’t a bad prompt; it was a bad model response.

## Goal

Make this class of failure recoverable and (ideally) self-healing by adding a deterministic, non-AI fallback finalizer that can assemble `report_html` from:
- Step 6 `assemble_sections_html.outputs_json.sections_html`
- Step 7 `build_tables_sources_html.outputs_json.tables` + `all_sources`
…and then save the report.

## Implementation plan

### 1) Add a deterministic finalization path (backend function)
Create a new backend function (or extend an existing one) that:

Input:
- `reportRunId`

Logic:
1. Load the report run, application, grant_version_id, template_version_id, user_id
2. Load `report_run_steps` for the run
3. Find the latest completed `assemble_sections_html` step output:
   - must have `sections_html` (string)
4. Find the latest completed `build_tables_sources_html` step output:
   - must have `tables` (object)
   - may have `all_sources` (array)
5. Deterministically build `report_html`:
   - Replace table anchors in `sections_html`:
     - `<!-- TABLE:competitors -->`
     - `<!-- TABLE:market_sizing -->`
     - `<!-- TABLE:partners -->`
   - If an anchor is missing, append the relevant table under a sensible `<h2>` heading at the end
   - Append a `<h2>References</h2>` section (build `<ul><li>…</li></ul>` from `all_sources`)
6. Construct `content_json` in the format the frontend expects:
   ```json
   {
     "assembledReport": {
       "title": "...",
       "report_html": "...",
       "tables": {...},
       "all_sources": [...],
       "data_gaps": [...]
     }
   }
   ```
7. Insert a `reports` row (new version_number) and mark run as `completed`
8. Update `report_run_steps` for `finalize_report_html`:
   - set `status=completed`
   - set `outputs_json` to include at least `{ report_html, ... }`
9. Credit accounting:
   - Check whether an `entitlement_consumptions` row exists for this run
   - If none exists (because the worker refunded on failure), re-consume one credit:
     - choose a non-expired entitlement with available quantity
     - increment `entitlements.used_quantity`
     - insert `entitlement_consumptions` row linked to `report_run_id` (and optionally update it with `report_id` after report insert)

Result: even if AI fails on the last step, we can still complete the report reliably.

### 2) Wire this recovery into the UI retry flow
Update the report retry logic so that when the failure is specifically this finalization error, we call the deterministic recovery instead of re-running the AI final step again.

Detection:
- If the failed step is `finalize_report_html`
- And `error_message` contains: `No step output found with 'report_html' field`

Behavior:
- Show a “Recover final step” action (or reuse existing “Retry” button but route it to recovery)
- Call the new backend function with `reportRunId`
- On success:
  - refresh the reports list
  - show a toast “Recovered report successfully”

### 3) Add better diagnostics so we can prove what failed next time
Add logging/telemetry improvements to make debugging fast:
- In the Cloud Run worker proxy `update_step`, log the keys and a short preview for `finalize_report_html` attempts
- Store a short `raw_output_preview` (if available from the worker) into `error_message` or a dedicated log action (if we have a logging table) so we can see whether the model returned:
  - non-JSON
  - JSON missing the key
  - truncated output

(If the Cloud Run worker does not send raw output today, we can’t recover it; the deterministic fallback is the pragmatic fix.)

### 4) Ensure “publish guardrail” still applies (no regression)
Keep the publish-time validation we added, but clarify its scope in UI copy:
- “This validates the pipeline configuration; it cannot guarantee the model output. Final step has automatic recovery.”

## Testing plan (must-do)
1. Create a grant with a 9-step pipeline (like the failing one).
2. Force a failure scenario:
   - Temporarily edit the finalize prompt to encourage malformed output (or simulate step8 outputs_json being `{}`).
3. Confirm:
   - Run fails with the same error
   - UI shows “Recover final step”
   - Recovery completes and a report is created
   - Report viewer loads `assembledReport.report_html` correctly
   - PDF/DOCX exports still work
4. Confirm credit behavior:
   - used_quantity changes by +1 net (no free report)
   - `entitlement_consumptions` row exists after recovery

## Files expected to change
- New backend function:
  - `supabase/functions/recover-finalize-report/index.ts` (or similar)
- Frontend retry/recovery wiring:
  - `src/hooks/useReportGeneration.ts` (detect error and call recovery)
  - Potentially `src/components/workspace/GenerationProgress.tsx` or wherever the retry button is rendered
- Optional diagnostics:
  - `supabase/functions/worker-proxy/index.ts` (more logging around finalize step failures)

## Why this is the right fix
- It removes dependence on model compliance for the final “glue step”
- It works for any pipeline length because it keys off step names (`assemble_sections_html`, `build_tables_sources_html`, `finalize_report_html`)
- It directly addresses the exact observed failure mode (final step outputs `{}`)

