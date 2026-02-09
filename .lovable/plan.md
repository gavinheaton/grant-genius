

## Remove "Active Bundle" Functionality from Prompt Bundles Page

Since pipelines are now linked to specific grant versions (rather than using a single globally "active" bundle), the Active Bundle concept is no longer needed.

### Changes

**1. `src/pages/admin/PromptBundles.tsx`**
- Remove the "Active Bundle" highlight card at the top of the page (lines 185-213)
- Remove the "Set Active" button from each bundle card (lines 236-245)
- Remove the "Activate Confirmation" dialog (lines 381-398)
- Remove the `activateDialogOpen` state and `openActivateDialog`/`handleSetActive` handlers
- Remove the `activeBundle` derived variable
- Remove the guard that prevents deleting an active bundle (`!bundle.is_active` check on delete button, line 270)
- Remove `useSetActiveBundle` from imports
- Remove `Circle` and `CheckCircle` icon imports (no longer used)
- Remove the "Active" badge on bundle cards (lines 231-233)

**2. `src/hooks/usePromptBundles.ts`**
- Remove the `useSetActiveBundle` hook entirely (lines 206-233)
- Keep the `is_active` field in the `PromptBundle` type since it still exists in the database -- we just stop surfacing it in the UI

No database changes needed. The `is_active` column can remain for backward compatibility with the worker-proxy fallback logic.
