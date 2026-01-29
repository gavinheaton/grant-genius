
# Add Editable Project Name to Application Workspace

## Overview

Add a "Project Name" field to the Application Workspace that lets researchers give their applications meaningful names for easier tracking. This field will be prominently displayed in the header and editable inline.

## Current State

- The `applications` table already has a `title` column (nullable text)
- Currently auto-generated as "{Grant Name} Application" on creation
- Displayed in Dashboard cards but not editable
- Users with multiple applications for the same grant cannot easily distinguish them

## Solution

### 1. Add Editable Project Name in Application Header

Update the ApplicationWorkspace header to show an editable project name:

```text
+----------------------------------------------------------+
|  ← Back   [AEA Ignite]                        [Saving...] |
|           My Immunotherapy Research Project    [Draft]    |
|           ────────────────────────────────                |
|           Click to edit project name                      |
+----------------------------------------------------------+
```

The project name will be:
- Displayed prominently below the grant name
- Editable via inline input (click to edit)
- Auto-saved like other inputs

### 2. Update Dashboard to Show Project Name More Prominently

The Dashboard already shows the title - we'll ensure the new project names display well.

### 3. UI Design

**In ApplicationWorkspace Header:**
- Show project name as editable input below grant name
- Placeholder: "Click to add a project name..."
- Auto-saves on blur or after typing stops
- Show in collapsed summary when ReportInputs is collapsed

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ApplicationWorkspace.tsx` | Add project name state, inline editable input in header, save logic |
| `src/components/workspace/ReportInputs.tsx` | Show project name in collapsed summary |

## Technical Details

### ApplicationWorkspace Changes

```typescript
// Add state for project name
const [projectName, setProjectName] = useState<string>("");

// In fetch, populate from application.title
setProjectName(data.title || "");

// Save project name (debounced, same pattern as inputs)
const saveProjectName = useCallback(async () => {
  if (!id) return;
  await supabase
    .from("applications")
    .update({ title: projectName || null })
    .eq("id", id);
}, [id, projectName]);
```

### Header UI

```tsx
<div>
  <h1 className="text-sm font-semibold">{application.grant_version.grant.name}</h1>
  <Input
    value={projectName}
    onChange={(e) => setProjectName(e.target.value)}
    placeholder="Add a project name..."
    className="h-6 text-xs border-none bg-transparent focus:bg-muted px-1 -ml-1"
  />
</div>
```

## User Experience

1. **On first visit**: Project name shows placeholder "Add a project name..."
2. **User clicks**: Input becomes active
3. **User types**: "Immunotherapy Phase 2 Study"
4. **After 2s idle**: Auto-saves (same as other inputs)
5. **On Dashboard**: Card shows "Immunotherapy Phase 2 Study" under grant name
6. **Search**: Dashboard search already works on title field

## No Database Changes Required

The `title` column already exists in the `applications` table - we're just making it user-editable instead of auto-generated.
