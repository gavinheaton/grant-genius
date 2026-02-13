

## Fix: Pipeline Generator Variable References and QA Validator

### Problem 1: Step references broken after Firecrawl offset

When the pipeline generator creates steps, the AI designs them with `build_source_pack` as step 0. It generates prompts like:
- Step 1 references `{{step0}}` (expecting build_source_pack output)
- Step 5 references `{{step0}}`, `{{step1}}` etc.

But then the code **prepends 4 Firecrawl steps** (scrape_article, search_market_data, search_competitors, search_policy_funding) and shifts all AI step numbers by +4. The resulting bundle has:

| Step | Name | References in prompt |
|------|------|---------------------|
| 0 | scrape_article | (none) |
| 1-3 | search_* | (none) |
| 4 | build_source_pack | `{{step0}}` -- now points to scrape_article (raw markdown), not itself |
| 5 | market_basis_selection_and_scope | `{{step0}}` -- also wrong, gets raw scrape instead of source pack |

**The prompt templates are never updated to reflect the new numbering.** Step 5's `{{step0}}` should become `{{step4}}` after the offset.

### Problem 2: QA Validator flags base variables as issues

The `validate-pipeline` edge function's system prompt lists base variables (line 149):
> "Steps also use base variables like `{{summary}}`, `{{grantName}}`, `{{requiredInputs}}`..."

But this isn't strong enough -- the AI validator still flags `{{summary}}` and `{{grantGuidelines}}` in step 4 (build_source_pack) as "not produced by preceding steps." The validator needs an explicit list of base variables that are **always available** and should **never be flagged**.

### Fixes

#### Fix 1: Rewrite `{{stepN}}` references after Firecrawl offset (process-grant-guidelines)

In `supabase/functions/process-grant-guidelines/index.ts`, after shifting AI step numbers (around line 2760), add a post-processing pass that rewrites all `{{stepN}}` references inside `prompt_template` fields:

```
For each AI analysis step:
  Scan prompt_template for {{step0}}, {{step1}}, {{step2}} etc.
  Replace {{stepN}} with {{step(N + firecrawlOffset)}}
```

This ensures that when `build_source_pack` (now step 4) references `{{step0}}`, it gets rewritten to `{{step4}}` -- which is itself (not useful), so the prompt also needs updating. Actually, the correct fix is:

- The AI generates build_source_pack as step 0, referencing `{{summary}}` and `{{grantGuidelines}}` (base variables) -- no step references needed for step 0
- The AI generates subsequent steps referencing `{{step0}}` meaning build_source_pack
- After offset, `{{step0}}` must become `{{step(0 + offset)}}` = `{{step4}}`

Implementation: After line 2770 (where aiAnalysisSteps are created), iterate through each step's `prompt_template` and apply a regex replacement:

```typescript
// Rewrite {{stepN}} references to account for Firecrawl offset
for (const step of aiAnalysisSteps) {
  step.prompt_template = step.prompt_template.replace(
    /\{\{step(\d+)\}\}/g,
    (match, num) => `{{step${parseInt(num) + firecrawlOffset}}}`
  );
}
```

#### Fix 2: Explicit base variable whitelist in QA validator

In `supabase/functions/validate-pipeline/index.ts`, update the system prompt (around line 149) to include a clear, unambiguous list of base variables that are always available and must never be flagged:

```
BASE VARIABLES (always available, injected at runtime -- NEVER flag these as missing):
- User inputs: {{summary}}, {{publicArticleUrl}}, {{articleContent}}, {{trl}}, {{ipStatus}}
- Grant context: {{grantName}}, {{grantVersionLabel}}, {{grantGuidelines}}, {{grantRubric}}, {{grantSummary}}, {{requiredInputs}}
- Firecrawl outputs: {{sources}}, {{unknowns}}
- Any key from the applicant's inputs_json (e.g., {{project_description_summary}}, {{commercialisation_plan}}, {{innovation_novelty_pitch}}, {{trl_level}})

These are hydrated from the application context before execution. 
If a step references one of these, it is VALID regardless of step position.
Only flag {{stepN}} references where N >= the current step number (forward references).
```

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/process-grant-guidelines/index.ts` | Add `{{stepN}}` rewriting pass after Firecrawl offset shift |
| `supabase/functions/validate-pipeline/index.ts` | Add explicit base variable whitelist to system prompt so QA never flags them |

### Impact

- All newly generated pipelines will have correct step references after Firecrawl steps are prepended
- Existing pipelines (like 8375fc00) will need to be regenerated or manually fixed
- QA validator will stop producing false positives for standard base variables
