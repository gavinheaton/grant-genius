

# Fix Pipeline Validation for 4-Step Assembly Architecture

## Summary

Update the pipeline validation logic in `process-grant-guidelines/index.ts` to correctly validate the new 4-step assembly pattern that includes the `clean_citations_apa` step. The current code has hardcoded references that assume a 3-step assembly.

## Root Cause

The recent addition of `clean_citations_apa` as the 3rd assembly step changed the assembly array from 3 steps to 4 steps:

| Old (3-step) | New (4-step) |
|--------------|--------------|
| `[0]` assemble_sections_html | `[0]` assemble_sections_html |
| `[1]` build_tables_sources_html | `[1]` build_tables_sources_html |
| `[2]` finalize_report_html | `[2]` clean_citations_apa |
|  | `[3]` finalize_report_html |

But the validation code at lines 2056-2088 still uses hardcoded values:
- Checks for `{{step${maxStepBeforeAssembly + 2}}}` (should be +3)
- Uses `createHtmlAssemblySteps(...)[2]` to get finalize step (should be [3])

## File to Change

`supabase/functions/process-grant-guidelines/index.ts`

## Changes Required

### 1. Update Validation Step References (Lines 2063-2073)

**Current Code:**
```typescript
const expectedHtmlStep = `{{step${maxStepBeforeAssembly + 1}}}`;
const expectedTablesStep = `{{step${maxStepBeforeAssembly + 2}}}`;
```

**Fixed Code:**
```typescript
const expectedHtmlStep = `{{step${maxStepBeforeAssembly + 1}}}`;
const expectedCleanedStep = `{{step${maxStepBeforeAssembly + 3}}}`; // clean_citations_apa output
```

And update the validation check:
```typescript
if (!prompt.includes(expectedCleanedStep)) {
  validationErrors.push(`Missing reference to ${expectedCleanedStep}`);
}
```

### 2. Fix Auto-Fix Index (Line 2080)

**Current Code:**
```typescript
const correctTemplate = createHtmlAssemblySteps(maxStepBeforeAssembly)[2];
```

**Fixed Code:**
```typescript
const correctTemplate = createHtmlAssemblySteps(maxStepBeforeAssembly)[3]; // finalize is now at index 3
```

### 3. Add Validation for clean_citations_apa Step

Add a check that the `clean_citations_apa` step exists and has the correct structure:

```typescript
const cleanCitationsStep = assemblySteps.find((s: any) => s.step_name === "clean_citations_apa");
if (!cleanCitationsStep) {
  validationErrors.push("Missing clean_citations_apa step");
}
```

## Technical Details

The full change updates lines ~2056-2090:

```typescript
// Validate finalize_report_html step
console.log("Step 5.5: Validating assembly step consistency...");

const finalizeStep = assemblySteps.find((s: any) => s.step_name === "finalize_report_html");
const cleanCitationsStep = assemblySteps.find((s: any) => s.step_name === "clean_citations_apa");

if (finalizeStep) {
  const prompt = finalizeStep.prompt_template;
  // Assembly steps: +1 = assemble_sections, +2 = build_tables, +3 = clean_citations, +4 = finalize
  // Finalize should reference +1 (for data_gaps) and +3 (for cleaned HTML)
  const expectedHtmlStep = `{{step${maxStepBeforeAssembly + 1}}}`;
  const expectedCleanedStep = `{{step${maxStepBeforeAssembly + 3}}}`;
  
  const validationErrors: string[] = [];
  
  if (!prompt.includes(expectedHtmlStep)) {
    validationErrors.push(`Missing reference to ${expectedHtmlStep}`);
  }
  if (!prompt.includes(expectedCleanedStep)) {
    validationErrors.push(`Missing reference to ${expectedCleanedStep}`);
  }
  if (!prompt.includes('"report_html"')) {
    validationErrors.push("Missing 'report_html' field in OUTPUT SCHEMA");
  }
  
  // Validate clean_citations_apa step exists
  if (!cleanCitationsStep) {
    validationErrors.push("Missing clean_citations_apa step");
  }
  
  if (validationErrors.length > 0) {
    console.error("Assembly validation failed:", validationErrors);
    // finalize_report_html is now at index 3 (4-step assembly)
    const correctTemplate = createHtmlAssemblySteps(maxStepBeforeAssembly)[3];
    const insertIdx = stepsToInsert.findIndex((s: any) => s.step_name === "finalize_report_html");
    if (insertIdx !== -1) {
      console.log("Auto-fixing finalize_report_html step...");
      stepsToInsert[insertIdx].prompt_template = correctTemplate.prompt_template;
    }
  } else {
    console.log("Assembly step validation passed ✓");
  }
}
```

## Testing

After deployment:
1. Re-upload a grant guidelines PDF or use "Retry Processing"
2. The pipeline should generate without validation errors
3. The `finalize_report_html` step should have `"report_html"` in its output schema
4. Publishing the pipeline should succeed

