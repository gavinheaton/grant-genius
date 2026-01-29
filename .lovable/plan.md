

# Export Bundle Feature for Prompt Bundles

## Overview

Add an "Export" button next to the Edit and Clone buttons on each bundle card that opens a dialog displaying the full bundle configuration in a readable, copyable format.

## Implementation Details

### 1. Export Button Placement

Add an Export button with a `FileDown` or `Download` icon between Edit and Clone:

```text
[Edit] [Export] [Clone] [Delete]
```

### 2. Export Dialog Design

When clicked, opens a dialog showing:

```text
+----------------------------------------------------------+
|  Export Bundle: "Australian Focus Bundle"                 |
+----------------------------------------------------------+
|                                                           |
|  BUNDLE NAME                                              |
|  Australian Focus Bundle                                  |
|                                                           |
|  SYSTEM PROMPT                                            |
|  +------------------------------------------------------+ |
|  | You are a research commercialization expert...       | |
|  +------------------------------------------------------+ |
|                                                           |
|  STEP PROMPTS (13)                                        |
|                                                           |
|  Step 0: build_source_pack                                |
|  Model: google/gemini-2.5-flash (or "Default")           |
|  +------------------------------------------------------+ |
|  | Your task is to curate a pack of validated...        | |
|  +------------------------------------------------------+ |
|                                                           |
|  Step 1: scrape_research_context                         |
|  Model: Default                                           |
|  +------------------------------------------------------+ |
|  | Extract the key research findings from...            | |
|  +------------------------------------------------------+ |
|  ...                                                      |
|                                                           |
|  [Copy to Clipboard]                      [Close]         |
+----------------------------------------------------------+
```

### 3. Data Fetching

Since the bundle list only contains basic info (no steps), clicking "Export" will need to fetch the full bundle with steps using the existing `usePromptBundle` hook pattern. However, to avoid a separate hook call for each potential export, we'll fetch on-demand when the dialog opens.

### 4. Copy to Clipboard

Format the bundle as structured text for easy copying:

```text
# Bundle: Australian Focus Bundle

## System Prompt
You are a research commercialization expert...

## Step 0: build_source_pack
Model: google/gemini-2.5-flash
---
Your task is to curate a pack of validated...

## Step 1: scrape_research_context
Model: Default
---
Extract the key research findings from...
```

## Technical Approach

### State Management

```typescript
// In PromptBundles.tsx
const [exportDialogOpen, setExportDialogOpen] = useState(false);
const [exportBundleId, setExportBundleId] = useState<string | null>(null);

// Fetch full bundle when export dialog opens
const { data: exportBundle, isLoading: exportLoading } = usePromptBundle(
  exportDialogOpen ? exportBundleId : undefined
);
```

### Export Handler

```typescript
const openExportDialog = (bundle: PromptBundle) => {
  setExportBundleId(bundle.id);
  setExportDialogOpen(true);
};
```

### Copy Function

```typescript
const formatBundleForExport = (bundle: PromptBundleWithSteps): string => {
  let output = `# Bundle: ${bundle.name}\n\n`;
  output += `## System Prompt\n${bundle.system_prompt}\n\n`;
  
  for (const step of bundle.steps) {
    output += `## Step ${step.step_number}: ${step.step_name}\n`;
    output += `Model: ${step.model_override || "Default"}\n`;
    output += `---\n${step.prompt_template}\n\n`;
  }
  
  return output;
};
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/PromptBundles.tsx` | Add Export button, export dialog with loading state, copy-to-clipboard functionality |
| `src/hooks/usePromptBundles.ts` | No changes needed - existing `usePromptBundle` hook fetches steps |

## UI Details

### Export Dialog

- **Header**: "Export Bundle: {name}"
- **Sections**:
  - Bundle Name (text)
  - System Prompt (scrollable code block)
  - Step Prompts (accordion or scrollable list, each with step number, name, model, and prompt)
- **Actions**:
  - "Copy to Clipboard" button - copies formatted markdown text
  - "Close" button
- **Loading State**: Show skeleton while fetching full bundle data

### Styling

- Use `ScrollArea` for the dialog content since bundles can be long
- Use `font-mono` for prompts
- Use subtle separators between steps
- Toast notification on successful copy

