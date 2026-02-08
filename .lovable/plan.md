

# Add Max Output Tokens Configuration to Pipeline Steps

## Problem Analysis

The Competitor Research and TAM/SAM/SOM steps are experiencing quality issues due to **output truncation**. The current implementation in both `generate-report/index.ts` and `resume-report-run/index.ts` does not specify `max_tokens` in the AI API calls, causing the API to use default limits.

**Current AI Request (lines 921-927 in generate-report/index.ts):**
```typescript
body: JSON.stringify({
  model,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ],
  // max_tokens is NOT specified
}),
```

**Impact:**
- Default Gemini 2.0 Flash output limit: ~8,192 tokens (~6,000 words)
- Complex steps (Competitor Analysis, Market Sizing) often require 12,000-24,000 tokens
- Results in incomplete competitor lists, truncated JSON, and missing sections

## Solution Design

Add a new `max_output_tokens` column to `prompt_bundle_steps` with intelligent defaults based on step type, allowing admins to configure per-step output limits.

---

## Implementation Plan

### Phase 1: Database Migration

**Add new column to `prompt_bundle_steps` table:**

```sql
ALTER TABLE prompt_bundle_steps 
ADD COLUMN max_output_tokens integer DEFAULT NULL;

COMMENT ON COLUMN prompt_bundle_steps.max_output_tokens IS 
  'Maximum output tokens for AI response. NULL uses model default (~8K). Recommended: 20K for research, 24K for market sizing, 32K for assembly.';
```

### Phase 2: Update Edge Functions

#### File: `supabase/functions/generate-report/index.ts`

**Update StepConfig interface (around line 55-62):**
```typescript
interface StepConfig {
  step_number: number;
  step_name: string;
  prompt_template: string;
  model_override: string | null;
  timeout_seconds: number | null;
  is_heavy: boolean | null;
  max_output_tokens: number | null;  // ADD THIS
}
```

**Update fetchBundleForGrant to select max_output_tokens (around line 91-95):**
```typescript
const { data: steps, error: stepsError } = await supabase
  .from("prompt_bundle_steps")
  .select("step_number, step_name, prompt_template, model_override, timeout_seconds, is_heavy, max_output_tokens")
  .eq("bundle_id", bundle.id)
  .order("step_number", { ascending: true });
```

**Update AI API call (around line 921-927):**
```typescript
body: JSON.stringify({
  model,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ],
  ...(stepConfig?.max_output_tokens && { max_tokens: stepConfig.max_output_tokens }),
}),
```

**Add function to get default tokens based on step name:**
```typescript
function getDefaultMaxTokens(stepName: string, stepNumber: number, totalSteps: number): number | undefined {
  const lowerName = stepName.toLowerCase();
  
  // Research and competitor steps need more output
  if (lowerName.includes('competitor') || lowerName.includes('competitive')) return 20000;
  if (lowerName.includes('market') && lowerName.includes('siz')) return 24000;
  if (lowerName.includes('tam') || lowerName.includes('sam') || lowerName.includes('som')) return 24000;
  
  // Assembly/finalization steps need full context
  if (lowerName.includes('assemble') || lowerName.includes('finalize') || lowerName.includes('final')) return 32000;
  
  // Last few steps typically do assembly
  if (stepNumber >= totalSteps - 3) return 24000;
  
  // Default: let model decide (undefined means no limit specified)
  return undefined;
}
```

#### File: `supabase/functions/resume-report-run/index.ts`

Apply the same changes:
1. Update step config select query to include `max_output_tokens`
2. Add `max_tokens` to the API call body when configured
3. Add the default tokens function

### Phase 3: Update Admin UI

#### File: `src/hooks/usePromptBundles.ts`

**Update PromptBundleStep interface:**
```typescript
export interface PromptBundleStep {
  id: string;
  bundle_id: string;
  step_number: number;
  step_name: string;
  step_description: string;
  prompt_template: string;
  model_override: string | null;
  timeout_seconds: number | null;
  is_heavy: boolean;
  max_expected_seconds: number | null;
  max_output_tokens: number | null;  // ADD THIS
  step_type: StepType;
  step_config_json: Record<string, unknown> | null;
  is_assembly_step?: boolean;
  created_at: string;
  updated_at: string;
}
```

**Update PromptBundleStepUpdate type:**
```typescript
export type PromptBundleStepUpdate = {
  // ... existing fields ...
  max_output_tokens?: number | null;
};
```

**Update usePromptBundle query to select max_output_tokens:**
```typescript
const { data: steps, error: stepsError } = await supabase
  .from("prompt_bundle_steps")
  .select("*, is_heavy, max_expected_seconds, step_type, step_config_json, max_output_tokens")
  .eq("bundle_id", id)
  .order("step_number", { ascending: true });
```

#### File: `src/components/admin/PromptStepEditor.tsx`

**Add state for max output tokens:**
```typescript
const [maxOutputTokens, setMaxOutputTokens] = useState<string>(
  step.max_output_tokens ? String(step.max_output_tokens) : ""
);
```

**Add token limit options:**
```typescript
const OUTPUT_TOKEN_OPTIONS = [
  { value: "", label: "Default (8K)" },
  { value: "8192", label: "8K tokens" },
  { value: "16384", label: "16K tokens" },
  { value: "20000", label: "20K tokens (Competitor Research)" },
  { value: "24000", label: "24K tokens (Market Sizing)" },
  { value: "32000", label: "32K tokens (Assembly)" },
  { value: "65536", label: "64K tokens (Max)" },
];
```

**Add UI control (after Model selector, before Heavy Step toggle):**
```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <Label>Max Output Tokens</Label>
    <span className="text-xs text-muted-foreground">
      Prevents output truncation
    </span>
  </div>
  <Select
    value={maxOutputTokens}
    onValueChange={(value) => {
      setMaxOutputTokens(value);
      setHasChanges(true);
    }}
    disabled={!canEdit}
  >
    <SelectTrigger>
      <SelectValue placeholder="Default (8K)" />
    </SelectTrigger>
    <SelectContent>
      {OUTPUT_TOKEN_OPTIONS.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground">
    Higher limits prevent truncation but increase cost. Use 20-24K for research steps.
  </p>
</div>
```

**Update handleSave to include max_output_tokens:**
```typescript
await onSave(step.id, {
  prompt_template: promptTemplate,
  model_override: modelOverride || null,
  timeout_seconds: timeoutSeconds === "default" ? null : parseInt(timeoutSeconds, 10),
  is_heavy: isHeavy,
  max_expected_seconds: maxExpectedSeconds ? parseInt(maxExpectedSeconds, 10) : null,
  max_output_tokens: maxOutputTokens ? parseInt(maxOutputTokens, 10) : null,  // ADD
  step_type: stepType,
  step_config_json: stepConfig,
});
```

**Update onSave prop interface:**
```typescript
onSave: (
  stepId: string,
  data: { 
    prompt_template?: string; 
    model_override?: string | null; 
    timeout_seconds?: number | null;
    is_heavy?: boolean;
    max_expected_seconds?: number | null;
    max_output_tokens?: number | null;  // ADD
    step_type?: StepType;
    step_config_json?: Record<string, unknown>;
  }
) => Promise<void>;
```

### Phase 4: Update Worker Proxy (Optional)

If using Cloud Run workers, also update `worker-proxy/index.ts` to pass through `max_output_tokens` in the step configuration.

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| Database Migration | CREATE | Add `max_output_tokens` column to `prompt_bundle_steps` |
| `supabase/functions/generate-report/index.ts` | MODIFY | Add max_tokens to API calls |
| `supabase/functions/resume-report-run/index.ts` | MODIFY | Add max_tokens to API calls |
| `src/hooks/usePromptBundles.ts` | MODIFY | Add max_output_tokens to types and queries |
| `src/components/admin/PromptStepEditor.tsx` | MODIFY | Add UI control for configuring max tokens |

---

## Recommended Default Settings

Once implemented, configure these defaults for existing steps:

| Step Type | Recommended max_output_tokens |
|-----------|-------------------------------|
| Source Curation (Step 0) | 16,384 |
| Competitor Research | 20,000 |
| Market Sizing / TAM SAM SOM | 24,000 |
| Economic Impact | 20,000 |
| Assembly / Finalize | 32,000 |
| Simple extraction steps | Default (8,192) |

---

## Acceptance Criteria

1. New `max_output_tokens` column exists in `prompt_bundle_steps`
2. Admin UI shows a dropdown to configure max tokens per step
3. AI API calls include `max_tokens` when configured
4. Competitor Research and TAM SAM SOM steps no longer show truncated output
5. Existing pipelines continue to work with default behavior (no breaking changes)

