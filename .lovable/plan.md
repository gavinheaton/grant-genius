
# Plan: Add Step Management to Prompt Bundle Editor

## Problem Summary

Currently, the Prompt Bundle editor only allows editing existing steps. Admins cannot:
- Add new steps to a pipeline
- Delete steps from a pipeline  
- Reorder steps (change step numbers)

This limits flexibility when manually adjusting AI-generated pipelines or creating custom research workflows.

## Solution Overview

Enhance the `PromptBundleEdit.tsx` page to support:
1. **Add New Step** - Button to insert a new step with configurable position
2. **Delete Step** - Button per step to remove it (with confirmation)
3. **Reorder Steps** - Up/down arrows OR drag-and-drop to change step order

## Technical Approach

### Approach A: Button-Based Reordering (Simpler)
- Add up/down arrow buttons on each step row
- Clicking an arrow swaps `step_number` with adjacent step
- Simpler implementation, no new dependencies

### Approach B: Drag-and-Drop Reordering (More Polished)
- Install `@dnd-kit/core` and `@dnd-kit/sortable` packages
- Wrap step list in sortable context
- Drag handle on each step for intuitive reordering
- More polished UX but requires new dependency

**Recommendation**: Start with Approach A (button-based) for reliability, with option to upgrade to drag-and-drop later.

## Implementation Details

### 1. New Hooks in `usePromptBundles.ts`

**useCreatePromptStep**
```typescript
export function useCreatePromptStep() {
  return useMutation({
    mutationFn: async (data: {
      bundleId: string;
      step_number: number;
      step_name: string;
      step_description: string;
      prompt_template: string;
    }) => {
      const { error } = await supabase
        .from("prompt_bundle_steps")
        .insert({
          bundle_id: data.bundleId,
          step_number: data.step_number,
          step_name: data.step_name,
          step_description: data.step_description,
          prompt_template: data.prompt_template,
        });
      if (error) throw error;
    },
    // ... invalidation and toast
  });
}
```

**useDeletePromptStep**
```typescript
export function useDeletePromptStep() {
  return useMutation({
    mutationFn: async ({ stepId, bundleId }: { stepId: string; bundleId: string }) => {
      const { error } = await supabase
        .from("prompt_bundle_steps")
        .delete()
        .eq("id", stepId);
      if (error) throw error;
      return bundleId;
    },
    // ... invalidation and toast
  });
}
```

**useReorderPromptSteps**
```typescript
export function useReorderPromptSteps() {
  return useMutation({
    mutationFn: async ({ bundleId, steps }: { 
      bundleId: string; 
      steps: { id: string; step_number: number }[] 
    }) => {
      // Batch update all step numbers
      for (const step of steps) {
        const { error } = await supabase
          .from("prompt_bundle_steps")
          .update({ step_number: step.step_number })
          .eq("id", step.id);
        if (error) throw error;
      }
      return bundleId;
    },
    // ... invalidation and toast
  });
}
```

### 2. UI Changes in `PromptBundleEdit.tsx`

**Header Actions**
```text
Step Prompts                              [+ Add Step]
Configure the prompt for each research step.
```

**Step Row Layout**
```text
┌─────────────────────────────────────────────────────────────┐
│  [▲] [▼]  [0]  build_source_pack                      [🗑]  │
│           "Initial source gathering step"                   │
├─────────────────────────────────────────────────────────────┤
│  [▲] [▼]  [1]  research_context                       [🗑]  │
│           "Extract context from research article"           │
└─────────────────────────────────────────────────────────────┘
```

**Add Step Dialog**
- Modal with form fields:
  - Step Name (text, required)
  - Step Description (text, required)  
  - Insert Position (dropdown: "At beginning", "After step 0", "After step 1", ..., "At end")
  - Prompt Template (textarea, required, with placeholder text)

**Delete Confirmation**
- Alert dialog: "Are you sure you want to delete step [N]: [name]?"
- Warning about reordering subsequent steps

### 3. Step Number Recalculation

When adding or deleting steps, renumber all steps to maintain continuity:

```typescript
const renumberSteps = (steps: Step[], deletedIndex?: number, insertedIndex?: number) => {
  return steps
    .filter((_, i) => i !== deletedIndex)
    .map((step, i) => ({ ...step, step_number: i }));
};
```

### 4. Component Structure

```text
PromptBundleEdit.tsx
├── Bundle Settings Card (existing)
├── System Prompt Card (existing)
├── Available Variables Card (existing)
└── Step Prompts Card
    ├── Header with "Add Step" button
    ├── Step List
    │   └── For each step:
    │       ├── Reorder buttons (up/down arrows)
    │       ├── Step badge (number)
    │       ├── Step info (name, description)
    │       ├── Delete button (trash icon)
    │       └── Accordion content (existing PromptStepEditor)
    └── AddStepDialog (new component)
```

### 5. New Component: AddStepDialog

```typescript
interface AddStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSteps: PromptBundleStep[];
  onAdd: (data: NewStepData) => void;
}
```

Fields:
- step_name: Text input (e.g., "market_analysis")
- step_description: Text input (e.g., "Analyze target market segments")
- insert_after: Select dropdown (step numbers)
- prompt_template: Large textarea with default template

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/usePromptBundles.ts` | Add `useCreatePromptStep`, `useDeletePromptStep`, `useReorderPromptSteps` hooks |
| `src/pages/admin/PromptBundleEdit.tsx` | Add step management UI, reorder buttons, delete buttons, add dialog trigger |
| New: `src/components/admin/AddStepDialog.tsx` | Dialog component for adding new steps |

## Database Considerations

The `prompt_bundle_steps` table already supports:
- INSERT for adding steps (Super Admin only via RLS)
- UPDATE for changing step_number (Super Admin only via RLS)
- DELETE for removing steps (Super Admin only via RLS)

No schema changes required.

## Edge Cases

1. **Step 0 Protection**: Consider if `build_source_pack` (step 0) should be protected from deletion
2. **Renumbering**: When deleting step 3, steps 4+ become 3+
3. **Duplicate Names**: Allow but warn about duplicate step names
4. **Empty Bundle**: Handle case where all steps are deleted

## Validation

After implementation:
1. Add a new step to a pipeline and verify it appears with correct numbering
2. Delete a step and confirm subsequent steps are renumbered
3. Reorder steps using up/down arrows and verify the order persists
4. Run a report using the modified pipeline to ensure it executes correctly
