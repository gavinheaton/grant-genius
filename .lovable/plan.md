

## Fix: AI Pipeline QA Validator Producing False Positives

### Root Cause

The AI validator is incorrectly flagging valid backward step references as errors. Two factors cause this:

1. **Conflicting step labels in prompt text**: The prompt templates contain original pre-offset labels like "STEP 9" but the actual `step_number` is 13. The AI sees both and gets confused about numbering.

2. **AI arithmetic errors on large pipelines**: The validator AI must compare each `{{stepN}}` reference against the current step number to determine if it's a forward reference. With 22 steps and many cross-references, the AI makes arithmetic mistakes.

### Evidence

Actual step references in the database (all valid backward references):

```text
Step 13 (risk_register) refs: {{step8}}, {{step4}}     -- both < 13, VALID
Step 15 (report_assembly) refs: none                    -- VALID
Step 17 (qa_gates) refs: {{step0}}-{{step16}}           -- all < 17, VALID
Step 18 (assemble_sections) refs: {{step0}}-{{step17}}  -- all < 18, VALID
Step 20 (clean_citations) refs: {{step18}}, {{step19}}  -- both < 20, VALID
Step 21 (finalize_report) refs: {{step18}}, {{step20}}  -- both < 21, VALID
```

Yet the AI flagged step 17 as "self-referencing {{step17}}", steps 18-21 as "circular references", and step 15 as "forward reference to non-existent step". All incorrect.

### Fix

**Pre-compute reference validity in `buildStepForAnalysis`** so the AI receives a verified `reference_check` annotation per step and does not need to do arithmetic.

#### Changes to `supabase/functions/validate-pipeline/index.ts`

**1. Add reference pre-validation to `buildStepForAnalysis`**

For each step, compute which `{{stepN}}` variables it uses and classify each as:
- `valid` (N < current step number and step N exists)
- `forward_reference` (N >= current step number)
- `nonexistent` (step N does not exist in the pipeline)

Pass the total step count into the function so it can validate.

```typescript
function buildStepForAnalysis(s: PipelineStep, totalSteps: number) {
  // ... existing code ...
  
  // Pre-validate all {{stepN}} references
  const stepRefs = (base.variables_used as string[])
    .filter(v => /^step\d+$/.test(v))
    .map(v => {
      const n = parseInt(v.replace('step', ''));
      if (n >= totalSteps) return { ref: v, status: 'nonexistent' };
      if (n >= s.step_number) return { ref: v, status: 'forward_reference' };
      return { ref: v, status: 'valid' };
    });
  
  base.reference_check = {
    all_valid: stepRefs.every(r => r.status === 'valid'),
    details: stepRefs.filter(r => r.status !== 'valid'),
  };
  
  return base;
}
```

**2. Update system prompt to use pre-computed checks**

Add instruction telling the AI that `reference_check` is pre-computed and authoritative:

```
STEP REFERENCE VALIDATION:
Each step includes a "reference_check" field that has been pre-computed programmatically.
- If "all_valid" is true, ALL {{stepN}} references in that step are confirmed valid backward 
  references. Do NOT flag any data_flow issues for step references in that step.
- If "all_valid" is false, the "details" array lists the specific problematic references. 
  Only flag those specific references.
- Do NOT attempt your own arithmetic to validate step references. Trust the pre-computed check.

Also note: The "STEP N" label inside prompt text may differ from the actual step_number due to 
pipeline offset. Always use the step_number field, not the label in the prompt text.
```

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/validate-pipeline/index.ts` | Add reference pre-validation in `buildStepForAnalysis`; update system prompt to use pre-computed checks and stop doing its own arithmetic |

### Impact

- Eliminates all false positive "forward reference" and "circular reference" errors
- AI can focus on genuine semantic issues (redundancy, completeness, contract mismatches) instead of arithmetic
- Works for any pipeline size without degradation
