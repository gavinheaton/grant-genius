

# Inline Pipeline Editor on Pipeline Tab

## Overview

Currently, when viewing a grant's Pipeline tab, the Super Admin sees the pipeline status and a "View & Edit Pipeline" button that navigates to a completely separate page (`/admin/prompt-bundles/:id`). This requires context switching and makes the workflow clunky.

The solution is to embed the pipeline editor directly below the "View & Edit Pipeline" button, so clicking it expands/collapses the editor inline rather than navigating away.

## Current Flow vs Proposed Flow

```text
CURRENT FLOW:
┌─────────────────────────────┐
│ Grant Edit > Pipeline Tab   │
│ ├── Pipeline Selector       │
│ ├── Status Badge            │
│ └── [View & Edit Pipeline]──┼──► Navigate to /admin/prompt-bundles/:id
└─────────────────────────────┘

PROPOSED FLOW:
┌─────────────────────────────┐
│ Grant Edit > Pipeline Tab   │
│ ├── Pipeline Selector       │
│ ├── Status Badge            │
│ └── [View & Edit Pipeline]  │
│       ↓ (toggles expand)    │
│     ┌───────────────────┐   │
│     │ Inline Editor     │   │
│     │ • System Prompt   │   │
│     │ • Steps Accordion │   │
│     │ • Add/Delete/Move │   │
│     └───────────────────┘   │
└─────────────────────────────┘
```

## Implementation Approach

### Option A: Extract Reusable Component (Recommended)

Create a new `InlinePipelineEditor` component that contains the core editing functionality currently in `PromptBundleEdit.tsx`, and use it in both places:

1. Embedded in the Pipeline tab (GrantEdit.tsx)
2. Standalone page (PromptBundleEdit.tsx) - keeps working as-is for direct access

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/admin/InlinePipelineEditor.tsx` | **Create** | New component containing the bundle editor (settings, system prompt, step accordion) |
| `src/pages/admin/GrantEdit.tsx` | **Modify** | Add toggle state, import and render InlinePipelineEditor when expanded |
| `src/pages/admin/PromptBundleEdit.tsx` | **Modify** | Refactor to use the shared InlinePipelineEditor component |

## Detailed Changes

### 1. Create `InlinePipelineEditor.tsx`

Extract the following from PromptBundleEdit.tsx into a reusable component:

- Bundle settings (name, description) - optional display
- System prompt editor
- Variable reference panel (collapsible)
- Steps accordion with:
  - Step reordering (up/down)
  - Step deletion
  - Step editing (PromptStepEditor)
  - Add step dialog

**Props interface:**
```typescript
interface InlinePipelineEditorProps {
  bundleId: string;
  showBundleSettings?: boolean;  // false when embedded, true on standalone page
  showBackButton?: boolean;      // false when embedded
}
```

### 2. Modify `GrantEdit.tsx` Pipeline Tab

- Add state: `const [pipelineExpanded, setPipelineExpanded] = useState(false)`
- Change "View & Edit Pipeline" button from navigation to toggle:

```typescript
<Button 
  variant="outline" 
  onClick={() => setPipelineExpanded(!pipelineExpanded)}
>
  {pipelineExpanded ? <ChevronUp /> : <ChevronDown />}
  {pipelineExpanded ? "Hide Pipeline Editor" : "View & Edit Pipeline"}
</Button>
```

- Conditionally render the inline editor below:

```typescript
{pipelineExpanded && promptBundleId && (
  <div className="mt-6">
    <InlinePipelineEditor 
      bundleId={promptBundleId}
      showBundleSettings={false}
      showBackButton={false}
    />
  </div>
)}
```

### 3. Keep Standalone Page Working

The `/admin/prompt-bundles/:id` page will still work for:
- Direct links from audit logs
- Accessing global bundles not attached to a grant
- Breadcrumb navigation from the bundles list

## UI Behavior

1. **Collapsed state** (default): Shows pipeline selector, status badge, and "View & Edit Pipeline" button
2. **Click button**: Expands inline editor with smooth transition
3. **Inline editor shows**:
   - System prompt (editable)
   - Variable reference (collapsible section)
   - Step accordion (full editing capabilities)
4. **Click button again**: Collapses the editor

## Benefits

- No page navigation required - stay in context
- Faster workflow for reviewing/editing pipeline
- Still accessible via standalone page if needed
- Quality badges visible inline while reviewing grant

## Technical Notes

- Use the existing `usePromptBundle` hook to fetch bundle data
- Reuse existing mutation hooks (`useUpdatePromptBundle`, `useUpdatePromptStep`, etc.)
- The `PromptStepEditor`, `AddStepDialog`, and `PromptQualityBadge` components remain unchanged
- Consider adding a loading skeleton during bundle fetch when expanding

