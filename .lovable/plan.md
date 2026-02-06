

# Replit Worker Fix: Finalize Step Logic

## The Problem

The external worker currently fails at the `finalize_report_html` step with:
> "Finalize FAILED: No step output found with 'report_html' field"

This happens because the worker checks for `report_html` in **previous steps** before running the finalize AI prompt. But `report_html` doesn't exist yet - it's supposed to be **created** by the finalize step.

## Copy This Prompt to Replit

```text
I need you to fix a bug in the report generation worker's finalize step logic.

## Current Behavior (BROKEN)

When processing the terminal assembly step (named "finalize_report_html"), the worker:
1. Looks for a "report_html" field in previous step outputs
2. If not found, immediately fails with "No step output found with 'report_html' field"
3. Never executes the AI prompt for the finalize step

## Required Behavior (CORRECT)

For the step named "finalize_report_html" (the terminal assembly step):

1. **FIRST**: Execute the AI prompt for this step
   - The prompt is designed to merge data from previous steps:
     - Step N-2 ("assemble_sections_html"): contains `sections_html` field
     - Step N-1 ("build_tables_sources_html"): contains `tables` and `all_sources` fields
   - The AI should output a JSON object with `report_html` field

2. **SECOND**: Check if the AI response contains `report_html`
   - If yes: use it and call save_report with the content
   - If no or empty: proceed to fallback

3. **THIRD (FALLBACK ONLY)**: If AI fails or returns empty:
   - Get `sections_html` from step_outputs["stepN-2"] (the assemble_sections_html step)
   - Get `tables` and `all_sources` from step_outputs["stepN-1"] (the build_tables_sources_html step)
   - Perform deterministic merge:
     - Replace anchors like `<!-- TABLE:competitors -->` with corresponding table HTML
     - Append references section from all_sources
   - Save the merged result as report_html

## Worker-Proxy API Contract

The worker communicates with Supabase via POST requests to the worker-proxy edge function.

### Authentication
All requests require:
```
Authorization: Bearer ${WORKER_SECRET}
Content-Type: application/json
```

### get_run_context
Get all data needed to execute the pipeline:
```json
{
  "action": "get_run_context",
  "report_run_id": "uuid-here"
}
```

Response includes:
- `run`: { id, status, current_step, total_steps, phase, application: {...} }
- `prompt_bundle`: { id, system_prompt, steps: [...], is_grant_specific }
- `grant_context`: { name, guidelines_excerpt, rubric, summary } or null
- `existing_steps`: Array of { step_number, step_name, status, outputs_json, error_message }
- `step_outputs`: Normalized map like { "step0": {...}, "step1": {...}, ... } for completed steps

### update_step
Update a step's status/outputs:
```json
{
  "action": "update_step",
  "report_run_id": "uuid",
  "step_number": 13,
  "status": "completed",
  "outputs_json": { "report_html": "<html>..." },
  "completed_at": "2024-01-01T00:00:00Z"
}
```

### save_report
Create the final report record:
```json
{
  "action": "save_report",
  "report_run_id": "uuid",
  "content_json": {
    "assembledReport": {
      "title": "Research Report",
      "report_html": "<html>full report here</html>",
      "tables": { "competitors": "<table>...</table>" },
      "all_sources": [{ "title": "Source 1", "url": "https://..." }],
      "data_gaps": ["Market size for AU not found"]
    }
  },
  "citations_json": [{ "title": "...", "url": "..." }]
}
```

### update_run
Update run status:
```json
{
  "action": "update_run",
  "report_run_id": "uuid",
  "status": "completed",
  "phase": "complete",
  "completed_at": "2024-01-01T00:00:00Z"
}
```

### log_message
Send real-time logs:
```json
{
  "action": "log_message",
  "report_run_id": "uuid",
  "level": "info",
  "message": "Processing finalize step...",
  "details": { "any": "json" }
}
```

## Step Data Structure

Each step in `prompt_bundle.steps` has:
```typescript
{
  step_number: number,          // 0-indexed
  step_name: string,            // e.g., "finalize_report_html"
  step_description: string,
  prompt_template: string,      // May contain {{stepN}} variables
  model: string,                // Replit-compatible model name
  step_type: "ai_prompt" | "firecrawl_scrape" | "firecrawl_search",
  is_assembly_step: boolean,    // True for final assembly steps
  is_heavy: boolean,
  timeout_seconds: number | null,
}
```

## Variable Substitution

The prompt_template may contain these variables:
- `{{summary}}`, `{{publicArticleUrl}}`, `{{trl}}`, `{{ipStatus}}` - from application.inputs_json
- `{{grantName}}`, `{{grantGuidelines}}`, `{{grantRubric}}`, `{{grantSummary}}` - from grant_context
- `{{stepN}}` - outputs from step N (e.g., {{step11}} for assemble_sections_html output)
- `{{sources}}` - from step0 if it's a firecrawl step

## Pseudocode for Finalize Step

```python
def process_finalize_step(step, step_outputs, prompt_bundle, run_context):
    # 1. Try AI execution first
    prompt = substitute_variables(step.prompt_template, step_outputs, run_context)
    
    try:
        ai_response = call_gemini(prompt, step.model)
        parsed = parse_json(ai_response)
        
        if parsed.get("report_html") and len(parsed["report_html"]) > 500:
            # AI succeeded
            save_step_output(step.step_number, parsed)
            save_report(build_content_json(parsed))
            return
    except Exception as e:
        log_message("warn", f"AI finalize failed: {e}, attempting fallback")
    
    # 2. Fallback: deterministic merge
    sections_step = find_step_by_name(step_outputs, "assemble_sections_html")
    tables_step = find_step_by_name(step_outputs, "build_tables_sources_html")
    
    if not sections_step or not sections_step.get("sections_html"):
        raise Error("Cannot recover: no sections_html found")
    
    report_html = sections_step["sections_html"]
    tables = tables_step.get("tables", {}) if tables_step else {}
    all_sources = tables_step.get("all_sources", []) if tables_step else []
    
    # Replace table anchors
    for table_id, table_html in tables.items():
        anchor = f"<!-- TABLE:{table_id} -->"
        if anchor in report_html:
            report_html = report_html.replace(anchor, table_html)
    
    # Append references
    if all_sources:
        report_html += build_references_section(all_sources)
    
    # 3. Save
    final_output = {
        "report_html": report_html,
        "tables": tables,
        "all_sources": all_sources,
        "fallback_used": True
    }
    save_step_output(step.step_number, final_output)
    save_report(build_content_json(final_output))
```

## Key Fix Location

Look for code that does something like:
```python
# BROKEN: Checking BEFORE running the prompt
if step_name == "finalize_report_html":
    for key, output in step_outputs.items():
        if "report_html" in output:
            # This check happens BEFORE running the AI!
            ...
    raise Error("No step output found with report_html")  # <-- This is the bug
```

Change it to:
```python
# CORRECT: Run the prompt FIRST
if step_name == "finalize_report_html":
    # 1. Execute the AI prompt first
    ai_output = run_ai_prompt(step.prompt_template, ...)
    
    # 2. Check if AI produced report_html
    if ai_output.get("report_html"):
        save_and_complete(ai_output)
    else:
        # 3. Only NOW do the fallback
        fallback_merge(step_outputs)
```

## Environment Variables

The worker should have:
- `WORKER_PROXY_URL`: The URL to the worker-proxy edge function
- `WORKER_SECRET`: Shared secret for authentication
- `GOOGLE_AI_API_KEY` or `GEMINI_API_KEY`: For AI calls

## Expected Outcome

After this fix:
1. Step 13 (finalize_report_html) will execute its AI prompt
2. The AI will receive {{step11}} (sections_html) and {{step12}} (tables/sources)
3. The AI will merge them and output report_html
4. If AI fails, fallback merge will happen
5. Report will be saved successfully
```

## Summary

The core issue is that the worker is **checking for output before generating it**. The fix is to:

1. Run the AI prompt for the finalize step first
2. Only check for `report_html` in the AI response (not in previous steps)
3. Use fallback merge only if AI fails

This matches the intent documented in memory: "The external Cloud Run worker is mandated to execute the AI prompt for the terminal assembly step first to synthesize the report narrative. It utilizes a deterministic, non-AI merge only as a fallback."

