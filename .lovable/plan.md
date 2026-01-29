
# Plan: Add Configurable Processing Window per Step

## Overview

This feature will allow admins to set a custom **processing window (timeout)** for each of the 13 pipeline steps directly from the Prompt Bundle editor. Currently, timeouts are hardcoded in the edge functions (45s default, 90s for Step 0, 120s for Step 12). Making these configurable will help manage timeout issues by allowing admins to tune processing time based on observed step complexity.

---

## Current State

| Component | Current Behavior |
|-----------|------------------|
| Database | `prompt_bundle_steps` has no timeout column |
| Edge Functions | `getTimeoutForStep()` returns hardcoded values (45s/90s/120s) |
| Admin UI | `PromptStepEditor.tsx` only allows model and prompt editing |

---

## Changes Required

### 1. Database Migration

Add a `timeout_seconds` column to the `prompt_bundle_steps` table:

```sql
ALTER TABLE prompt_bundle_steps 
ADD COLUMN timeout_seconds integer DEFAULT NULL;
```

- `NULL` means "use default" (the current hardcoded logic)
- A numeric value (e.g., 60) overrides the default

---

### 2. Update TypeScript Types

Modify `src/hooks/usePromptBundles.ts`:

```typescript
export interface PromptBundleStep {
  // ... existing fields
  timeout_seconds: number | null;  // NEW
}
```

---

### 3. Update Admin UI - PromptStepEditor

Add a dropdown for "Processing Window" with options:

| Option | Value |
|--------|-------|
| Default (varies by step) | `null` |
| 30 seconds | 30 |
| 45 seconds | 45 |
| 60 seconds | 60 |
| 90 seconds | 90 |
| 120 seconds | 120 |
| 150 seconds | 150 |
| 180 seconds | 180 |

The UI will show the current default for the step (e.g., "Default: 45s" for most steps, "Default: 90s" for Step 0).

```text
+------------------------------------------+
| Processing Window                         |
| [Dropdown: Default (45s) / 60s / 90s...] |
|                                          |
| Model                                    |
| [Dropdown: Gemini 2.5 Flash Lite...]     |
|                                          |
| Prompt Template                          |
| [Textarea]                               |
+------------------------------------------+
```

---

### 4. Update Edge Functions

Modify both `generate-report/index.ts` and `resume-report-run/index.ts` to:

1. Include `timeout_seconds` when fetching the active bundle's steps
2. Use the configured timeout if set, otherwise fall back to the default

```typescript
// Updated fetchActiveBundle
const stepsMap = new Map<number, { 
  prompt_template: string; 
  model_override: string | null;
  timeout_seconds: number | null;  // NEW
}>();

// Updated getTimeoutForStep with override
function getTimeoutForStep(stepNumber: number, overrideSeconds: number | null): number {
  if (overrideSeconds !== null) {
    return overrideSeconds * 1000; // Convert to ms
  }
  // Fallback to defaults
  if (stepNumber === 0) return 90000;
  if (stepNumber === 12) return 120000;
  return 45000;
}
```

---

### 5. Update useUpdatePromptStep Hook

Update the mutation to accept `timeout_seconds`:

```typescript
mutationFn: async ({
  id,
  bundleId,
  prompt_template,
  model_override,
  timeout_seconds,  // NEW
}) => { ... }
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `prompt_bundle_steps` table | Add `timeout_seconds` column (migration) |
| `src/hooks/usePromptBundles.ts` | Add `timeout_seconds` to types and mutation |
| `src/components/admin/PromptStepEditor.tsx` | Add timeout dropdown selector |
| `supabase/functions/generate-report/index.ts` | Fetch and use `timeout_seconds` |
| `supabase/functions/resume-report-run/index.ts` | Fetch and use `timeout_seconds` |

---

## Technical Notes

- **Supabase Edge Function Limit**: The wall-clock limit is 60 seconds. Setting timeouts above 60s won't prevent platform termination, but it does control the AI request timeout. Steps that need >60s should use the checkpoint/resume architecture (which we already have).
- **Validation**: The dropdown limits options to reasonable values (30-180s) to prevent misuse.
- **Backward Compatibility**: `NULL` preserves current behavior, so existing bundles work unchanged.

---

## Expected Outcome

After implementation:
- Admins can tune step timeouts from the Prompt Bundles editor
- Steps that frequently timeout can be given more headroom
- Simple steps can be configured with shorter timeouts to fail faster
- Better visibility into timeout configuration alongside model selection
