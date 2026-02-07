
# Pipeline QA: Variable Flow Consistency Validation

## Summary

Add a **Variable Flow Consistency Check** to the pipeline QA process that validates step-to-step data dependencies are correctly wired. This prevents runtime "stuck loops" caused by unresolved variables.

## The Problem

The current QA checks prompt **structure** (HARD RULES, OUTPUT SCHEMA, length, forbidden patterns) but does NOT validate **data flow between steps**:

1. Step 8 uses `{{project_title}}` but that variable isn't hydrated at runtime
2. Step 5 references `{{step4}}` but Step 4's output schema doesn't produce what Step 5 expects
3. Step 3 uses `{{requiredInputs}}` but doesn't know which specific fields are available

When a variable like `{{project_title}}` isn't substituted, the AI receives a literal prompt containing `{{project_title}}` and often outputs placeholder patterns like `[Specific Role - e.g., Postdoctoral Fellow]`, triggering the JSON Guard repair loop.

## Proposed Solution

Add a **Pipeline Data Flow Validator** that runs after prompt generation and before saving to the database. This validator will:

### 1. Build a Variable Availability Map

Track what variables are available at each step:

| Step | Available Variables |
|------|---------------------|
| 0 | `{{summary}}`, `{{publicArticleUrl}}`, `{{articleContent}}`, `{{trl}}`, `{{ipStatus}}`, `{{grantName}}`, `{{grantRubric}}`, `{{grantGuidelines}}`, `{{grantSummary}}`, `{{requiredInputs}}`, `{{sources}}`, `{{unknowns}}` |
| 1 | All of above + `{{step0}}` |
| 2 | All of above + `{{step1}}` |
| N | All of above + `{{step0}}` through `{{stepN-1}}` |

### 2. Extract Variables Used Per Step

Scan each `prompt_template` for `{{variableName}}` patterns and compare against the availability map.

### 3. Validate Output→Input Contract

For each step that references `{{stepN}}`:
- Parse Step N's OUTPUT SCHEMA to see what fields it produces
- Check if the referencing step's prompt makes reasonable use of that output

### 4. Flag Errors and Warnings

| Type | Example | Action |
|------|---------|--------|
| **Error** | Step 5 uses `{{step7}}` (forward reference) | Block publish |
| **Error** | Step 3 uses `{{project_title}}` (not in approved list or requiredInputs) | Block publish or auto-fix |
| **Warning** | Step 8 references `{{step2}}` but Step 2 output schema doesn't have the fields mentioned | Flag for admin review |

## Technical Implementation

### New Function: `validatePipelineDataFlow()`

```typescript
interface VariableFlowValidation {
  step_number: number;
  step_name: string;
  variables_used: string[];
  unresolved_variables: string[]; // Variables not available at this step
  forward_references: string[];   // {{stepN}} where N >= current step
  warnings: string[];             // Non-blocking issues
  errors: string[];               // Blocking issues
}

function validatePipelineDataFlow(
  steps: PipelineStep[],
  requiredInputsJson: object[]
): {
  valid: boolean;
  stepValidations: VariableFlowValidation[];
  summary: {
    total_errors: number;
    total_warnings: number;
    blocking_steps: number[];
  };
}
```

### Approved Base Variables (always available)

```typescript
const BASE_VARIABLES = [
  'summary', 'publicArticleUrl', 'articleContent', 'trl', 'ipStatus',
  'grantName', 'grantVersionLabel', 'grantGuidelines', 'grantRubric', 
  'grantRubricJson', 'grantSummary', 'requiredInputs', 'sources', 'unknowns'
];
```

### Dynamic Variables from Required Inputs

If `requiredInputs` contains `{ "key": "project_title", "label": "Project Title" }`, then `{{project_title}}` becomes valid.

### Integration Points

1. **In `process-grant-guidelines`** (after pipeline generation, before save):
   - Run `validatePipelineDataFlow()`
   - If blocking errors: attempt auto-fix or fail with detailed message
   - Log validation results

2. **In frontend quality check** (`usePromptQuality.ts`):
   - Enhanced `validateVariables()` to check against dynamic requiredInputs
   - Show unresolved variables in admin UI

3. **At publish time** (when Super Admin clicks Publish):
   - Re-run validation as a gate
   - Block publish if unresolved variables exist

## Auto-Fix Strategy

When an unresolved variable is detected:

1. **If it's a required input key**: Add to the interpolation map automatically
2. **If it's an unknown variable**: Replace with a comment instructing the AI to derive from `{{requiredInputs}}`:
   ```
   // Note: project_title should be extracted from {{requiredInputs}} if available
   ```
3. **If it's a forward reference**: Reorder steps or flag as blocking error

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-grant-guidelines/index.ts` | Add `validatePipelineDataFlow()` function; run after pipeline generation |
| `src/hooks/usePromptQuality.ts` | Extend `validateVariables()` to accept `requiredInputs` param and validate against dynamic list |
| `src/components/admin/PromptQualityBadge.tsx` | Display "Unresolved Variables" warning with list of problematic variables |

## Validation Output Example

```json
{
  "valid": false,
  "stepValidations": [
    {
      "step_number": 8,
      "step_name": "budget_logic_and_value_for_money",
      "variables_used": ["step7", "project_title", "executive_summary", "requiredInputs"],
      "unresolved_variables": ["project_title", "executive_summary"],
      "forward_references": [],
      "warnings": [],
      "errors": [
        "Variable {{project_title}} is not in approved list or requiredInputs keys",
        "Variable {{executive_summary}} is not in approved list or requiredInputs keys"
      ]
    }
  ],
  "summary": {
    "total_errors": 2,
    "total_warnings": 0,
    "blocking_steps": [8]
  }
}
```

## Admin UI Enhancement

In the Prompt Bundle editor, add a "Data Flow" validation panel:

- **Green checkmark**: All variables resolve correctly
- **Yellow warning**: Some variables may not resolve (admin decision)
- **Red error**: Blocking issues prevent execution

Each issue links to the specific step for quick editing.

## Testing Strategy

1. **Generate a pipeline for a grant with specific required inputs**
   - Verify that if a step uses `{{project_title}}` and `project_title` is in requiredInputs, it's marked valid
   - Verify that if `{{made_up_field}}` is used, it's flagged as error

2. **Test forward reference detection**
   - Add a step that references `{{step10}}` when only 8 steps exist
   - Verify it's flagged as error

3. **End-to-end report generation**
   - After validation passes, run a report and confirm no "unsubstituted variables" errors occur
