

# Send Model to Cloud Run Worker with Replit-Compatible Mapping

## Problem
The Replit worker receives `model_override` values from our database, but:
1. Some steps have `model_override = null` (no model specified)
2. The models stored in our DB (`google/gemini-3-flash-preview`, etc.) are Lovable AI model identifiers that Replit doesn't recognize
3. Replit only supports: `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-1.0-pro`

## Solution
Modify `worker-proxy` to:
1. Use the `model_override` value from the database (admin-configured in the UI)
2. Apply a fallback for steps with no override (using the existing UI default logic)
3. **Map Lovable AI model names to Replit-compatible equivalents**

## Model Mapping Strategy

| Lovable AI Model | Maps To (Replit) | Rationale |
|------------------|------------------|-----------|
| `google/gemini-3-pro-preview` | `gemini-1.5-pro` | Best quality → Pro |
| `google/gemini-2.5-pro` | `gemini-1.5-pro` | Pro → Pro |
| `google/gemini-3-flash-preview` | `gemini-2.0-flash` | Smart flash → Latest flash |
| `google/gemini-2.5-flash` | `gemini-2.0-flash` | Balanced → Latest flash |
| `google/gemini-2.5-flash-lite` | `gemini-1.5-flash` | Fast/cheap → Older flash |
| (unknown/null) | `gemini-2.0-flash` | Default fallback |

## Changes to Make

### File: `supabase/functions/worker-proxy/index.ts`

#### 1. Add Model Mapping Function (near top of file, after line ~35)

```typescript
// Map Lovable AI models to Replit-compatible Gemini models
function mapToReplitModel(lovableModel: string | null | undefined): string {
  if (!lovableModel) {
    return "gemini-2.0-flash"; // Default
  }
  
  // Direct mapping from Lovable AI identifiers to Replit-supported models
  const mapping: Record<string, string> = {
    // Pro tier → gemini-1.5-pro
    "google/gemini-3-pro-preview": "gemini-1.5-pro",
    "google/gemini-2.5-pro": "gemini-1.5-pro",
    // Flash tier → gemini-2.0-flash (latest)
    "google/gemini-3-flash-preview": "gemini-2.0-flash",
    "google/gemini-2.5-flash": "gemini-2.0-flash",
    // Lite/fast tier → gemini-1.5-flash (cheaper/faster)
    "google/gemini-2.5-flash-lite": "gemini-1.5-flash",
  };
  
  return mapping[lovableModel] || "gemini-2.0-flash";
}

// Get default Lovable model based on step number (from UI logic)
function getDefaultModelForStep(stepNumber: number): string {
  if (stepNumber <= 3) return "google/gemini-2.5-flash-lite";
  if (stepNumber <= 7) return "google/gemini-3-flash-preview";
  if (stepNumber === 11) return "google/gemini-3-pro-preview";
  return "google/gemini-2.5-flash-lite";
}
```

#### 2. Modify `handleGetRunContext()` (around line 236-254)

Before returning the response, add a `model` field to each step:

```typescript
// Compute effective model for each step (mapped to Replit-compatible names)
const stepsWithModel = bundle.steps?.map((step: any) => {
  const effectiveModel = step.model_override || getDefaultModelForStep(step.step_number);
  return {
    ...step,
    model: mapToReplitModel(effectiveModel), // Replit-compatible model name
  };
}) || [];

return jsonResponse({
  run: { ... },
  prompt_bundle: {
    id: bundle.id,
    system_prompt: bundle.system_prompt,
    steps: stepsWithModel,  // Now includes `model` field
  },
  grant_context: grantContext,
  existing_steps: steps || [],
});
```

#### 3. Modify `handleGetPromptBundle()` (around line 537-542)

Apply the same transformation:

```typescript
// Compute effective model for each step (mapped to Replit-compatible names)
const stepsWithModel = bundle.steps?.map((step: any) => {
  const effectiveModel = step.model_override || getDefaultModelForStep(step.step_number);
  return {
    ...step,
    model: mapToReplitModel(effectiveModel),
  };
}) || [];

return jsonResponse({
  id: bundle.id,
  name: bundle.name,
  system_prompt: bundle.system_prompt,
  steps: stepsWithModel,
});
```

## What the Worker Will Receive

### Before
```json
{
  "step_number": 3,
  "step_name": "market_segments",
  "model_override": null,  // Worker doesn't know what to use
  ...
}
```

### After
```json
{
  "step_number": 3,
  "step_name": "market_segments",
  "model_override": null,
  "model": "gemini-1.5-flash",  // Clear Replit-compatible model
  ...
}
```

## Flow Summary

```text
Admin sets model in UI (e.g., "Gemini 3 Flash Preview")
        ↓
Stored in DB as "google/gemini-3-flash-preview"
        ↓
worker-proxy reads model_override from DB
        ↓
If null → Apply getDefaultModelForStep() fallback
        ↓
Map to Replit model via mapToReplitModel()
        ↓
Send "gemini-2.0-flash" to Replit worker
```

## Benefits

1. **No hardcoding** - Uses the admin-configured `model_override` from the database
2. **Respects UI defaults** - Steps without override get the same default as shown in the UI
3. **Replit compatibility** - All models are translated to names Replit understands
4. **Centralized mapping** - Easy to update the mapping table if Replit adds new models

