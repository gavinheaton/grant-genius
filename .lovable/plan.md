
# Move Project Name Field into Research Details Card

## Problem

The project name field in the header is too subtle and hidden. Users don't notice it's editable because it looks like a label rather than an input field.

## Solution

Move the project name from the header into the Research Details card as the **first form field**, making it a proper labeled input like the other fields.

## New UI Layout

```text
+----------------------------------------------------------+
|  Research Details                              [▼]       |
+----------------------------------------------------------+
|                                                           |
|  Project Name                                             |
|  [My Immunotherapy Research                          ]    |
|  Give your project a memorable name for tracking          |
|                                                           |
|  Public Article URL *                                     |
|  [https://doi.org/...                                ]    |
|                                                           |
|  100-Word Summary *                              45/100   |
|  [...                                                ]    |
|                                                           |
|  Technology Readiness Level    |    IP Status            |
|  [TRL 4                      ] |    [Patent pending    ] |
+----------------------------------------------------------+
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/workspace/ReportInputs.tsx` | Add project name as first form field, add `onProjectNameChange` prop |
| `src/pages/ApplicationWorkspace.tsx` | Remove project name from header, pass change handler to ReportInputs |

## Technical Details

### ReportInputs Changes

1. Add `onProjectNameChange` prop to handle edits
2. Add Project Name as the first field inside `CardContent`
3. Keep showing project name in collapsed summary (already working)

```tsx
interface ReportInputsProps {
  inputs: ApplicationInputs;
  onInputChange: (field: keyof ApplicationInputs, value: string) => void;
  disabled?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  projectName?: string;
  onProjectNameChange?: (value: string) => void;  // NEW
}

// In CardContent, as the FIRST field:
<div className="space-y-2">
  <Label htmlFor="projectName">Project Name</Label>
  <Input
    id="projectName"
    placeholder="e.g., My Research Project"
    value={projectName || ""}
    onChange={(e) => onProjectNameChange?.(e.target.value)}
    disabled={disabled}
  />
  <p className="text-xs text-muted-foreground">
    Give your project a memorable name for easier tracking
  </p>
</div>
```

### ApplicationWorkspace Changes

1. Remove the inline `Input` from the header
2. Restore the simpler header display (just grant name)
3. Pass `onProjectNameChange` prop to `ReportInputs`

```tsx
// Header simplified - just show grant name
<div>
  <h1 className="text-sm font-semibold">{application.grant_version.grant.name}</h1>
  {projectName && (
    <p className="text-xs text-muted-foreground">{projectName}</p>
  )}
</div>

// Pass handler to ReportInputs
<ReportInputs 
  inputs={inputs} 
  onInputChange={handleInputChange}
  disabled={isGenerating}
  isCollapsed={inputsCollapsed}
  onToggleCollapse={() => setInputsCollapsed(!inputsCollapsed)}
  projectName={projectName}
  onProjectNameChange={setProjectName}  // NEW
/>
```

## User Experience

1. User opens application workspace
2. Research Details card shows Project Name as the first field
3. User types a project name - it auto-saves like other fields
4. Header shows the project name as a subtitle (read-only display)
5. Collapsed summary continues to show the project name

## No Database Changes Required

Uses existing `title` column and existing save logic.
