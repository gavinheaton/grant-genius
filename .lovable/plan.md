

## Replace Regex QA with AI-Powered Pipeline Validation — ✅ DONE

### What was implemented

**Two-Tier validation system:**

1. **Tier 1 (instant, automatic):** `checkStructuralIssues()` — duplicate names, numbering gaps, empty prompts. Plus `validatePostReorder()` for forward reference detection.

2. **Tier 2 (on-demand, AI):** `validate-pipeline` edge function sends steps to Gemini for semantic analysis covering data flow, redundancy, sequencing, completeness, and contract mismatches.

### Files changed

| File | Change |
|------|--------|
| `supabase/functions/validate-pipeline/index.ts` | **New** — edge function calling Gemini for pipeline analysis |
| `src/lib/pipelineQualityGate.ts` | **Rewritten** — stripped to ~110 lines of structural checks + types |
| `src/pages/admin/PromptBundleEdit.tsx` | **Updated** — structural checks on load, AI analysis on button click |
| `src/components/admin/PipelineQualityCard.tsx` | **Rewritten** — shows structural issues + data flow + AI analysis |
| `src/test/pipelineQualityGate.test.ts` | **Rewritten** — 12 tests for structural checks + data flow |
| `supabase/config.toml` | Added `validate-pipeline` function config |

### What was removed
- ~900 lines of regex/keyword scoring (`HARD_FAIL_PATTERNS`, `REQUIRED_ROLES`, `score*` functions, `detectRedFlags`, `generateRepairActions`, auto-repair injections)
- `RepairAction` / `RepairActionType` types
- 5-category scoring rubric
- All false-positive-prone pattern matching
