

# Add Step 0: Build Source Pack

## Overview

You've provided a new foundational step that curates validated sources before the existing 10-step research pipeline. This "Step 0" approach ensures downstream steps can cite pre-validated, Australia-first sources rather than searching ad-hoc.

## Architecture Impact

Adding Step 0 requires changes across the entire pipeline:

| Component | Current State | New State |
|-----------|--------------|-----------|
| Total steps | 11 (1-10 research + 11 assembly) | 12 (0 source pack + 1-10 research + 11 assembly) |
| `generate-report` | Runs Step 1, checkpoints | Runs Step 0, checkpoints |
| `resume-report-run` | Handles Steps 2-11 | Handles Steps 1-11 |
| Database `prompt_bundle_steps` | Steps 1-11 | Steps 0-11 |
| Frontend progress | Shows 11 steps | Shows 12 steps |

## Key Design Decision: Step Numbering

Two options for numbering:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A) True Step 0 | `step_number = 0` | Clean semantic meaning | Requires shifting all existing step logic |
| B) Renumber to 1-12 | Old Step 1 → Step 2, etc. | Standard 1-based indexing | More migration work, existing prompts need re-mapping |

**Recommended: Option A (True Step 0)** - Minimal disruption to existing step numbers. Step 0 is explicitly a "pre-processing" phase.

## Technical Changes

### 1. Database Migration

Add Step 0 to the active prompt bundle:

```sql
-- Insert Step 0 for the active prompt bundle
INSERT INTO prompt_bundle_steps (
  bundle_id,
  step_number,
  step_name,
  step_description,
  prompt_template,
  model_override
)
SELECT 
  id,
  0,
  'build_source_pack',
  'Building Australia-first source pack',
  '[FULL PROMPT FROM USER]',
  'google/gemini-3-flash-preview'  -- Needs web search capability
FROM prompt_bundles 
WHERE is_active = true;
```

### 2. Edge Function: `generate-report/index.ts`

| Change | Details |
|--------|---------|
| Update `RESEARCH_STEPS` array | Add Step 0 "Building source pack" at index 0 |
| Modify `processStep1Only` → `processStep0Only` | Execute Step 0 first, checkpoint at step 0 |
| Update total_steps | From 11 to 12 |
| Add Step 0 execution logic | Call Firecrawl search, then AI for source curation |

Step 0 should:
1. Scrape the article (existing Step 1 logic)
2. Use Firecrawl search to find Australian authoritative sources
3. Pass inputs + search results to AI with your Step 0 prompt
4. Return structured JSON with `sources[]` and `unknowns[]`
5. Checkpoint and exit

### 3. Edge Function: `resume-report-run/index.ts`

| Change | Details |
|--------|---------|
| Add Step 1 to switch statement | Move old Step 1 logic here (was in generate-report) |
| Update checkpoint validation | Accept step 0 as valid checkpoint |
| Update `getBaseVariables` | Add `{{sources}}` and `{{unknowns}}` variables from Step 0 output |
| Update all step prompts | Inject source pack for downstream citation |

### 4. Frontend: `GenerationProgress.tsx`

```typescript
const RESEARCH_STEPS = [
  "Building Australia-first source pack",  // NEW: Step 0
  "Extracting research context from article",
  "Searching for competing research",
  // ... rest of steps
  "Assembling final report",  // Step 11
];
```

### 5. Frontend: `useReportGeneration.ts`

| Change | Details |
|--------|---------|
| Update auto-resume range | From `1-11` to `0-11` |
| Update total_steps check | Expect 12 steps |

### 6. Admin UI: `PromptBundleEdit.tsx`

Add new variable category for Step 0 output:

```typescript
{
  name: "Source Pack (from Step 0)",
  variables: [
    { name: "{{sources}}", description: "JSON array of curated sources from Step 0" },
    { name: "{{unknowns}}", description: "JSON array of missing source categories" },
  ],
}
```

### 7. Prompt Template Integration

Update all downstream step prompts to reference the source pack:

```text
## AVAILABLE SOURCES (from Step 0)
{{sources}}

## MISSING DATA CATEGORIES
{{unknowns}}

INSTRUCTIONS: When citing data, reference sources by source_id (e.g., [S0-1]).
If needed data is in unknowns, explicitly state "Data not available".
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-report/index.ts` | Add Step 0 execution, update step array |
| `supabase/functions/resume-report-run/index.ts` | Move Step 1 here, add source pack variables |
| `src/components/workspace/GenerationProgress.tsx` | Add Step 0 name to array |
| `src/hooks/useReportGeneration.ts` | Update auto-resume range |
| `src/pages/admin/PromptBundleEdit.tsx` | Add source pack variables |
| Database migration | Insert Step 0 prompt template |

## Step 0 Prompt Storage

Your full prompt will be stored in `prompt_bundle_steps` with:
- `step_number`: 0
- `step_name`: "build_source_pack"
- `step_description`: "Building Australia-first source pack"
- `prompt_template`: [Your full prompt from the message]
- `model_override`: `google/gemini-3-flash-preview`

## Variable Flow

```text
STEP 0 INPUT:
├── {{summary}}
├── {{publicArticleUrl}}
├── {{articleContent}} (from Firecrawl scrape)
├── {{trl}}
└── {{ipStatus}}

STEP 0 OUTPUT (saved to checkpoint):
├── sources[] (12-25 validated sources)
└── unknowns[] (missing categories)

STEPS 1-10 INPUT:
├── All original inputs
├── {{sources}} ← From Step 0
└── {{unknowns}} ← From Step 0

STEP 11 INPUT:
├── {{step0}} ← JSON from Step 0
├── {{step1}} through {{step10}}
└── All sources aggregated
```

## Expected Outcome

After implementation:
1. Step 0 runs first, building a curated source pack
2. Steps 1-10 can reference `{{sources}}` for validated citations
3. Step 11 includes all Step 0 sources in final references
4. Frontend shows 12-step progress (0-11)
5. Admin can edit Step 0 prompt via Prompt Bundles UI

## Considerations

- **Model Choice**: Step 0 needs web search capability. Gemini 3 Flash Preview is recommended.
- **Firecrawl Integration**: May need to add Firecrawl search calls (not just scrape) for source discovery.
- **Rate Limits**: Adding a step increases total AI calls. Inter-step delay helps.
- **Fallback**: If Step 0 fails to find sources, continue with empty sources array + unknowns populated.

