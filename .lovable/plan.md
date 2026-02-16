

## Add Save Feedback to Homepage Section Editor

### Problem
When clicking "Save Section" in the homepage editor, nothing visually indicates the save succeeded. The mutation completes silently.

### Changes

**File: `src/components/admin/homepage/SectionContentEditor.tsx`**

1. Import `toast` from `sonner` (the simpler toast system already used in the project)
2. Update the `save` function to show a success toast after calling `onUpdate`

**File: `src/hooks/useHomepageSections.ts`**

1. Add a success toast (`"Section updated"`) to the `useUpdateSection` mutation's `onSuccess` callback -- this is the cleanest place since all section updates flow through it

This is a one-line addition to the `onSuccess` handler in `useUpdateSection`, adding:
```
toast({ title: "Section saved" });
```

The hook already imports `useToast` and uses it for error handling, so the success toast follows the same pattern with zero new dependencies.

### Files Changed

| File | Change |
|---|---|
| `src/hooks/useHomepageSections.ts` | Add success toast to `useUpdateSection.onSuccess` |

