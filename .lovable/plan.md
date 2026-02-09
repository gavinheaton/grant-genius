

# Add Step Name and Description Editing to Pipeline Editor

## Problem

The external Cloud Run worker requires a step named exactly `finalize_report_html` to correctly extract and save the final report. When you manually create a pipeline, you may have the step with the correct purpose but a different name - and currently there's no way to rename it in the UI.

## Solution

Add editable fields for `step_name` and `step_description` within the `PromptStepEditor` component, allowing Super Admins to rename steps directly.

## Technical Implementation

### File: `src/components/admin/PromptStepEditor.tsx`

**1. Add state for step name and description:**

```typescript
const [stepName, setStepName] = useState(step.step_name);
const [stepDescription, setStepDescription] = useState(step.step_description);
```

**2. Update the props interface to include step_name and step_description:**

```typescript
onSave: (
  stepId: string,
  data: { 
    step_name?: string;
    step_description?: string;
    prompt_template?: string; 
    model_override?: string | null; 
    // ... existing fields
  }
) => Promise<void>;
```

**3. Add input fields at the top of the editor:**

```tsx
{/* Step Identity - Name and Description */}
<div className="space-y-4 border-b pb-4 mb-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor={`step-name-${step.id}`}>Step Name</Label>
      <Input
        id={`step-name-${step.id}`}
        value={stepName}
        onChange={(e) => {
          setStepName(e.target.value);
          setHasChanges(true);
        }}
        disabled={!canEdit}
        placeholder="finalize_report_html"
        className="font-mono"
      />
      <p className="text-xs text-muted-foreground">
        Internal identifier. Must be unique. Final step must be named "finalize_report_html".
      </p>
    </div>
    <div className="space-y-2">
      <Label htmlFor={`step-desc-${step.id}`}>Step Description</Label>
      <Input
        id={`step-desc-${step.id}`}
        value={stepDescription}
        onChange={(e) => {
          setStepDescription(e.target.value);
          setHasChanges(true);
        }}
        disabled={!canEdit}
        placeholder="Assemble final report HTML"
      />
      <p className="text-xs text-muted-foreground">
        Human-readable description shown in the pipeline list.
      </p>
    </div>
  </div>
</div>
```

**4. Include fields in save handler:**

```typescript
const handleSave = async () => {
  setIsSaving(true);
  try {
    await onSave(step.id, {
      step_name: stepName,
      step_description: stepDescription,
      prompt_template: promptTemplate,
      // ... rest of fields
    });
    setHasChanges(false);
  } finally {
    setIsSaving(false);
  }
};
```

**5. Reset state when step changes:**

```typescript
useEffect(() => {
  setStepName(step.step_name);
  setStepDescription(step.step_description);
  // ... existing resets
}, [step]);
```

### File: `src/components/admin/InlinePipelineEditor.tsx`

Update the `handleStepUpdate` function to pass through `step_name` and `step_description`:

```typescript
const handleStepUpdate = async (
  stepId: string,
  data: { 
    step_name?: string;
    step_description?: string;
    prompt_template?: string; 
    model_override?: string | null;
    // ... existing fields
  }
) => {
  await updateStep.mutateAsync({
    id: stepId,
    bundleId,
    ...data,
    step_config_json: data.step_config_json as Json,
  });
};
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/PromptStepEditor.tsx` | Add step_name and step_description editable fields |
| `src/components/admin/InlinePipelineEditor.tsx` | Update handler type to include new fields |

## Validation Warning

A helpful validation warning will be added for the final step:

```tsx
{stepName !== 'finalize_report_html' && step.step_number === bundle.steps.length - 1 && (
  <Badge variant="warning">
    ⚠️ Final step should be named "finalize_report_html"
  </Badge>
)}
```

## Impact

- Super Admins can now rename steps directly in the editor
- Clear guidance about the required `finalize_report_html` naming
- No database changes required (the existing update mutation already supports these fields)

