

# Plan: Fix Pipeline Generator to Use Approved Shortcodes

## Problem Summary

The `process-grant-guidelines` edge function instructs the AI to use **incorrect variable names** when generating pipeline prompts:

| Current (Wrong) | Correct | Description |
|-----------------|---------|-------------|
| `{{researchUrl}}` | `{{publicArticleUrl}}` | URL of the research article |
| `{{researchSummary}}` | `{{summary}}` | User's 100-word research summary |

This causes report generation to fail because the worker doesn't substitute these non-existent variables.

## Solution

Update line 302 in the pipeline generator to reference the **approved shortcode list** that matches what the worker actually substitutes.

## Approved Shortcodes Reference

Based on `VARIABLE_CATEGORIES` in `PromptBundleEdit.tsx`:

| Category | Variables |
|----------|-----------|
| **User Inputs** | `{{summary}}`, `{{publicArticleUrl}}`, `{{articleContent}}`, `{{trl}}`, `{{ipStatus}}` |
| **Grant Context** | `{{grantName}}`, `{{grantVersionLabel}}`, `{{grantGuidelines}}`, `{{grantRubric}}`, `{{grantSummary}}` |
| **Source Pack** | `{{sources}}`, `{{unknowns}}` |
| **Step Outputs** | `{{step0}}`, `{{step1}}`, `{{step2}}`, ... `{{stepN}}` |

## Technical Changes

### File: `supabase/functions/process-grant-guidelines/index.ts`

**Change 1: Update the variable documentation in the prompt (line 302)**

Before:
```
- prompt_template: Full prompt with {{variable}} placeholders. Use {{researchUrl}}, {{researchSummary}}, {{trl}}, {{ipStatus}}, {{step0}}, {{step1}}, etc.
```

After:
```
- prompt_template: Full prompt with {{variable}} placeholders.
  APPROVED VARIABLES (use ONLY these):
  - User Inputs: {{summary}}, {{publicArticleUrl}}, {{articleContent}}, {{trl}}, {{ipStatus}}
  - Grant Context: {{grantName}}, {{grantVersionLabel}}, {{grantGuidelines}}, {{grantRubric}}, {{grantSummary}}
  - Source Pack (from Step 0): {{sources}}, {{unknowns}}
  - Step Outputs: {{step0}}, {{step1}}, {{step2}}, etc. for referencing prior step JSON
```

This explicit list ensures the AI only uses variables that the worker can substitute.

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-grant-guidelines/index.ts` | Replace line 302 with explicit approved variable list |

## Validation

After implementation:
1. Upload guidelines for a new test grant
2. Verify the auto-generated pipeline uses only approved variables
3. Check that Step 0 uses `{{summary}}` and `{{publicArticleUrl}}` (not the old names)
4. Run a test report to confirm no "unsubstituted variable" errors

