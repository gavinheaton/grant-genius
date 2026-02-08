

# Support Gemini 3 Pro Mapping for Cloud Run Worker

## Current State

The `worker-proxy` maps Lovable AI model identifiers to Replit-compatible Gemini models:

| Lovable AI Model | Current Mapping |
|------------------|-----------------|
| `google/gemini-3-pro-preview` | `gemini-1.5-pro` |
| `google/gemini-2.5-pro` | `gemini-1.5-pro` |
| `google/gemini-3-flash-preview` | `gemini-2.0-flash` |
| `google/gemini-2.5-flash` | `gemini-2.0-flash` |
| `google/gemini-2.5-flash-lite` | `gemini-1.5-flash` |
| Default (no model specified) | `gemini-2.0-flash` |

## Required Changes

Since the Cloud Run worker now defaults to **Gemini 3 Pro**, we need to:

1. **Update the model mapping** in `worker-proxy` to map `google/gemini-3-pro-preview` to the new `gemini-3-pro` identifier (or whatever the Replit worker now expects)
2. **Potentially add a dedicated "Worker Default" option** in the UI that explicitly tells the worker to use its default (Gemini 3 Pro)

---

## Implementation Plan

### Phase 1: Update Worker Proxy Model Mapping

**File: `supabase/functions/worker-proxy/index.ts`**

Update the `mapToReplitModel` function to correctly map to Gemini 3 Pro:

```typescript
function mapToReplitModel(lovableModel: string | null | undefined): string {
  if (!lovableModel) {
    return ""; // Empty = use worker default (now Gemini 3 Pro)
  }
  
  const mapping: Record<string, string> = {
    // Pro tier → gemini-3-pro (new default on worker)
    "google/gemini-3-pro-preview": "gemini-3-pro",
    "google/gemini-2.5-pro": "gemini-3-pro",
    // Flash tier → gemini-2.0-flash
    "google/gemini-3-flash-preview": "gemini-2.0-flash",
    "google/gemini-2.5-flash": "gemini-2.0-flash",
    // Lite/fast tier → gemini-1.5-flash (cheaper/faster)
    "google/gemini-2.5-flash-lite": "gemini-1.5-flash",
  };
  
  return mapping[lovableModel] || "";  // Empty = worker default
}
```

**Alternative approach**: If the worker expects an empty string or null to use its default, we can pass that through. Otherwise, we need to know the exact model identifier the Replit worker expects for Gemini 3 Pro.

### Phase 2: Update Default Model Logic

**File: `supabase/functions/worker-proxy/index.ts`**

Update `getDefaultModelForStep` to recommend Pro for complex steps:

```typescript
function getDefaultModelForStep(stepNumber: number): string {
  // Complex research steps benefit from Pro
  if (stepNumber <= 3) return "google/gemini-2.5-flash-lite";  // Fast for early steps
  if (stepNumber <= 7) return "google/gemini-3-flash-preview"; // Balanced for mid steps
  // Assembly and complex analysis → Pro
  if (stepNumber >= 8) return "google/gemini-3-pro-preview";   // Pro for assembly
  return "google/gemini-2.5-flash-lite";
}
```

### Phase 3: Update UI Labels (Optional)

**File: `src/components/admin/InlinePipelineEditor.tsx`**

Update model labels to indicate which ones map to the worker default:

```typescript
const AVAILABLE_MODELS = [
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (Fast)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Balanced)" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview (Smart)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Advanced)" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro Preview (Best - Worker Default)" },
];
```

---

## Clarification Needed

Before implementing, I need to confirm with you:

1. **What model identifier does the Replit worker expect for Gemini 3 Pro?**
   - Is it `gemini-3-pro`, `gemini-3.0-pro`, or something else?
   
2. **Should steps with no model override use the worker's default (Gemini 3 Pro)?**
   - Currently, the proxy passes a model to the worker even for default cases
   - We could change this to pass `null` or empty string to let the worker decide

3. **Which steps should default to Pro?**
   - Competitor Research (Step 2)?
   - TAM/SAM/SOM (Steps 6-8)?
   - Assembly/Finalization (Step 12)?

---

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/worker-proxy/index.ts` | Update model mapping and default logic |
| `src/components/admin/InlinePipelineEditor.tsx` | Update UI labels (optional) |

---

## Technical Notes

- The current default in `mapToReplitModel` is `gemini-2.0-flash`, but the worker now defaults to Gemini 3 Pro
- We can either:
  - **Option A**: Pass empty/null to let worker use its default
  - **Option B**: Explicitly map to the new model identifier
- Recommend **Option A** for flexibility - the worker controls its own default

