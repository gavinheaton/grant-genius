
# Regenerate Single Prompt Step Feature

## Understanding

After a prompt bundle is generated from grant guidelines, some individual step prompts may be low quality (short, lacking structure, missing validation rules). Currently, the only option is to **regenerate the entire pipeline** or **manually edit** each prompt.

This feature allows Super Admins to **regenerate a single step's prompt** using AI, keeping the step's purpose/description intact while improving the prompt quality - without affecting other steps.

## Current State

| Component | Current Behavior |
|-----------|-----------------|
| `PromptStepEditor.tsx` | Manual editing only - Save button, no AI regeneration |
| `process-grant-guidelines` | Has enhancement logic (lines 527-607) that improves low-quality prompts in bulk |
| Quality Badge | Shows score but no action to improve |

## Solution Overview

Add a "Regenerate with AI" button to the `PromptStepEditor` component that:
1. Calls a new edge function to regenerate just that step's prompt
2. Uses the same quality improvement logic from `process-grant-guidelines`
3. Shows a preview of the new prompt before applying
4. Preserves step metadata (step_name, step_description, model_override, etc.)

---

## Technical Implementation

### 1. New Edge Function: `regenerate-step-prompt`

Creates a new edge function that takes a step ID and regenerates its prompt using AI.

**File: `supabase/functions/regenerate-step-prompt/index.ts`**

```typescript
// Takes: step_id, optional additional_context
// Returns: regenerated_prompt

// Logic:
// 1. Fetch the step from prompt_bundle_steps
// 2. Fetch the bundle's system_prompt and grant context (if linked to grant_version)
// 3. Call AI with enhancement prompt (reuse logic from process-grant-guidelines lines 531-562)
// 4. Return the enhanced prompt for preview (don't auto-save)
```

Key prompt structure (reusing from process-grant-guidelines):
- Include QUALITY_TEMPLATE and REFERENCE_EXAMPLE constants
- Provide the current step's purpose and description
- Ask AI to enhance the prompt to meet quality standards
- Enforce 1,500+ character minimum

### 2. Update `PromptStepEditor.tsx`

Add a "Regenerate" button and preview workflow:

```typescript
interface PromptStepEditorProps {
  step: PromptBundleStep;
  models: { value: string; label: string }[];
  canEdit: boolean;
  onSave: (...) => Promise<void>;
  grantContext?: {  // Optional: passed when editing grant-linked bundle
    grantName?: string;
    grantSummary?: string;
    rubricSummary?: string;
  };
}
```

Add states:
- `isRegenerating: boolean` - Loading state during AI call
- `previewPrompt: string | null` - The AI-generated prompt to preview
- `showPreview: boolean` - Whether to show the preview dialog

Add UI:
- "Regenerate with AI" button (Sparkles icon) next to Save button
- Preview dialog showing old vs new prompt
- "Apply" and "Cancel" buttons in preview

### 3. Update `InlinePipelineEditor.tsx`

Pass grant context to PromptStepEditor when available:
- If the bundle is linked to a grant_version, fetch grant context
- Pass grantName, grantSummary, rubricSummary to each step editor

### 4. Add Hook: `useRegenerateStepPrompt`

New hook in `src/hooks/usePromptBundles.ts`:

```typescript
export function useRegenerateStepPrompt() {
  return useMutation({
    mutationFn: async (data: { 
      stepId: string; 
      additionalContext?: string;
    }) => {
      const response = await supabase.functions.invoke("regenerate-step-prompt", {
        body: data
      });
      if (response.error) throw response.error;
      return response.data.regenerated_prompt as string;
    }
  });
}
```

---

## User Experience Flow

1. Super Admin opens a prompt bundle step
2. Sees current prompt with quality badge (possibly showing "Warning" or "Poor")
3. Clicks "Regenerate with AI" button
4. Loading spinner shows while AI generates
5. Preview dialog appears showing:
   - Current prompt (collapsed/scrollable)
   - New regenerated prompt (full view)
   - Quality score comparison (e.g., "32 -> 78")
6. Super Admin can:
   - "Apply" - Replaces prompt and triggers save
   - "Cancel" - Closes dialog without changes
   - "Edit" - Apply to editor without saving (allows further tweaks)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/regenerate-step-prompt/index.ts` | Create | New edge function for AI prompt regeneration |
| `src/hooks/usePromptBundles.ts` | Modify | Add `useRegenerateStepPrompt` hook |
| `src/components/admin/PromptStepEditor.tsx` | Modify | Add regenerate button, preview dialog, apply workflow |
| `src/components/admin/InlinePipelineEditor.tsx` | Modify | Pass grant context to step editors |

---

## Edge Function Implementation Details

**`supabase/functions/regenerate-step-prompt/index.ts`**

```text
Request: POST { step_id: string, additional_context?: string }

Steps:
1. Verify user is Super Admin
2. Fetch step from prompt_bundle_steps with bundle info
3. Optionally fetch grant context if bundle is linked to a grant_version
4. Build enhancement prompt with:
   - QUALITY_TEMPLATE (from process-grant-guidelines)
   - REFERENCE_EXAMPLE (from process-grant-guidelines)
   - Current step purpose and description
   - Grant context (if available)
   - Additional context (if provided by admin)
5. Call Gemini 3 Flash to generate improved prompt
6. Return { regenerated_prompt, quality_score }
```

---

## UI Component Changes

**PromptStepEditor.tsx - New UI Elements**

```text
[Processing Window dropdown]
[Model dropdown]
[Heavy Step toggle]
[Max Expected Seconds input]

[Prompt Template textarea]

[Quality Badge] [Regenerate with AI button] [Save Step button]
                ^^^^^^^^^^^^^^^^^^^^^^^^
                NEW - Only shown for Super Admins
```

**Preview Dialog**

```text
+------------------------------------------------+
| Regenerated Prompt Preview                      |
+-------------------------------------------------+
| Quality Score: 32 -> 78 (Good)                  |
|                                                 |
| [Current Prompt - collapsed by default]         |
|                                                 |
| [New Prompt - full height, scrollable]          |
|   STEP 3 - Market Sizing                        |
|   INPUTS: {{summary}}, {{step0}}, {{step2}}     |
|   HARD RULES:                                   |
|   - Do NOT invent facts...                      |
|   ...                                           |
|                                                 |
| [Cancel]        [Edit First]        [Apply]     |
+-------------------------------------------------+
```

---

## Quality Validation

Reuse the quality scoring function from process-grant-guidelines (lines 497-514):

```typescript
function calculateQualityScore(prompt: string): { total: number; level: 'good' | 'warning' | 'poor' }
```

Display score comparison in preview to show improvement.

---

## Security Considerations

- Only Super Admins can regenerate prompts (existing RLS already enforces this for prompt_bundle_steps)
- Edge function validates role before processing
- No auto-save - Admin must explicitly apply the regenerated prompt

---

## Expected Behavior After Implementation

1. Super Admin opens step with poor quality prompt (score 25)
2. Clicks "Regenerate with AI"
3. After ~3-5 seconds, preview shows new prompt (score 82)
4. Admin reviews, clicks "Apply"
5. Prompt is saved, quality badge updates to "Good"
6. Step is ready for use in report generation
