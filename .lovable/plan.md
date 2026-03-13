

## Fix: `resume-report-run` Does Not Produce Renderable Reports

### Problem
When `resume-report-run` completes a run and creates a report via `createFinalReport`, it saves the raw `reportContent` map (step outputs keyed by step name) directly as `content_json`. The frontend (`ReportViewer`, `PdfReportRenderer`, `HtmlReportViewer`) all expect `content_json.assembledReport.report_markdown` — the structure that the Cloud Run worker's `save_report` action in `worker-proxy` produces.

This means **any report completed via Resume will appear empty or broken** in the UI.

For this specific run (`466ad6de`), step 12 (`assemble_sections`) has `report_markdown` and step 13 (`build_tables_sources`) has `tables`/`all_sources`, but they were never wrapped into the expected `assembledReport` structure.

### Root Cause
The `createFinalReport` function in `resume-report-run/index.ts` (line 921) does:
```typescript
content_json: reportContent,  // raw map of step outputs
```

It should instead construct the `assembledReport` wrapper from the assembly step outputs, matching what `worker-proxy` produces.

### Fix

**`supabase/functions/resume-report-run/index.ts`** — Update `createFinalReport` to:

1. After running the final step, extract the assembly outputs from `reportContent`:
   - Look for `report_markdown` in the finalize/assemble step outputs
   - Look for `tables`, `all_sources`, `data_gaps` in the build_tables/finalize outputs
   - Look for `report_html` if present

2. Construct a proper `assembledReport` structure:
```typescript
const assembledReport = {
  report_markdown: finalizeOutput?.report_markdown || assembleOutput?.report_markdown || "",
  report_html: finalizeOutput?.report_html || null,
  tables: tablesOutput?.tables || finalizeOutput?.tables || [],
  all_sources: tablesOutput?.all_sources || finalizeOutput?.all_sources || [],
  data_gaps: finalizeOutput?.data_gaps || assembleOutput?.data_gaps || [],
};
```

3. Save as `content_json: { assembledReport, ...reportContent }` so both the frontend rendering path (`assembledReport`) and any diagnostic tooling (raw step outputs) work.

### Immediate Data Fix
For the existing broken report (`0d451477`), we also need to fix the data. I'll update the `createFinalReport` function to handle the assembly output extraction, and then provide instructions to re-run the finalize step for this report using Resume.

### Files to Modify
- `supabase/functions/resume-report-run/index.ts` — Update `createFinalReport` to construct the `assembledReport` wrapper from step outputs before saving

