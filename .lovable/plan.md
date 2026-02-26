

## Migrate from Gemini 3 Pro Preview to Gemini 3.1 Pro Preview

### Why
Google is discontinuing `gemini-3-pro-preview` on March 9, 2026. All references must be updated to `gemini-3.1-pro-preview` to avoid service disruption.

### Scope
A find-and-replace of the model identifier `google/gemini-3-pro-preview` to `google/gemini-3.1-pro-preview` across 6 files, plus updating display labels.

### Changes

| File | What changes |
|---|---|
| `src/lib/bundleGeneratorSpec.ts` | Update pro tier model identifier |
| `src/components/admin/PromptStepEditor.tsx` | Update default model references (3 occurrences) |
| `src/components/admin/InlinePipelineEditor.tsx` | Update model identifier and display label |
| `supabase/functions/worker-proxy/index.ts` | Update model mapping keys, defaults, and comments |
| `supabase/functions/process-grant-guidelines/index.ts` | Update pro tier model identifier |
| `docs/pipeline-generator-prompts.md` | Update documentation reference |

No database migration is needed -- existing `model_override` values stored in `prompt_bundle_steps` rows will still work because the worker-proxy mapping will route the old identifier to the new model. However, any newly generated pipelines will use the updated model name.

### Notes
- The worker-proxy mapping will be updated to map both `google/gemini-3.1-pro-preview` (new) and `google/gemini-2.5-pro` (fallback) to the correct external worker model name (`gemini-3.1-pro-preview`)
- Existing prompt bundles with `model_override = 'google/gemini-3-pro-preview'` will continue to work if we keep a legacy mapping entry, or admins can update them via the UI

