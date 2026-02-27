

## Fix: Generic Grant Pipeline Missing Assembly Steps

### Root Cause

The error "No step output found with 'sections_html' or 'report_html' field" comes from the external Cloud Run worker. The worker has hardcoded logic expecting a **4-step assembly architecture**:

```text
assemble_sections_html  --> produces sections_html
build_tables_sources_html --> produces tables + all_sources
clean_citations_apa     --> cleans citation markers
finalize_report_html    --> merges everything into report_html
```

The **AEA Innovate pipeline** (steps 18-21) has all four assembly steps, so it works. But the **Generic Grant Pipeline** (the one used by API calls) only has a single `finalize_report_html` step (step 9) that tries to do everything in one shot. The worker's finalize logic searches for a preceding step with `sections_html` or `report_html` in its output, finds nothing (only step0-step8 with analysis data), and fails.

### Fix: Add the 4-step assembly architecture to the Generic Grant Pipeline

Rather than modifying the external worker (which is deployed separately), we should align the Generic Grant pipeline with the same assembly architecture the worker expects. This means:

1. **Database update**: Insert three missing assembly steps into the Generic Grant pipeline (`bundle_id = 1e80ef66-532b-4237-bde8-6bcd09a22b2c`):
   - Step 9: `assemble_sections_html` (replaces current step 9)
   - Step 10: `build_tables_sources_html`
   - Step 11: `clean_citations_apa`
   - Step 12: `finalize_report_html` (moved from step 9)

2. **Prompt templates**: Use the same proven assembly prompt templates from `process-grant-guidelines` (`createHtmlAssemblySteps` function), adapted for the Generic pipeline's step references (steps 0-8 are the research steps).

### Technical Details

**Migration SQL** will:
- Delete the existing `finalize_report_html` step (step 9)
- Insert four properly structured assembly steps (9-12) with `is_assembly_step = true`
- Each step's prompt template will reference the correct preceding steps using `{{stepN}}` interpolation

**Step prompts** (adapted from the working AEA Innovate pattern):
- `assemble_sections_html`: Combines all research outputs (steps 0-8) into semantic HTML sections with `sections_html` output
- `build_tables_sources_html`: Extracts competitor, market sizing, and partner tables plus `all_sources` array
- `clean_citations_apa`: Converts internal markers to APA-format numeric citations
- `finalize_report_html`: Merges cleaned sections + tables + references into final `report_html`

### Why this is the right fix
- Aligns with the worker's expected contract (no worker changes needed)
- Matches the proven architecture that works for AEA Innovate
- Gives better output quality (specialized steps vs one monolithic prompt)
- Any existing failed runs can be re-triggered after the pipeline is updated

### Risk
- Any in-flight API report runs using the old pipeline will still fail (they're already failed anyway)
- New runs will use the updated pipeline automatically
