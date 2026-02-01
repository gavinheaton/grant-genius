
# Plan: Show Pipeline Name and Add Pipeline Selector Dropdown

## Problem Summary

Currently in the Grant Edit page (Pipeline tab), admins can see:
- Pipeline status badge (draft/published/none)
- A button to view/edit the linked pipeline

But they CANNOT:
- See the **name** of the attached pipeline
- Select a **different pipeline** from a dropdown
- Easily switch to a new version of a pipeline

## Solution Overview

Enhance the Pipeline tab in `GrantEdit.tsx` to:
1. Display the attached pipeline's name prominently
2. Add a dropdown selector listing all available prompt bundles
3. Allow admins to change which pipeline is attached to the grant version

## Technical Changes

### File: `src/pages/admin/GrantEdit.tsx`

**Change 1: Import usePromptBundles hook**

Add import to fetch all available bundles:

```typescript
import { usePromptBundles } from "@/hooks/usePromptBundles";
```

**Change 2: Fetch prompt bundles in component**

Near the top of the component, add:

```typescript
const { data: allPromptBundles, isLoading: bundlesLoading } = usePromptBundles();
```

**Change 3: Add mutation to update pipeline attachment**

Create a mutation to update the `prompt_bundle_id` on the grant version:

```typescript
const updatePipelineMutation = useMutation({
  mutationFn: async (bundleId: string | null) => {
    if (!selectedVersionId) return;
    const { error } = await supabase
      .from("grant_versions")
      .update({ 
        prompt_bundle_id: bundleId,
        pipeline_generation_status: bundleId ? "draft" : "none"
      })
      .eq("id", selectedVersionId);
    if (error) throw error;
  },
  onSuccess: () => {
    toast({ title: "Pipeline updated" });
    queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
  },
  onError: () => {
    toast({ title: "Error updating pipeline", variant: "destructive" });
  },
});
```

**Change 4: Enhance Pipeline tab UI**

Update the Pipeline tab content (lines 582-657) to include:

1. **Header section** showing the attached pipeline name:
   - Query the bundle name from `allPromptBundles` using `promptBundleId`
   - Display prominently: "Attached Pipeline: [Bundle Name]"

2. **Pipeline selector dropdown**:
   - Select component listing all available bundles
   - Options: "None" + all bundles from `allPromptBundles`
   - Show bundle name and whether it's the global active bundle
   - On change, call `updatePipelineMutation`

3. **Info text** explaining:
   - If no pipeline is selected, the global default will be used
   - If a pipeline is selected but in draft, it needs to be published

## UI Design

```text
┌─────────────────────────────────────────────────────────────┐
│  Research Pipeline                                    v2    │
│  Custom research pipeline generated from grant guidelines  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Attached Pipeline                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ AEA_Ignite_2026_Evidence_Gathering_Pipeline    ▼    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Pipeline Status ─────────────────────────────────────┐ │
│  │                                                        │ │
│  │  Status: [draft]                                       │ │
│  │                                                        │ │
│  │  [View & Edit Pipeline]     [Publish Pipeline]         │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ⚠️ This pipeline is in draft status. Researchers will     │
│     use the global default pipeline until published.        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Dropdown Options Structure

The dropdown will show:

| Option | Display |
|--------|---------|
| None | "No pipeline (use global default)" |
| Bundle 1 | "AEA_Ignite_2026_Evidence_Gathering_Pipeline" |
| Bundle 2 | "Grant_Genius_15_Step_Pipeline (Global Default)" |
| Bundle 3 | "Custom_Bundle_v2" |

The global active bundle will be marked with a "(Global Default)" suffix.

## Technical Notes

1. **RLS Permissions**: The `grant_versions` table allows admins to update records
2. **Pipeline Status Reset**: When changing pipelines, reset status to "draft" so it requires re-publishing
3. **Step Count Display**: Optionally show the step count for each bundle in the dropdown

## Validation

After implementation:
1. Navigate to a grant's Pipeline tab
2. Verify the attached pipeline name is displayed
3. Open the dropdown and see all available bundles
4. Select a different bundle and verify it's saved
5. Confirm the pipeline status updates accordingly
