

# Fix Duplicate Bundle Confusion - Add Step Count to Bundle List

## Problem

You have **two bundles** both named "AEA Single Prompt":

| Created | Bundle ID | Steps |
|---------|-----------|-------|
| Feb 9 (newer) | `16a9204a-...` | **8 steps** |
| Feb 4 (older) | `6abbcd3f-...` | **1 step** |

The bundle list currently shows only the name and "last updated" date, making it impossible to distinguish between them. You're likely clicking export on the older one.

## Solution

Add a **step count** to each bundle card so you can easily see which bundle has more steps. Optionally, also add the creation date for disambiguation.

## Technical Changes

### File: `src/pages/admin/PromptBundles.tsx`

**Change 1**: Update the bundles query to include step count

The current `usePromptBundles` hook only fetches bundle metadata. We need to either:
- A) Add a joined query to count steps (preferred)
- B) Fetch steps separately for display

**Change 2**: Display step count on each bundle card

```tsx
<CardContent>
  <div className="flex items-center gap-4 text-sm text-muted-foreground">
    <span>{stepCount} steps</span>
    <span>Created: {new Date(bundle.created_at).toLocaleDateString()}</span>
    <span>Updated: {new Date(bundle.updated_at).toLocaleDateString()}</span>
  </div>
</CardContent>
```

### File: `src/hooks/usePromptBundles.ts`

Update `usePromptBundles` to fetch step counts alongside bundles:

```typescript
// Option A: Use Postgres count aggregation via RPC or
// Option B: Fetch with joined count
const { data, error } = await supabase
  .from("prompt_bundles")
  .select("*, prompt_bundle_steps(count)")
  .order("created_at", { ascending: false });
```

This returns each bundle with a nested `prompt_bundle_steps` array containing `[{ count: N }]`.

## Immediate Workaround

Until this fix is implemented, you can identify the correct bundle by:
1. Looking at the **updated date** - the Feb 9 bundle will show a more recent date
2. Clicking **Edit** on each to see the step count in the editor
3. Or simply **delete the old 1-step bundle** if it's no longer needed

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/usePromptBundles.ts` | Add step count to bundle query |
| `src/pages/admin/PromptBundles.tsx` | Display step count on bundle cards |

## Impact

- Users can easily distinguish between bundles with the same name
- Shows creation date alongside update date for better context
- No database changes required

