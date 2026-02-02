
# Quality Check Gap in Pipeline Generator

## Root Cause Analysis

### What Failed
The report generation failed at **Step 9 (finalize_report_html)** with the error:
```
Finalize FAILED: No step output found with 'report_html' field. Available: step0, step1, step2, step3, step4, step5, step6, step7, step8
```

### Where the Error Originates
The error message comes from the **external Cloud Run worker** (not in the Lovable codebase). The worker validates that the final assembly step produces a `report_html` field before saving the report.

### What Actually Happened
Looking at the database records:
- **Steps 0-6**: AI-generated research steps (completed successfully)
- **Step 7 (assemble_sections_html)**: Produced correct `sections_html` output
- **Step 8 (build_tables_sources_html)**: Produced correct `tables` and `all_sources` output
- **Step 9 (finalize_report_html)**: **Failed** - outputs_json is empty `{}`

The AI in Step 9 was supposed to parse the JSON from steps 7 and 8, merge the HTML, and output `report_html`, but it returned empty JSON.

### Why the Quality Check Didn't Catch This

The current quality check in `process-grant-guidelines/index.ts` (lines 497-514) and `usePromptQuality.ts` validates:
- Context header presence
- Hard rules section
- Output JSON schema definition
- URL validation mentions
- Unknown handling protocol
- Placeholder prohibition
- Adequate length (1000+ chars)
- Valid variable usage

**What it does NOT validate:**
1. **Inter-step variable consistency** - Whether Step 9's prompt references `{{step7}}` and `{{step8}}` correctly
2. **Assembly step input requirements** - Whether the steps referenced actually produce the fields the assembly step expects
3. **Critical output field requirements** - Whether the `finalize_report_html` step is configured to require `report_html` in output

### The Specific Gap
The `finalize_report_html` prompt template says:
```
Step 7 data ({{step7}}):
- "sections_html": string
...
Step 8 data ({{step8}}):
- "tables": object
```

But the prompt template uses **hardcoded step numbers** based on `maxAIStep + 1` and `maxAIStep + 2`:
```typescript
// Line 712 in process-grant-guidelines/index.ts
prompt_template: `STEP ${maxAIStep + 3} — Finalize Report (HTML)
...
Step ${maxAIStep + 1} data ({{step${maxAIStep + 1}}}):
```

If the AI generates a pipeline with steps 0-6, then:
- `maxAIStep = 6`
- Assembly steps are numbered 7, 8, 9
- `finalize_report_html` (step 9) expects `{{step7}}` and `{{step8}}`

This is correct! But the **actual failure** was that the AI in Step 9 returned empty JSON instead of the expected structure.

---

## Solution: Add Assembly Step Validation to Pipeline Generator

### Proposed Changes

#### 1. Add Assembly Step Validation After Generation
In `process-grant-guidelines/index.ts`, after generating and enhancing prompts, add a validation pass specifically for assembly steps:

```typescript
// After line 607 (after quality enhancement)
console.log("Step 4.5: Validating assembly step consistency...");

function validateAssemblySteps(steps: any[], assemblySteps: any[]): string[] {
  const errors: string[] = [];
  const maxResearchStep = Math.max(...steps.map(s => s.step_number));
  
  // Check finalize_report_html references correct steps
  const finalizeStep = assemblySteps.find(s => s.step_name === "finalize_report_html");
  if (finalizeStep) {
    const prompt = finalizeStep.prompt_template;
    
    // Verify it references the two previous assembly steps
    const expectedHtmlStep = `{{step${maxResearchStep + 1}}}`;
    const expectedTablesStep = `{{step${maxResearchStep + 2}}}`;
    
    if (!prompt.includes(expectedHtmlStep)) {
      errors.push(`finalize_report_html missing reference to ${expectedHtmlStep}`);
    }
    if (!prompt.includes(expectedTablesStep)) {
      errors.push(`finalize_report_html missing reference to ${expectedTablesStep}`);
    }
    
    // Verify it mentions report_html in output schema
    if (!prompt.includes('"report_html"')) {
      errors.push("finalize_report_html OUTPUT SCHEMA missing 'report_html' field");
    }
  }
  
  return errors;
}
```

#### 2. Add Quality Flag for Critical Assembly Steps
Extend the quality scoring to flag assembly steps that don't include critical output fields:

```typescript
// In usePromptQuality.ts, add new check
criticalOutputField: number;  // 15 pts for assembly steps

// For finalize_report_html step specifically
criticalOutputField: 
  stepName === 'finalize_report_html' && !prompt.includes('"report_html"') ? 0 : 15
```

#### 3. Add UI Warning for Low-Quality Assembly Steps
In `InlinePipelineEditor.tsx`, add a special warning badge for assembly steps that may fail:

```tsx
// After PromptQualityBadge
{step.step_name === 'finalize_report_html' && 
 !step.prompt_template.includes('"report_html"') && (
  <Badge variant="destructive" className="ml-2">
    Missing report_html field
  </Badge>
)}
```

#### 4. Pre-flight Validation Before Publishing
Add a validation check when Super Admin attempts to publish a pipeline:

```typescript
// Before publishing grant version
const validatePipelineForPublish = (steps: PromptBundleStep[]): string[] => {
  const errors: string[] = [];
  
  const finalStep = steps.find(s => s.step_name === 'finalize_report_html');
  if (!finalStep) {
    errors.push("Pipeline missing finalize_report_html step");
  } else if (!finalStep.prompt_template.includes('"report_html"')) {
    errors.push("finalize_report_html step missing required 'report_html' output field");
  }
  
  return errors;
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-grant-guidelines/index.ts` | Add assembly step validation after prompt enhancement |
| `src/hooks/usePromptQuality.ts` | Add critical output field check for assembly steps |
| `src/components/admin/InlinePipelineEditor.tsx` | Add warning badge for finalize_report_html without report_html |
| `src/pages/admin/GrantEdit.tsx` | Add pre-flight validation before publishing pipeline |

---

## Alternative Quick Fix

If the immediate concern is preventing this specific failure, we can add a **runtime validation** in the pipeline generator that ensures the `finalize_report_html` prompt always contains the correct references:

```typescript
// After generating assembly steps (line 802)
// Ensure finalize_report_html has correct step references
const finalizeStepIdx = assemblySteps.findIndex(s => s.step_name === 'finalize_report_html');
if (finalizeStepIdx !== -1) {
  const prompt = assemblySteps[finalizeStepIdx].prompt_template;
  
  // Validate references exist
  if (!prompt.includes(`{{step${maxAIStep + 1}}}`) || !prompt.includes(`{{step${maxAIStep + 2}}}`)) {
    console.error("CRITICAL: finalize_report_html has incorrect step references!");
    // Regenerate with correct template
    assemblySteps[finalizeStepIdx].prompt_template = createHtmlAssemblySteps(maxAIStep)[2].prompt_template;
  }
}
```

---

## Expected Outcome

After implementing these changes:
1. Pipeline generator validates assembly step consistency before saving
2. UI shows warning badges for assembly steps missing critical fields
3. Publishing is blocked if validation fails
4. The specific "No step output found with 'report_html'" error cannot occur because:
   - The prompt is validated to include correct step references
   - The output schema is validated to include `report_html`
   - Pre-flight checks prevent publishing broken pipelines
