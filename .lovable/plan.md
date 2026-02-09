
# Fix Prompt Pipeline Editor - Empty SelectItem Value Error

## Problem

The Prompt Pipeline editor crashes when editing a step with the error:
```
A <Select.Item /> must have a value prop that is not an empty string
```

## Root Cause

In `src/components/admin/PromptStepEditor.tsx`, the `OUTPUT_TOKEN_OPTIONS` array contains an empty string value for the default option:

```typescript
const OUTPUT_TOKEN_OPTIONS = [
  { value: "", label: "Default (8K)" },  // <-- Empty string causes crash
  { value: "8192", label: "8K tokens" },
  ...
];
```

Radix UI's `Select.Item` component requires all values to be non-empty strings. This restriction exists because an empty string is reserved for clearing the selection and showing the placeholder.

## Solution

Change the empty string to a semantic value like `"default"`, then handle this value appropriately when saving:

### File: `src/components/admin/PromptStepEditor.tsx`

**Change 1**: Update the `OUTPUT_TOKEN_OPTIONS` constant (line 33)
- Before: `{ value: "", label: "Default (8K)" }`
- After: `{ value: "default", label: "Default (8K)" }`

**Change 2**: Update the initial state (line 86-87)
- When `step.max_output_tokens` is null/undefined, use `"default"` instead of `""`

**Change 3**: Update the save handler (lines 147-164)
- When `maxOutputTokens === "default"`, save as `null` (not as `0` or any numeric value)

## Technical Details

| Location | Change |
|----------|--------|
| Line 33 | Change `value: ""` to `value: "default"` |
| Line 86-87 | Change `""` fallback to `"default"` |
| Line 156 | Check for `"default"` instead of falsy value |
| Line 194 | Same check in `handleApplyRegenerated` |

## Code Changes

```typescript
// Line 33: Fix the options array
const OUTPUT_TOKEN_OPTIONS = [
  { value: "default", label: "Default (8K)" },  // Changed from ""
  { value: "8192", label: "8K tokens" },
  // ... rest unchanged
];

// Line 86-87: Fix initial state
const [maxOutputTokens, setMaxOutputTokens] = useState<string>(
  step.max_output_tokens ? String(step.max_output_tokens) : "default"  // Changed from ""
);

// Line 135: Fix effect reset
setMaxOutputTokens(step.max_output_tokens ? String(step.max_output_tokens) : "default");

// Line 156: Fix save handler
max_output_tokens: maxOutputTokens !== "default" ? parseInt(maxOutputTokens, 10) : null,

// Line 194: Fix apply regenerated handler
max_output_tokens: maxOutputTokens !== "default" ? parseInt(maxOutputTokens, 10) : null,
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/PromptStepEditor.tsx` | Replace empty string values with "default" |

## Impact

- No database changes required
- No changes to other components
- The fix is isolated to the step editor component
