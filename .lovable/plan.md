# Fix Step 12 Timeout: Split Final Assembly into Sub-Steps

## ✅ COMPLETED

The 15-step pipeline is now implemented to resolve the Step 12 timeout issue.

### Changes Made

1. **Database Migration**
   - Updated `prompt_bundle_steps` constraint to allow steps 0-14
   - Changed `report_runs.total_steps` default from 13 to 15
   - Added Step 13 (build_tables_sources) and Step 14 (finalize_report) to active bundle
   - Updated Step 12 prompt to generate markdown sections only (slimmed down)

2. **Edge Functions**
   - `generate-report/index.ts`: Updated RESEARCH_STEPS to 15 steps, adjusted model/timeout logic
   - `resume-report-run/index.ts`: Split Step 12 into Steps 12-14, updated checkpoint/recovery logic

3. **Frontend**
   - `GenerationProgress.tsx`: Updated step labels for 15-step display

### New Pipeline Structure

| Step | Name | Purpose | Model | Timeout |
|------|------|---------|-------|---------|
| 0-11 | (unchanged) | Research steps | Various | 45-55s |
| **12** | `assemble_sections` | Generate report markdown only | Gemini-3-Flash-Preview | 55s |
| **13** | `build_tables_sources` | Extract tables + dedupe sources | Gemini-3-Flash-Preview | 55s |
| **14** | `finalize_report` | Merge into final JSON | Gemini-2.5-Flash-Lite | 45s |

### Expected Outcome

- Each sub-step completes well within the 60s edge function limit
- Checkpoints at Steps 12 and 13 provide recovery points
- Existing runs with 13 steps continue to work (backward compatible)
