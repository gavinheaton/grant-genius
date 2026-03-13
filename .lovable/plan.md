
Root cause confirmed from runtime logs (not environment config): `recover-finalize-report` returns a deliberate 400 because it cannot find **HTML** in completed steps. Your run has:
- `assemble_sections` with `report_markdown`
- `build_tables_sources` with `tables`/`all_sources`
- `finalize_report` still `running` with empty outputs

The recovery function currently only handles older `_html` step names and HTML-first outputs.

Implementation plan:

1) Update recovery step detection to support both pipeline variants  
- File: `supabase/functions/recover-finalize-report/index.ts`  
- Accept both naming styles:
  - `assemble_sections_html` and `assemble_sections`
  - `build_tables_sources_html` and `build_tables_sources`
  - `finalize_report_html` and `finalize_report`
- Keep backward compatibility for older runs.

2) Add markdown-first recovery path  
- In the same function, add extraction logic for `report_markdown` (from finalize/assemble steps) when `report_html` is missing.
- Add a lightweight markdown→HTML converter in the function (headings, paragraphs, lists, links, basic tables), so recovered reports still work with HTML consumers (email/PDF/export).
- Keep citation normalization on the produced HTML.

3) Make extraction utilities tolerant of real output shapes  
- Expand helpers to handle:
  - `tables` as either object map or array
  - `all_sources` from multiple candidate fields/steps
  - `data_gaps` from finalize/assemble/tables outputs
- Avoid object-only assumptions that break on array-based `tables`.

4) Save a complete assembled payload  
- Ensure `content_json.assembledReport` includes:
  - `report_html` (generated or extracted)
  - `report_markdown` (when available)
  - `tables`, `all_sources`, `data_gaps`
- This keeps compatibility with both HTML and markdown viewers and admin tooling.

5) Finalize-step status update compatibility  
- When marking recovery metadata, update whichever finalize step exists (`finalize_report` or `finalize_report_html`) instead of only the old name.

6) Improve admin error visibility (quick UX hardening)  
- File: `src/pages/admin/RunDetail.tsx`  
- Parse function error body (when available) so toast shows the actual backend reason instead of generic “non-2xx status code”.  
- This will make future recovery/debugging much faster.

Validation after implementation:
- From `/admin/runs/466ad6de-52ef-4d57-84ff-556b320b1325`, click **Recover Report** again.
- Confirm response is success (no 400), a new `reports` version is created, and `content_json` now contains `assembledReport`.
- Confirm report opens in viewer and export paths still work.

No database schema/RLS changes are required for this fix.
