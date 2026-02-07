

# Fix: Dynamic Input Hydration for All Future Pipelines

## Summary

The proposed fix will work for **all future pipelines** because it creates a universal contract:

1. **Pipeline Generation** → AI can only use variables from `BASE_VARIABLES` or `required_inputs_json` keys
2. **Validation** → Blocks any variable not in that approved list
3. **Runtime** → Automatically hydrates ALL keys from applicant's `inputs_json`

This means any grant-specific field (e.g., `project_budget`, `nrf_priority_area`, `commercialisation_strategy`) will work as long as it's defined in the grant's `required_inputs_json`.

## Current Gap

| Component | What It Does Now | What It Should Do |
|-----------|------------------|-------------------|
| Validation | Allows `{{project_budget}}` if in `required_inputs_json` | No change needed |
| Runtime (`buildVariables`) | Only hydrates 4 fields: `summary`, `publicArticleUrl`, `trl`, `ipStatus` | Hydrate ALL keys from `inputs` |

## Changes Required

### 1. Update `supabase/functions/resume-report-run/index.ts`

Modify `buildVariables()` to dynamically include all applicant input keys:

```typescript
const buildVariables = (): Record<string, string> => {
  const vars: Record<string, string> = {
    // Existing base variables...
    summary,
    publicArticleUrl,
    trl,
    ipStatus,
    grantName: grantContext.name,
    // ... rest of existing mappings ...
    ...stepVariables,
  };
  
  // NEW: Hydrate ALL applicant input keys dynamically
  for (const [key, value] of Object.entries(inputs)) {
    // Skip already-mapped canonical fields
    if (vars[key] !== undefined) continue;
    
    // Map value based on type
    if (value === null || value === undefined) {
      vars[key] = "";
    } else if (typeof value === "object") {
      vars[key] = JSON.stringify(value);
    } else {
      vars[key] = String(value);
    }
  }
  
  return vars;
};
```

### 2. Update `supabase/functions/generate-report/index.ts`

Apply the same pattern for Step 0 execution to ensure consistency from the first step.

### 3. Update `supabase/functions/worker-proxy/index.ts`

Add explicit `applicant_inputs` field in the context response so external workers can apply the same hydration logic.

## Why This Is Future-Proof

| Scenario | Validation | Runtime | Result |
|----------|------------|---------|--------|
| New grant with `{{project_title}}` in prompts | Passes if `project_title` in `required_inputs_json` | Hydrates from `inputs.project_title` | Works |
| New grant with `{{custom_xyz}}` in prompts | Passes if `custom_xyz` in `required_inputs_json` | Hydrates from `inputs.custom_xyz` | Works |
| Prompt uses `{{invalid_field}}` | Blocked at validation | N/A | Caught early |
| Applicant leaves required field empty | Passes validation | Hydrates as empty string | AI handles gracefully |

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/resume-report-run/index.ts` | Add dynamic input loop in `buildVariables()` |
| `supabase/functions/generate-report/index.ts` | Add dynamic input loop for Step 0 |
| `supabase/functions/worker-proxy/index.ts` | Add `applicant_inputs` to response context |

## Testing Checklist

1. Resume the failed report run to verify the fix works
2. Generate a new pipeline for a different grant to confirm universal compatibility
3. Run end-to-end report with all fields populated
4. Run end-to-end report with some optional fields empty to verify graceful handling

