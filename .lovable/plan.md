

# Fix Firecrawl Step Validation - Allow Empty Prompt Template for Search Steps

## Problem

When creating a Firecrawl search step, you must:
1. Create the step as an AI step first
2. Change the step type to "Web Search"
3. Move the search query from the Prompt Template to the Search Query Template

When you clear the Prompt Template (since the query is now in Search Query Template), you get:
> "Prompt is too short (minimum 50 characters)"

This prevents saving the step because the Save button is disabled.

## Root Cause

The `validatePrompt` function in `PromptStepEditor.tsx` always validates the `promptTemplate` field, even for Firecrawl steps where the prompt template is not used - the search query is stored in `stepConfig.query_template` instead.

```typescript
// Line 113-125 - Always validates promptTemplate
const validatePrompt = (prompt: string) => {
  if (prompt.length < 50) {
    return { valid: false, warning: "Prompt is too short (minimum 50 characters)" };
  }
  // ...
};

// Line 127 - Applied unconditionally
const promptValidation = validatePrompt(promptTemplate);
```

## Solution

Make the validation step-type-aware:

1. **Skip prompt validation for Firecrawl steps** - They don't use the prompt template field
2. **Add validation for Firecrawl-specific fields** - Validate the search query template instead
3. **Update the Save button logic** - Use appropriate validation based on step type

## Technical Changes

### File: `src/components/admin/PromptStepEditor.tsx`

**Change 1**: Create a step-type-aware validation function

```typescript
const validateStep = (): { valid: boolean; warning: string | null } => {
  // For Firecrawl search steps, validate the query template instead
  if (stepType === "firecrawl_search") {
    const query = stepConfig.query_template as string || "";
    if (query.length < 10) {
      return { valid: false, warning: "Search query is too short (minimum 10 characters)" };
    }
    return { valid: true, warning: null };
  }
  
  // For Firecrawl scrape steps, validate URL variable is set
  if (stepType === "firecrawl_scrape") {
    const urlVar = stepConfig.url_variable as string;
    if (!urlVar) {
      return { valid: false, warning: "URL variable must be specified" };
    }
    return { valid: true, warning: null };
  }
  
  // For AI steps, use existing prompt validation
  if (promptTemplate.length < 50) {
    return { valid: false, warning: "Prompt is too short (minimum 50 characters)" };
  }
  
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(promptTemplate)) {
      return { valid: false, warning: "Prompt contains suspicious schema-like content" };
    }
  }
  
  return { valid: true, warning: null };
};
```

**Change 2**: Use the new validation function

```typescript
// Replace line 127
const stepValidation = validateStep();
```

**Change 3**: Update the warning display and Save button to use `stepValidation`

**Change 4**: Optionally hide the Prompt Template field entirely for Firecrawl steps (since it's not used)

## UX Improvement

For Firecrawl steps, the Prompt Template field could be hidden since it's not relevant. The step-specific configuration (query template, URL variable, etc.) is shown via the `StepTypeEditor` component.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/PromptStepEditor.tsx` | Add step-type-aware validation, optionally hide prompt template for Firecrawl steps |

## Impact

- No database changes required
- Firecrawl steps can be saved with empty prompt templates
- AI steps retain their current validation behavior
- Better UX by hiding irrelevant fields for Firecrawl steps

