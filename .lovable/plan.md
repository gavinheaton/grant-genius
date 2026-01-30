

# Fix Step 12 Timeout: Split Final Assembly into Sub-Steps

## Problem Analysis

Step 12 (Final Assembly) is getting stuck because:

1. **Configured timeout (150s)** exceeds the Supabase Edge Function **wall-clock limit (~60s)**
2. The edge function spawns the AI call as a background async task and returns HTTP 200 immediately
3. When the platform terminates the function at ~60s, the AI process is killed mid-execution
4. The database is never updated, leaving the run in "running" status indefinitely

**Current Step 12 Workload:**
- Receives JSON outputs from all 12 preceding steps (potentially 50-100KB of data)
- Uses Gemini-3-Pro-Preview (the heaviest model)
- Produces a structured report with 11 sections, tables, sources, and data gaps
- Timeout set to 150 seconds (2.5x the platform limit)

---

## Solution: Split Step 12 into Three Sub-Steps

Instead of one monolithic assembly step, break it into:

| New Step | Name | Purpose | Model | Timeout |
|----------|------|---------|-------|---------|
| **Step 12** | `assemble_sections` | Generate the 11 report sections (markdown only) | Gemini-3-Flash-Preview | 55s |
| **Step 13** | `build_tables_sources` | Build all tables and deduplicated source list | Gemini-3-Flash-Preview | 55s |
| **Step 14** | `finalize_report` | Merge sections + tables + sources into final JSON | Gemini-2.5-Flash-Lite | 45s |

**Key benefits:**
- Each sub-step completes well within the 60s platform limit
- Uses lighter models for simpler tasks (cost + speed)
- Checkpoints between sub-steps provide recovery points
- Step 14 is mostly formatting/validation (fast, reliable)

---

## Implementation Details

### 1. Database Migration

Add 2 new step records to the pipeline (Steps 13-14):

```sql
-- Update total_steps from 13 to 15
ALTER TABLE report_runs ALTER COLUMN total_steps SET DEFAULT 15;

-- Note: Existing runs will retain their current total_steps value
-- New runs will automatically use 15 steps
```

### 2. Prompt Bundle Steps (Admin Console)

Add two new steps to the active prompt bundle:

**Step 13: build_tables_sources**
```
Extract and format all tables from step outputs.
Build deduplicated all_sources array with MLA citations.
Output: { tables: [...], all_sources: [...] }
```

**Step 14: finalize_report**
```
Merge report_markdown (from Step 12) with tables and sources (from Step 13).
Add data_gaps from all steps.
Validate citation integrity.
Output: Final report JSON matching schema.
```

### 3. Edge Function Changes

**File: `supabase/functions/generate-report/index.ts`**
- Update `RESEARCH_STEPS` array to include 3 assembly steps (total 15 steps: 0-14)
- Update default total_steps to 15

**File: `supabase/functions/resume-report-run/index.ts`**
- Add handlers for Steps 13 and 14
- Update Step 12 to produce intermediate output (sections only)
- Step 14 creates the final report (moves logic from current Step 12 completion block)
- Update checkpoint validation to accept steps 0-13 (Step 14 is final)

### 4. Frontend Changes

**File: `src/hooks/useReportGeneration.ts`**
- No changes needed (already handles arbitrary step counts)

**File: `src/components/workspace/GenerationProgress.tsx`**
- Update progress messaging for new steps (if hardcoded)

---

## Step-by-Step Changes

### A. Update Step Definitions

```text
Current 13 steps (0-12):
  0: build_source_pack
  1: extract_context
  2: competitor_research
  3: market_segments
  4: find_competitors
  5: market_sizing_source_pack
  6: calculate_tam
  7: calculate_sam
  8: calculate_som
  9: economic_impact
  10: competitor_table
  11: partner_businesses
  12: assemble_report (CURRENT - too big)

New 15 steps (0-14):
  0-11: (unchanged)
  12: assemble_sections (new - generates report_markdown only)
  13: build_tables_sources (new - builds tables + all_sources)
  14: finalize_report (new - merges and creates final report)
```

### B. Prompt Templates for New Steps

**Step 12 (assemble_sections) - ~55s**
- Input: All step outputs ({{step0}} through {{step11}})
- Task: Generate the 11 report sections as markdown
- Output: `{ report_markdown: string, section_metadata: {...} }`
- Model: Gemini-3-Flash-Preview (faster than Pro)

**Step 13 (build_tables_sources) - ~55s**
- Input: Step outputs + Step 12 section metadata
- Task: Extract all tables, build deduplicated MLA source list
- Output: `{ tables: [...], all_sources: [...] }`
- Model: Gemini-3-Flash-Preview

**Step 14 (finalize_report) - ~45s**
- Input: Step 12 markdown + Step 13 tables/sources
- Task: Merge into final JSON, validate citations, collect data_gaps
- Output: Complete report JSON matching current schema
- Model: Gemini-2.5-Flash-Lite (simpler task)
- Creates report record and marks run complete

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-report/index.ts` | Add 2 new steps to RESEARCH_STEPS array, update total_steps default |
| `supabase/functions/resume-report-run/index.ts` | Split Step 12 logic into Steps 12-14, move report creation to Step 14, update checkpoint validation |
| Database migration | Insert 2 new prompt_bundle_steps rows for active bundle |

---

## Rollback Plan

If issues arise:
1. Revert edge function changes
2. Delete Step 13-14 prompt bundle rows
3. Existing runs with 13 steps continue to work (isolated)

---

## Risk Mitigation

- **Backward compatibility**: Runs created before the change retain their 13-step structure
- **Checkpoint safety**: Each new step checkpoints, so failures can resume
- **Testing**: Can test with a single application before deploying broadly
- **Admin visibility**: New steps appear in the Prompt Bundle editor for tuning

---

## Expected Outcome

- Step 12-14 each complete in ~45-55 seconds (well under 60s limit)
- Total assembly time may be similar (~2-3 minutes) but now reliable
- Stuck runs can recover from any intermediate checkpoint
- Admin can tune prompts/timeouts for each sub-step independently

