

# Fix: Set Active Bundle Error

## Problem Identified
The `useSetActiveBundle` function in `src/hooks/usePromptBundles.ts` has a bug on line 220. It attempts to update all rows by using `.neq("id", "placeholder")`, but `"placeholder"` is not a valid UUID, causing a database error.

The Postgres logs confirm this:
```
invalid input syntax for type uuid: "placeholder"
```

## Solution
Replace the workaround with a proper approach to update all bundles. There are two valid approaches:

**Option A (Recommended)**: Use `.neq("id", bundleId)` to deactivate all other bundles except the one being activated, then activate the target bundle. This is more efficient.

**Option B**: Use a raw RPC call or just update all bundles without a filter (Supabase allows updates without a WHERE clause when using `.update()` without `.eq()` or similar).

However, the cleanest approach is to simply not use a filter for the deactivation step, or use `.gte("created_at", "1970-01-01")` which always matches all rows.

## Implementation

### File: `src/hooks/usePromptBundles.ts`
**Lines 217-220**: Replace the faulty deactivation logic

```typescript
// BEFORE (broken):
const { error: deactivateError } = await supabase
  .from("prompt_bundles")
  .update({ is_active: false })
  .neq("id", "placeholder"); // Update all

// AFTER (fixed):
const { error: deactivateError } = await supabase
  .from("prompt_bundles")
  .update({ is_active: false })
  .neq("id", bundleId); // Deactivate all bundles except the one we're activating
```

This approach:
1. Uses a valid UUID (`bundleId`) in the filter
2. Is more efficient - skips the bundle we're about to activate anyway
3. Avoids the invalid UUID syntax error

## Testing
After the fix, setting a bundle as active should:
1. Deactivate all other bundles
2. Activate the selected bundle
3. Show success toast "Active bundle updated"

