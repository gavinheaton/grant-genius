

# Fix Export Prompt Bundle - Only Shows 1 Step

## Investigation Summary

After extensive analysis, I've identified the root cause and a potential issue:

### Root Cause: Redundant Column Selection in Query

In `src/hooks/usePromptBundles.ts` (line 121), the steps query uses:

```typescript
.select("*, is_heavy, max_expected_seconds, max_output_tokens, step_type, step_config_json")
```

This is problematic because:
1. `*` already includes all columns
2. Listing specific columns after `*` is redundant and can cause issues in some PostgREST versions
3. May lead to unexpected query behavior

### Additional Context

There are two bundles named "AEA Single Prompt":
- Older one (Feb 4): Has only 1 step
- Newer one (Feb 9): Has 7 steps

If you're seeing only 1 step, you may have been looking at the older bundle. However, the redundant select statement should still be fixed for reliability.

## Solution

### File: `src/hooks/usePromptBundles.ts`

Simplify the select statement to use only `*`:

```typescript
// Before (line 119-123)
const { data: steps, error: stepsError } = await supabase
  .from("prompt_bundle_steps")
  .select("*, is_heavy, max_expected_seconds, max_output_tokens, step_type, step_config_json")
  .eq("bundle_id", id)
  .order("step_number", { ascending: true });

// After
const { data: steps, error: stepsError } = await supabase
  .from("prompt_bundle_steps")
  .select("*")
  .eq("bundle_id", id)
  .order("step_number", { ascending: true });
```

### Additional Fix: Reset Export State on Dialog Close

To prevent stale data issues, clear the export bundle ID when the dialog closes:

In `src/pages/admin/PromptBundles.tsx`, update the dialog `onOpenChange`:

```typescript
// Before
<Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>

// After
<Dialog 
  open={exportDialogOpen} 
  onOpenChange={(open) => {
    setExportDialogOpen(open);
    if (!open) {
      setExportBundleId(null); // Clear on close
    }
  }}
>
```

## Technical Details

| File | Change |
|------|--------|
| `src/hooks/usePromptBundles.ts` | Simplify `.select()` to just `*` |
| `src/pages/admin/PromptBundles.tsx` | Reset `exportBundleId` when dialog closes |

## Impact

- Cleaner, more reliable Supabase query
- Prevents potential stale cache issues on export dialog
- No database changes required

