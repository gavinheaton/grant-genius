

## Fix: Prompt Bundle Step Reordering

### Problem

There is a **unique constraint** on `(bundle_id, step_number)` in the `prompt_bundle_steps` table. When you try to move a step up or down, the code attempts to swap the two step numbers using sequential UPDATE statements. The first UPDATE tries to set step A to step B's number, but step B still has that number -- violating the unique constraint and failing silently.

### Solution

Create a database function that performs the swap **atomically** within a single transaction, using a temporary intermediate value to avoid the constraint violation.

### Changes

**1. Database migration -- create a `swap_step_numbers` function**

A new PostgreSQL function `swap_step_numbers(step_id_a UUID, step_id_b UUID)` that:
- Sets step A's number to `-1` (temporary value, avoids conflict)
- Sets step B's number to step A's original number
- Sets step A's number to step B's original number
- All within a single transaction

**2. Update `useReorderPromptSteps` in `src/hooks/usePromptBundles.ts`**

For the swap case (exactly 2 steps), call the new database function via `supabase.rpc('swap_step_numbers', ...)` instead of doing sequential updates.

For the bulk-reorder case (shifting multiple steps during add/delete), use a similar approach: a database function `reorder_step_numbers` that accepts an array of `(id, new_step_number)` pairs and applies them atomically using a two-pass strategy (first set all to negative offsets, then set to final values).

**3. Update `handleMoveStep` in `src/components/admin/InlinePipelineEditor.tsx`**

No changes needed here -- the component already calls `reorderSteps.mutateAsync` correctly. The fix is entirely in the hook and database layer.

### Technical Details

| Layer | Change |
|-------|--------|
| Database | New function `swap_step_numbers(step_id_a UUID, step_id_b UUID)` |
| Database | New function `reorder_step_numbers(step_updates JSONB)` for bulk reorder |
| `usePromptBundles.ts` | `useReorderPromptSteps` calls RPC functions instead of sequential updates |

