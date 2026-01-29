

# Add Step 4.5: Market Sizing Source Pack

## Overview

You want to insert a new step between Step 4 (Find Competitors) and Step 5 (TAM Calculation) that curates validated market category definitions and sizes from external sources. This ensures Step 5 can calculate TAM using real data rather than hallucinating.

## Architecture Impact

Adding a "Step 4.5" requires renumbering since the database uses integer step numbers:

| Current Step | Current Name | New Step | New Name |
|--------------|--------------|----------|----------|
| 0 | Build Australia-first source pack | 0 | (unchanged) |
| 1 | Extract research context | 1 | (unchanged) |
| 2 | Competitor research | 2 | (unchanged) |
| 3 | Market segments | 3 | (unchanged) |
| 4 | Find competitors | 4 | (unchanged) |
| — | **(NEW)** | **5** | **Market Sizing Source Pack** |
| 5 | Calculate TAM | 6 | Calculate TAM |
| 6 | Calculate SAM | 7 | Calculate SAM |
| 7 | Calculate SOM | 8 | Calculate SOM |
| 8 | Economic impact | 9 | Economic impact |
| 9 | Competitor table | 10 | Competitor table |
| 10 | Partner businesses | 11 | Partner businesses |
| 11 | Assemble report | 12 | Assemble report |

**Total Steps: 12 → 13**

## Technical Changes Required

### 1. Database Migration

Renumber existing steps 5-11 → 6-12, then insert new Step 5:

```sql
-- Update step number constraint (0-12)
ALTER TABLE prompt_bundle_steps 
  DROP CONSTRAINT IF EXISTS prompt_bundle_steps_step_number_check;
ALTER TABLE prompt_bundle_steps 
  ADD CONSTRAINT prompt_bundle_steps_step_number_check 
  CHECK (step_number >= 0 AND step_number <= 12);

-- Renumber existing steps 11→12, 10→11, ..., 5→6 (descending to avoid conflicts)
UPDATE prompt_bundle_steps SET step_number = 12, 
  step_name = 'assemble_report', step_description = 'Assembling final grant report' 
  WHERE step_number = 11;
UPDATE prompt_bundle_steps SET step_number = 11 WHERE step_number = 10;
UPDATE prompt_bundle_steps SET step_number = 10 WHERE step_number = 9;
UPDATE prompt_bundle_steps SET step_number = 9 WHERE step_number = 8;
UPDATE prompt_bundle_steps SET step_number = 8 WHERE step_number = 7;
UPDATE prompt_bundle_steps SET step_number = 7 WHERE step_number = 6;
UPDATE prompt_bundle_steps SET step_number = 6 WHERE step_number = 5;

-- Insert new Step 5
INSERT INTO prompt_bundle_steps (bundle_id, step_number, step_name, step_description, 
  prompt_template, model_override)
SELECT id, 5, 'market_sizing_source_pack', 'Building market sizing source pack',
  '[YOUR FULL PROMPT]', 'google/gemini-3-flash-preview'
FROM prompt_bundles;
```

### 2. Edge Function: `generate-report/index.ts`

| Change | Details |
|--------|---------|
| Update `RESEARCH_STEPS` array | Insert new step at index 5, renumber rest |
| Update `getModelForStep()` | Step 5 uses "Pro/Smart" tier for web search |
| Update `total_steps` | From 12 to 13 |

```typescript
const RESEARCH_STEPS = [
  { name: "build_source_pack", description: "Building Australia-first source pack" },
  { name: "extract_context", description: "Extracting research context from article" },
  { name: "competitor_research", description: "Searching for competing research" },
  { name: "market_segments", description: "Identifying market segments" },
  { name: "find_competitors", description: "Finding existing competitors" },
  { name: "market_sizing_source_pack", description: "Building market sizing source pack" }, // NEW
  { name: "calculate_tam", description: "Calculating Total Addressable Market" },
  // ... shifted by 1
];
```

### 3. Edge Function: `resume-report-run/index.ts`

| Change | Details |
|--------|---------|
| Add case 5 in switch statement | Execute new Market Sizing Source Pack step |
| Renumber cases 5-11 → 6-12 | Shift all subsequent cases |
| Update `getBaseVariables()` | Add `{{marketSizingSourcePack}}` variable |
| Update step output mappings | `step5` → `step6`, etc. for assembly |

**New Step 5 Execution Logic:**

```typescript
case 5:
  // Step 5: Market Sizing Source Pack
  await executeStep(supabase, reportRunId, 5, async () => {
    const stepConfig = bundle?.steps.get(5);
    const interpolationVars = {
      ...getBaseVariables(),
      marketSegments: String(reportContent.marketSegments || ""),
    };
    
    const prompt = stepConfig?.prompt_template 
      ? interpolatePrompt(stepConfig.prompt_template, interpolationVars)
      : fallbackPrompt;
    
    const result = await callAIWithRetry(prompt, 5, systemPrompt, stepConfig?.model_override);
    reportContent.marketSizingSourcePack = result;
    return { marketSizingSourcePack: result };
  });
  break;
```

### 4. Frontend: `GenerationProgress.tsx`

Update step array to 13 steps:

```typescript
const RESEARCH_STEPS = [
  "Building Australia-first source pack",
  "Extracting research context from article",
  "Searching for competing research",
  "Identifying market segments",
  "Finding existing competitors",
  "Building market sizing source pack",  // NEW Step 5
  "Calculating Total Addressable Market", // Now Step 6
  "Calculating Serviceable Addressable Market",
  "Calculating Serviceable Obtainable Market",
  "Analyzing Australian economic impact",
  "Building competitor comparison",
  "Finding Australian partner businesses",
  "Assembling final report",             // Now Step 12
];
```

### 5. Frontend: `useReportGeneration.ts`

Update auto-resume checkpoint range:

```typescript
// Steps 0-11 are valid checkpoints (step 12 is final assembly)
if (activeRun.current_step >= 0 && activeRun.current_step <= 11) {
  resumeFromCheckpoint(activeRun.id);
}

// Step 12 recovery logic
if (run.current_step >= 12) {
  // Handle final assembly recovery
}
```

### 6. Admin UI: `PromptBundleEdit.tsx`

Add new variable category and update assembly variables:

```typescript
{
  name: "Market Sizing Source Pack (from Step 5)",
  variables: [
    { name: "{{marketSizingSourcePack}}", description: "JSON with by_segment market categories from Step 5" },
  ],
},
{
  name: "Assembly Variables (Step 12 only - JSON stringified)",
  variables: [
    // ... existing
    { name: "{{step5}}", description: "JSON from Step 5 (Market Sizing Source Pack)" },  // NEW
    { name: "{{step6}}", description: "JSON from Step 6 (TAM)" },  // Was step5
    // ... shifted
  ],
}
```

### 7. Variable Flow Update

```text
STEP 5 INPUT:
├── {{summary}}
├── {{marketSegments}}   // JSON from Step 3

STEP 5 OUTPUT (saved to checkpoint):
└── marketSizingSourcePack: {
      by_segment: [...],  // validated market categories per segment
    }

STEPS 6-11 INPUT (updated):
├── All original inputs
├── {{marketSizingSourcePack}} ← NEW from Step 5

STEP 12 (Assembly) INPUT:
├── {{step5}} ← Market Sizing Source Pack JSON
├── {{step6}} ← TAM JSON (was step5)
├── ... shifted by 1
```

## Files to Modify

| File | Changes |
|------|---------|
| Database Migration | Renumber steps, insert Step 5 |
| `supabase/functions/generate-report/index.ts` | Update RESEARCH_STEPS array, getModelForStep() |
| `supabase/functions/resume-report-run/index.ts` | Add case 5, renumber cases 6-12, update variables |
| `src/components/workspace/GenerationProgress.tsx` | Update RESEARCH_STEPS array (13 items) |
| `src/hooks/useReportGeneration.ts` | Update checkpoint range (0-11), final step (12) |
| `src/pages/admin/PromptBundleEdit.tsx` | Add Step 5 variables, update assembly mappings |

## Step 5 Prompt Storage

Your full prompt will be stored with:
- `step_number`: 5
- `step_name`: "market_sizing_source_pack"  
- `step_description`: "Building market sizing source pack"
- `prompt_template`: [Your full prompt from the request]
- `model_override`: `google/gemini-3-flash-preview` (Smart/Pro tier with web capability)

## Model Selection

The new Step 5 requires web-enabled/retrieval capability for market research lookups. Using `google/gemini-3-flash-preview` as specified in "Smart/Pro tier" models.

## Output Integration

The Step 5 output provides validated market categories that Step 6 (TAM) will reference:

```text
Step 6 TAM Prompt Variables:
├── {{marketSegments}}          // From Step 3
├── {{marketSizingSourcePack}}  // NEW: From Step 5 (validated categories + numbers)
└── {{sources}}                 // From Step 0
```

This ensures TAM calculations are grounded in externally-validated market definitions rather than AI-generated estimates.

## Considerations

- **Renumbering Impact**: All step references in existing prompts using `[S#]` notation remain unchanged (those refer to source IDs, not step numbers)
- **Rate Limiting**: Adding a step increases total AI calls from 12 to 13. The 3-second inter-step delay helps mitigate rate limits.
- **Fallback**: If Step 5 cannot find validated sources, it returns `unknowns[]` entries explaining what's missing, rather than fabricating data.

