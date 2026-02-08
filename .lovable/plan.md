
# Fix: Grant-Specific Dynamic Input Collection

## Problem Summary

The report generation is stuck in a loop because:

1. **Pipeline prompts use** `{{project_summary}}`, `{{nrf_priority_area}}` (defined in `required_inputs_json`)
2. **Validation passes** because these are theoretically valid variables
3. **At runtime**, the applicant's `inputs_json` only contains `summary`, `publicArticleUrl`, `trl`, `ipStatus`
4. **Variables stay unsubstituted** → AI receives literal `{{project_summary}}` → outputs `[PROJECT NAME]` placeholder → JSON Guard fails

The input form is hardcoded to 4 fields, but the pipeline generator uses all keys from `required_inputs_json`.

## Root Cause

| Component | What It Does | The Gap |
|-----------|--------------|---------|
| `ReportInputs.tsx` | Collects 4 hardcoded fields | Doesn't collect grant-specific inputs |
| `required_inputs_json` | Defines what SHOULD be collected | Contains keys like `project_summary`, `nrf_priority_area` |
| Pipeline Generator | Uses all `required_inputs_json` keys as variables | Assumes these will be available |
| Runtime Hydration | Iterates over `inputs_json` | Keys don't exist in applicant data |

## Solution Options

### Option A: Dynamic Input Form (Recommended)

Modify `ReportInputs.tsx` to dynamically generate form fields from the grant version's `required_inputs_json`.

**Pros:**
- Each grant gets its own tailored input form
- Pipeline can use any variable defined in `required_inputs_json`
- Future-proof for new grants

**Cons:**
- Larger frontend change
- Need to handle different input types (text, textarea, select, file)

### Option B: Constrain Pipeline Generator

Force the pipeline generator to only use the 4 canonical variables + derive other context from `{{summary}}` and `{{requiredInputs}}`.

**Pros:**
- Smaller change (backend only)
- Works with existing form

**Cons:**
- Limits flexibility for grant-specific pipelines
- AI must extract info from `{{requiredInputs}}` JSON blob

## Recommended Implementation: Option A (Dynamic Form)

### Phase 1: Dynamic Input Form

**File: `src/components/workspace/ReportInputs.tsx`**

1. Accept `requiredInputs` as a prop (from grant version)
2. Render base fields (summary, publicArticleUrl) plus dynamic fields from `requiredInputs`
3. Store all inputs in `inputs_json` with correct keys

```typescript
interface RequiredInput {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'file';
  required: boolean;
  help_text?: string;
  max_length?: number;
  options?: string[]; // For select type
}

interface ReportInputsProps {
  inputs: Record<string, any>; // Dynamic instead of hardcoded
  requiredInputs: RequiredInput[];
  onInputChange: (key: string, value: any) => void;
  // ...
}
```

### Phase 2: Workspace Integration

**File: `src/pages/ApplicationWorkspace.tsx`**

1. Fetch `required_inputs_json` from grant version
2. Pass to `ReportInputs` component
3. Ensure `inputs_json` is saved with all keys

### Phase 3: Validation Enhancement

**File: `supabase/functions/process-grant-guidelines/index.ts`**

Add a validation that warns if prompts use variables not in the canonical list OR not likely to be collected by the form:

```typescript
// Base form fields that are ALWAYS collected
const FORM_COLLECTABLE_FIELDS = ['summary', 'publicArticleUrl', 'trl', 'ipStatus'];

// For each variable used in prompts:
// 1. If it's a base variable (grantName, grantRubric, etc.) → OK
// 2. If it's a step reference (step0, step1) → OK
// 3. If it's in FORM_COLLECTABLE_FIELDS → OK
// 4. If it's in required_inputs_json → WARN: "Ensure form collects this"
// 5. Otherwise → ERROR: "Unknown variable"
```

### Phase 4: Immediate Hotfix (While Form is Being Built)

Update the runtime hydration to fall back to `summary` when `project_summary` is missing:

```typescript
// In resume-report-run/index.ts buildVariables()
// Add semantic equivalents mapping
const semanticEquivalents: Record<string, string> = {
  'project_summary': 'summary',
  'project_title': 'projectName', // if we start collecting this
  'research_summary': 'summary',
};

for (const [alias, canonical] of Object.entries(semanticEquivalents)) {
  if (vars[alias] === undefined && vars[canonical] !== undefined) {
    vars[alias] = vars[canonical];
  }
}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/workspace/ReportInputs.tsx` | Make form dynamic based on `requiredInputs` |
| `src/pages/ApplicationWorkspace.tsx` | Fetch and pass `required_inputs_json` |
| `supabase/functions/resume-report-run/index.ts` | Add semantic equivalents fallback |
| `supabase/functions/generate-report/index.ts` | Same fallback for Step 0 |
| `supabase/functions/process-grant-guidelines/index.ts` | Add form-collectability validation |

## Immediate Hotfix (Deploy First)

To unblock the current pipeline immediately, add a semantic fallback mapping in the runtime:

```typescript
// If prompt uses {{project_summary}} but only {{summary}} is available,
// map project_summary → summary
const semanticEquivalents: Record<string, string> = {
  'project_summary': 'summary',
  'research_summary': 'summary',
  'project_description': 'summary',
};

for (const [alias, canonical] of Object.entries(semanticEquivalents)) {
  if (vars[alias] === undefined && inputs[canonical]) {
    vars[alias] = String(inputs[canonical]);
  }
}
```

This allows the current pipeline to run while the dynamic form is implemented.

## Testing Checklist

1. Deploy semantic fallback hotfix
2. Resume the failed report run `e8ab9f92-08e1-416a-a8ae-5f1456490db9`
3. Verify step 8 (comparables_market_signals) completes without JSON Guard failures
4. Implement dynamic input form for future grants
5. Test new pipeline generation with dynamic form
