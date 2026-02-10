

## Replace Regex QA with AI-Powered Pipeline Validation

### Problem

The current QA system in `pipelineQualityGate.ts` is nearly 1000 lines of brittle regex and keyword matching. It:
- Produces false positives (e.g., flagging instructional use of "PROXY")
- Cannot understand whether step 5 actually produces the data that step 7 expects
- Cannot detect semantic redundancy or gaps between steps
- Cannot reason about whether the pipeline as a whole makes sense for a given grant

### Solution: Two-Tier Validation

Keep a thin layer of **instant local checks** (structural, milliseconds) and add an **AI-powered deep analysis** (semantic, a few seconds) triggered by the "Re-run QA" button.

**Tier 1 -- Local (instant, runs automatically)**
- Forward reference detection (`validatePostReorder`) -- does `{{step5}}` actually come before the step that uses it?
- Missing prompt templates (empty steps)
- Duplicate step names
- Sequential numbering gaps

These are deterministic, fast, and never produce false positives.

**Tier 2 -- AI Analysis (on-demand via "Re-run QA" button)**
A new backend function sends the full step sequence to Gemini and asks it to:
1. **Data flow audit**: For each step, does the prompt ask for data that a preceding step actually produces? Are there gaps where information is expected but never generated?
2. **Redundancy check**: Are any two steps doing substantially the same work?
3. **Sequencing logic**: Are steps in a sensible order? (e.g., market sizing before source gathering makes no sense)
4. **Completeness for grant type**: Given the step names and descriptions, is anything obviously missing for a research commercialisation pipeline?
5. **Output/input contract**: Does each step's expected output align with what downstream steps reference?

The AI returns structured results (pass/fail per category, list of issues with step numbers) which are displayed in the Quality Card.

### Changes

**1. New edge function: `supabase/functions/validate-pipeline/index.ts`**

- Accepts: array of steps (step_number, step_name, step_description, prompt_template)
- Sends to Gemini via Lovable AI gateway with a structured prompt asking for pipeline analysis
- Uses tool-calling to return structured output:

```text
{
  verdict: "pass" | "issues_found" | "fail",
  overall_notes: "summary",
  issues: [
    {
      step_number: 5,
      step_name: "calculate_tam_sam_som",
      category: "data_flow" | "redundancy" | "sequencing" | "completeness" | "contract_mismatch",
      severity: "error" | "warning" | "info",
      message: "This step references market basis data but no preceding step produces market basis analysis"
    }
  ],
  strengths: ["string array of what's good about the pipeline"]
}
```

- Protected: requires admin/super_admin role
- Uses `google/gemini-3-flash-preview` for speed

**2. Simplify `src/lib/pipelineQualityGate.ts`**

- Strip down to only the Tier 1 local checks:
  - `checkStructuralIssues()`: sequential numbering, empty prompts, duplicate names
  - Keep `validatePostReorder()` from `pipelineValidation.ts` (forward references)
- Remove: all role detection, keyword scoring, red flag regex, repair actions, the ~800 lines of pattern matching
- Remove: `HARD_FAIL_PATTERNS`, `REQUIRED_ROLES`, all `score*` functions, `detectRedFlags`, `generateRepairActions`, auto-repair injections

**3. Update `src/pages/admin/PromptBundleEdit.tsx`**

- On page load: run Tier 1 local checks instantly (structural issues)
- "Re-run QA" button: calls the new `validate-pipeline` edge function
- Display both local issues and AI analysis results in the Quality Card
- Show a loading state while the AI analysis runs (a few seconds)

**4. Refactor `src/components/admin/PipelineQualityCard.tsx`**

- Simplify the card to show:
  - **Structural checks** (instant, always shown): forward references, numbering gaps, empty prompts
  - **AI Analysis** (shown after re-run): verdict, categorised issues, strengths
- Remove: the 5-category scoring rubric (structural_completeness, traceability, etc.), repair actions section
- Add: a clear "AI-powered" label on the analysis section so admins know this is a semantic check

**5. Update types**

- Simplify `PipelineQualityResult` to match the new two-tier model
- Remove `RepairAction`, `RepairActionType`, category scores
- Add `AIAnalysisResult` type for the edge function response

**6. Clean up**

- Remove `src/hooks/usePromptQuality.ts` forbidden pattern scoring (or simplify to structural-only)
- Update `src/test/pipelineQualityGate.test.ts` to test only structural checks
- Remove the auto-repair injection functions (`injectComparablesRequirement`, `injectProxyProtocol`, etc.)

### What the Admin Sees

1. Opens a prompt bundle -- instantly sees any structural issues (forward references, empty steps)
2. Clicks "Re-run QA" -- button shows spinner for 2-3 seconds
3. Quality Card updates with AI analysis:
   - Verdict badge (Pass / Issues Found / Fail)
   - List of issues grouped by category, each with step number and clear explanation
   - List of strengths (what the pipeline does well)
4. No more false positives from regex matching

### Technical Summary

| File | Change |
|------|--------|
| `supabase/functions/validate-pipeline/index.ts` | New edge function -- sends steps to Gemini for semantic analysis |
| `src/lib/pipelineQualityGate.ts` | Strip to structural-only checks (~100 lines instead of ~1000) |
| `src/lib/pipelineValidation.ts` | Keep as-is (forward reference detection is valuable) |
| `src/pages/admin/PromptBundleEdit.tsx` | Wire up edge function call on "Re-run QA"; separate local vs AI results |
| `src/components/admin/PipelineQualityCard.tsx` | Simplify to structural + AI analysis display |
| `src/test/pipelineQualityGate.test.ts` | Simplify to test structural checks only |

