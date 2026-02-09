

## Fix: Allow Admins to Edit Prompt Bundles in the UI

The database RLS policies are already updated correctly. The problem is that two frontend files still gate editing actions behind `isSuperAdmin` instead of `isAdmin`.

### Changes Required

**1. `src/components/admin/InlinePipelineEditor.tsx`**
- Line 298: Change `const canEdit = isSuperAdmin;` to `const canEdit = isSuperAdmin || isAdmin;` (or simply use the `isAdmin` flag from `useAdminAuth`, which already includes super admins)

This single change unlocks: editing bundle settings, editing system prompt, editing step prompts, adding/deleting/reordering steps.

**2. `src/pages/admin/PromptBundles.tsx`**  
- Line 160: Change `{isSuperAdmin && (` to `{isAdmin && (` for the "New Bundle" button
- Line 200: Change `{isSuperAdmin && (` to `{isAdmin && (` for the "Clone" and "Delete" buttons

This also requires destructuring `isAdmin` from `useAdminAuth()` on line 58 (currently only destructures `isSuperAdmin`).

### Summary

| File | Line | Before | After |
|------|------|--------|-------|
| `InlinePipelineEditor.tsx` | 298 | `const canEdit = isSuperAdmin` | `const canEdit = isAdmin` |
| `PromptBundles.tsx` | 58 | `const { isSuperAdmin }` | `const { isSuperAdmin, isAdmin }` |
| `PromptBundles.tsx` | 160 | `{isSuperAdmin && (` | `{isAdmin && (` |
| `PromptBundles.tsx` | 200 | `{isSuperAdmin && (` | `{isAdmin && (` |

No database changes needed -- the RLS migration from the previous step already handles the backend correctly.

